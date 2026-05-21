"""YOLO 검출 + OSNet 재식별 + Supabase Realtime 송출 (Pi 진입점).

3-스레드 파이프라인:
- capture_loop  : Picamera2 → raw 프레임 슬롯에 덮어쓰기 (카메라 FPS 그대로)
- infer_loop    : raw 슬롯에서 최신 프레임 꺼내 YOLO ByteTrack + OSNet 임베딩
                  → detection 스냅샷 슬롯에 publish
- broadcast_loop: raw 슬롯 + detection 슬롯을 함께 읽어 주기적으로 Supabase 송출

ReID 정책 (자동 등록 X):
- 갤러리 매칭 실패하면 'Unknown' 라벨 + pending_features[tid] 보관
- 사용자가 웹 UI 에서 등록을 누르면 외부에서 register_pending(tid, name) 호출
  → 그 때만 갤러리에 들어감
"""
import os
import sys
import time
import threading
from collections import Counter, deque

import cv2
import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image
from torchvision import transforms
from ultralytics import YOLO
from picamera2 import Picamera2

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.append(os.path.join(_HERE, "deep-person-reid"))
sys.path.append(os.path.join(_HERE, "..", "YOLOv8"))
import torchreid  # noqa: E402
from supabase_realtime_client import SupabaseFrameBroadcaster  # noqa: E402

from feeder_api import (
    start_in_thread as start_http_api,
    fetch_dogs_with_embedding,
    insert_unregistered_access_alert,
    resolve_alert,
)


def _first_existing(*paths, fallback=None):
    for p in paths:
        if os.path.exists(p):
            return p
    return fallback


YOLO_WEIGHTS = _first_existing(
    os.path.join(_HERE, "..", "YOLOv8", "yolov8n.onnx"),  # Pi 에서 빠름 (있을 때)
    os.path.join(_HERE, "models", "yolov8n.pt"),          # smart_feeder 자체 보유분
    fallback=os.path.join(_HERE, "models", "yolov8n.pt"),
)
OSNET_WEIGHTS = os.path.join(_HERE, "models", "osnet_x0_25_augmented_model.pth.tar-200")
# Pi 자기 디바이스 식별자 — supabase_realtime_client 의 broadcast 토픽 (feeder:<id>) 과
# 웹의 VITE_FEEDER_*_DEVICE_ID 와 모두 동일해야 함.
FEEDER_DEVICE_ID = os.getenv("FEEDER_DEVICE_ID", "feeder-1")
# OSNet classifier head 출력 인덱스 (0..N-1) ↔ breed 라벨 매핑.
# 파일 한 줄 = 한 라벨. 라벨을 uppercase + 공백→_ 로 변환한 게 supabase breeds.code.
BREED_LABELS_PATH = _first_existing(
    os.path.join(_HERE, "breed_labels.txt"),
    os.path.join(_HERE, "..", "dog_breeds.txt"),
    fallback=os.path.join(_HERE, "..", "dog_breeds.txt"),
)
# bytetrack yaml: 로컬 → YOLOv8/ → ultralytics 내장 기본값 순으로 시도
BYTETRACK_YAML = _first_existing(
    os.path.join(_HERE, "custom_bytetrack.yaml"),
    os.path.join(_HERE, "..", "YOLOv8", "custom_bytetrack.yaml"),
    fallback="bytetrack.yaml",
)

CAPTURE_SIZE = (3280, 2464)
STREAM_SIZE = (820, 616)
BROADCAST_INTERVAL_SEC = 0.15

MISS_TTL = 2
MIN_HITS_TO_SHOW = 2

DIST_THRESHOLD = 0.6
EMA_ALPHA = 0.9
VOTE_WINDOW = 15
# Pi CPU 에선 inference 가 ~0.3 fps 라 8 프레임은 25초+. 첫 라벨 빨리 뜨도록 3 으로.
# vote_window=15 가 그 뒤로 노이즈를 잡아줌.
WARMUP_FRAMES = 3
MIN_BBOX_SIZE = 50

# pending 객체가 카메라에서 사라진 채로 이 시간이 지나면 자동 만료.
# (사용자가 등록하지 않은 false positive 가 영구히 누적되는 걸 방지.)
PENDING_TTL_SEC = 60
# 등록된 갤러리 feature 와 거리가 이 값 미만인 다른 pending tid 는 "같은 개체"로 보고
# commit_registration 시 같이 정리. 보통 DIST_THRESHOLD 와 동일하게 두면 됨.
PENDING_DEDUP_DIST = DIST_THRESHOLD

UNKNOWN_LABEL = "Unknown"


def _load_breed_codes(path):
    """파일 한 줄 = 한 라벨 → uppercase + 공백 _ 변환해서 breed_code list 로 반환.
    OSNet classifier head 의 클래스 인덱스 0..N-1 과 순서가 정확히 일치해야 함.
    """
    if not os.path.exists(path):
        print(f"[breeds] label file not found: {path} — breed prediction 비활성")
        return []
    with open(path, "r", encoding="utf-8") as f:
        labels = [line.strip() for line in f if line.strip()]
    codes = [label.replace(" ", "_").upper() for label in labels]
    print(f"[breeds] loaded {len(codes)} labels from {path}")
    return codes


def _encode_thumbnail(crop_bgr, max_side=200, jpeg_quality=80):
    """pending 미리보기용으로 crop 을 줄여서 JPEG bytes 로 인코딩."""
    h, w = crop_bgr.shape[:2]
    if h <= 0 or w <= 0:
        return None
    scale = min(1.0, max_side / max(h, w))
    if scale < 1.0:
        crop_bgr = cv2.resize(
            crop_bgr,
            (int(w * scale), int(h * scale)),
            interpolation=cv2.INTER_AREA,
        )
    ok, buf = cv2.imencode(".jpg", crop_bgr, [cv2.IMWRITE_JPEG_QUALITY, jpeg_quality])
    return bytes(buf) if ok else None


class _FrameSlot:
    """덮어쓰기 단일 슬롯 + counter 로 'new frame?' 판단."""

    def __init__(self):
        self._lock = threading.Lock()
        self._frame = None
        self._counter = 0

    def put(self, frame):
        with self._lock:
            self._frame = frame
            self._counter += 1

    def get_latest(self):
        with self._lock:
            return self._frame, self._counter


class _Slot:
    def __init__(self, init=None):
        self._lock = threading.Lock()
        self._v = init

    def put(self, v):
        with self._lock:
            self._v = v

    def get(self):
        with self._lock:
            return self._v


class SmartFeederReID:
    """OSNet 임베딩 + 갤러리 매칭. 자동 등록은 하지 않음."""

    def __init__(self, weight_path=OSNET_WEIGHTS):
        self.device = "cpu"
        self.breed_codes = _load_breed_codes(BREED_LABELS_PATH)
        num_classes = len(self.breed_codes) or 130
        self.model = torchreid.models.build_model(
            name="osnet_x0_25", num_classes=num_classes, loss="triplet", pretrained=False
        )
        torchreid.utils.load_pretrained_weights(self.model, weight_path)
        self.model.to(self.device).eval()

        self.transform = transforms.Compose([
            transforms.Resize((256, 256)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406],
                                 std=[0.229, 0.224, 0.225]),
        ])

        # 아래 상태들 모두 self._lock 으로 보호 — register_pending (HTTP 스레드) 와
        # process_crop/cleanup (infer 스레드) 사이 race 방지.
        # OSNet 추론(extract_feature) 은 lock 밖에서 실행.
        self._lock = threading.Lock()
        self.gallery_db = {}                # name → feature
        self.dog_ids = {}                   # name → supabase dogs.id (uuid)
        self.pending_features = {}          # tid → 등록 대기용 평균 feature
        self.pending_last_seen = {}         # tid → time.time() of last update (TTL 기준)
        self.pending_crops = {}             # tid → JPEG bytes (UI 썸네일)
        self.pending_alert_ids = {}         # tid → supabase alerts.id (in-flight 면 키 부재)
        self.breed_vote_buffer = {}         # tid → deque[breed_idx] (pending 동안 누적)
        self.vote_buffer = {}               # tid → deque[raw_id]
        self.warmup_buffer = {}             # tid → list[feat]
        self.stable_ids = {}                # tid → 'Unknown' | '<name>'

    def extract_feature(self, crop_bgr):
        """OSNet 1 회 forward 로 (l2-normalized feature, breed_idx) 반환.
        crop 무효이면 (None, None). breed_idx 는 classifier head argmax — 0..N-1.
        breed_codes 가 비어있으면 (라벨 파일 없음) breed_idx 만 None.
        """
        h, w = crop_bgr.shape[:2]
        if h <= 0 or w <= 0:
            return None, None
        side = max(h, w)
        padded = np.zeros((side, side, 3), dtype=np.uint8)
        padded[(side - h) // 2:(side - h) // 2 + h,
               (side - w) // 2:(side - w) // 2 + w] = crop_bgr
        rgb = cv2.cvtColor(padded, cv2.COLOR_BGR2RGB)
        inp = self.transform(Image.fromarray(rgb)).unsqueeze(0).to(self.device)
        with torch.no_grad():
            v = self.model(inp)          # post-FC feature (eval 모드)
            feat = F.normalize(v, p=2, dim=1)
            if self.breed_codes:
                logits = self.model.classifier(v)
                breed_idx = int(logits.argmax(dim=1).item())
            else:
                breed_idx = None
        return feat, breed_idx

    def _match_locked(self, feat):
        """caller 가 self._lock 을 들고 있어야 함. 임계값 안쪽이면 name 반환, 아니면 None.
        매칭 성공 시 EMA 로 갤러리 feature 갱신.
        """
        if not self.gallery_db:
            return None
        min_dist, best = float("inf"), None
        for name, db_feat in self.gallery_db.items():
            d = torch.norm(feat - db_feat).item()
            if d < min_dist:
                min_dist, best = d, name
        if min_dist > DIST_THRESHOLD:
            return None
        if min_dist < DIST_THRESHOLD * 0.7:
            upd = EMA_ALPHA * self.gallery_db[best] + (1 - EMA_ALPHA) * feat
            self.gallery_db[best] = F.normalize(upd, p=2, dim=1)
        return best

    def process_crop(self, tid, crop_bgr):
        """infer_thread 에서 호출. 반환값:
        - None  : 아직 워밍업 중 (라벨 미정)
        - str   : 'Unknown' 또는 갤러리 이름
        """
        feat, breed_idx = self.extract_feature(crop_bgr)  # OSNet 추론 — lock 밖
        if feat is None:
            with self._lock:
                return self.stable_ids.get(tid)

        with self._lock:
            if tid not in self.stable_ids:
                # 워밍업 — WARMUP_FRAMES 만큼 모은 뒤 평균으로 첫 판정
                self.warmup_buffer.setdefault(tid, []).append(feat)
                if len(self.warmup_buffer[tid]) < WARMUP_FRAMES:
                    return None
                stacked = torch.cat(self.warmup_buffer[tid], dim=0)
                query = F.normalize(stacked.mean(dim=0, keepdim=True), p=2, dim=1)
                del self.warmup_buffer[tid]
            else:
                query = feat

            match = self._match_locked(query)
            raw_id = match if match is not None else UNKNOWN_LABEL

            buf = self.vote_buffer.setdefault(tid, deque(maxlen=VOTE_WINDOW))
            buf.append(raw_id)
            stable_id = Counter(buf).most_common(1)[0][0]
            self.stable_ids[tid] = stable_id

            is_new_pending = False
            if stable_id == UNKNOWN_LABEL:
                old = self.pending_features.get(tid)
                if old is None:
                    is_new_pending = True
                    self.pending_features[tid] = query
                else:
                    upd = EMA_ALPHA * old + (1 - EMA_ALPHA) * query
                    self.pending_features[tid] = F.normalize(upd, p=2, dim=1)
                self.pending_last_seen[tid] = time.time()
                thumb = _encode_thumbnail(crop_bgr)
                if thumb is not None:
                    self.pending_crops[tid] = thumb
                if breed_idx is not None:
                    bbuf = self.breed_vote_buffer.setdefault(
                        tid, deque(maxlen=VOTE_WINDOW)
                    )
                    bbuf.append(breed_idx)
            else:
                # Unknown → 매칭으로 전이된 경우. 떠 있던 alert 가 있으면 resolve.
                self.pending_features.pop(tid, None)
                self.pending_last_seen.pop(tid, None)
                self.pending_crops.pop(tid, None)
                self.breed_vote_buffer.pop(tid, None)
                matched_alert_id = self.pending_alert_ids.pop(tid, None)
                if matched_alert_id:
                    self._spawn_resolve(matched_alert_id)

        # 락 밖에서 async insert — HTTP 가 infer 스레드를 블로킹하지 않도록.
        if is_new_pending:
            threading.Thread(
                target=self._async_insert_alert,
                args=(tid,),
                name=f"alert-insert-{tid}",
                daemon=True,
            ).start()
        return stable_id

    def cleanup(self, alive_tids):
        # pending_features 는 의도적으로 제외 — 카메라 밖으로 나가도 사용자가 UI 에서
        # 등록할 때까지 보존. 단, PENDING_TTL_SEC 초 동안 갱신이 없으면 (= 카메라에서
        # 사라진 채 방치되면) 자동 만료해서 false positive 누적을 방지.
        now = time.time()
        expired = []
        alert_ids_to_resolve = []
        with self._lock:
            for buf in (self.vote_buffer, self.warmup_buffer, self.stable_ids):
                for k in [k for k in buf if k not in alive_tids]:
                    del buf[k]
            expired = [
                tid for tid, ts in self.pending_last_seen.items()
                if now - ts > PENDING_TTL_SEC
            ]
            for tid in expired:
                self.pending_features.pop(tid, None)
                self.pending_last_seen.pop(tid, None)
                self.pending_crops.pop(tid, None)
                self.breed_vote_buffer.pop(tid, None)
                aid = self.pending_alert_ids.pop(tid, None)
                if aid:
                    alert_ids_to_resolve.append(aid)
        if expired:
            print(f"[PENDING] expired (>{PENDING_TTL_SEC}s unseen): {expired}")
        for aid in alert_ids_to_resolve:
            self._spawn_resolve(aid)

    def snapshot_stable(self):
        with self._lock:
            return dict(self.stable_ids)

    # ── 외부 API (HTTP 서버에서 호출) ──────────────────
    def take_pending_feature(self, tid):
        """pending_features[tid] 의 feature 를 list[float] 로 복사해서 반환 (pop 아님).
        Supabase insert 전에 미리 데이터를 꺼내기 위한 read-only 헬퍼.
        """
        with self._lock:
            feat = self.pending_features.get(tid)
            if feat is None:
                return None
            return feat.squeeze(0).cpu().tolist()

    def commit_registration(self, tid, name, dog_id):
        """Supabase insert 성공한 뒤 호출 — 로컬 gallery + dog_ids 에 반영.
        성공 시 (True, None), 실패 시 (False, error_str).
        같은 개체로 추정되는 다른 pending tid (feature 거리 < PENDING_DEDUP_DIST) 도 같이 정리.
        등록된 tid + dedup 된 tid 의 alert 들은 resolved_at 처리.
        """
        name = (name or "").strip()
        if not name:
            return False, "name is empty"
        dup_tids = []
        alert_ids_to_resolve = []
        with self._lock:
            feat = self.pending_features.get(tid)
            if feat is None:
                return False, f"no pending feature for track_id={tid}"
            if name in self.gallery_db:
                return False, f"name '{name}' already exists locally"

            self.pending_features.pop(tid, None)
            self.pending_last_seen.pop(tid, None)
            self.pending_crops.pop(tid, None)
            self.breed_vote_buffer.pop(tid, None)
            aid = self.pending_alert_ids.pop(tid, None)
            if aid:
                alert_ids_to_resolve.append(aid)
            self.gallery_db[name] = feat
            self.dog_ids[name] = dog_id
            self.vote_buffer[tid] = deque([name] * VOTE_WINDOW, maxlen=VOTE_WINDOW)
            self.stable_ids[tid] = name

            dup_tids = [
                other for other, other_feat in self.pending_features.items()
                if torch.norm(feat - other_feat).item() < PENDING_DEDUP_DIST
            ]
            for d in dup_tids:
                self.pending_features.pop(d, None)
                self.pending_last_seen.pop(d, None)
                self.pending_crops.pop(d, None)
                self.breed_vote_buffer.pop(d, None)
                aid = self.pending_alert_ids.pop(d, None)
                if aid:
                    alert_ids_to_resolve.append(aid)
        for aid in alert_ids_to_resolve:
            self._spawn_resolve(aid)
        if dup_tids:
            print(f"[GALLERY] cleared duplicate pending tids: {dup_tids}")
        print(f"[GALLERY] registered '{name}' (dog_id={dog_id}) for tid={tid}")
        return True, None

    def load_from_supabase_rows(self, rows):
        """기동 시 Supabase dogs 테이블에서 가져온 행들로 갤러리 채움.
        rows: [{"id": uuid, "name": str, "embedding": list[float] | str}, ...]
        """
        added = 0
        with self._lock:
            for row in rows:
                emb = row.get("embedding")
                name = row.get("name")
                did = row.get("id")
                if not emb or not name or not did:
                    continue
                if isinstance(emb, str):
                    try:
                        emb = [float(x) for x in emb.strip("[]").split(",") if x]
                    except ValueError:
                        continue
                if not emb:
                    continue
                feat = torch.tensor(emb, dtype=torch.float32).unsqueeze(0)
                feat = F.normalize(feat, p=2, dim=1)
                self.gallery_db[name] = feat
                self.dog_ids[name] = did
                added += 1
        print(f"[GALLERY] loaded {added} dogs from Supabase (total={len(self.gallery_db)})")
        return added

    def unregister(self, name):
        with self._lock:
            if name not in self.gallery_db:
                return False
            del self.gallery_db[name]
            self.dog_ids.pop(name, None)
            for tid in list(self.stable_ids.keys()):
                if self.stable_ids[tid] == name:
                    del self.stable_ids[tid]
                    self.vote_buffer.pop(tid, None)
        print(f"[GALLERY] unregistered '{name}'")
        return True

    def _async_insert_alert(self, tid):
        """daemon thread 에서 호출 — Supabase alerts insert 후 alert_id 를 저장.
        HTTP 가 끝나는 동안 tid 가 이미 등록/만료된 경우 즉시 같은 alert 를 resolve.
        """
        alert_id = insert_unregistered_access_alert(FEEDER_DEVICE_ID, tid)
        if alert_id is None:
            return
        should_resolve_now = False
        with self._lock:
            if tid in self.pending_features:
                self.pending_alert_ids[tid] = alert_id
            else:
                # HTTP 응답 도착 전에 commit/expire 가 먼저 일어난 race — orphan 방지.
                should_resolve_now = True
        if should_resolve_now:
            resolve_alert(alert_id)

    def _spawn_resolve(self, alert_id):
        if alert_id:
            threading.Thread(
                target=resolve_alert,
                args=(alert_id,),
                name=f"alert-resolve-{alert_id[:8]}",
                daemon=True,
            ).start()

    def list_pending(self):
        """UI 용 pending 항목 리스트. 각 항목:
        {"track_id": int, "expires_in_sec": int, "has_thumbnail": bool,
         "predicted_breed_code": str | None}
        expires_in_sec 은 마지막 갱신 후 남은 TTL (카메라에 다시 잡히면 리셋).
        predicted_breed_code 는 breed_vote_buffer 의 다수결 + breed_codes 매핑.
        """
        with self._lock:
            now = time.time()
            items = []
            for tid in sorted(self.pending_features.keys()):
                last_seen = self.pending_last_seen.get(tid, now)
                expires_in = max(0, int(PENDING_TTL_SEC - (now - last_seen)))
                bbuf = self.breed_vote_buffer.get(tid)
                predicted = None
                if bbuf and self.breed_codes:
                    idx, _ = Counter(bbuf).most_common(1)[0]
                    if 0 <= idx < len(self.breed_codes):
                        predicted = self.breed_codes[idx]
                items.append({
                    "track_id": tid,
                    "expires_in_sec": expires_in,
                    "has_thumbnail": tid in self.pending_crops,
                    "predicted_breed_code": predicted,
                })
            return items

    def get_pending_thumbnail(self, tid):
        with self._lock:
            return self.pending_crops.get(tid)

    def list_gallery(self):
        with self._lock:
            return [
                {"name": n, "dog_id": self.dog_ids.get(n)}
                for n in sorted(self.gallery_db.keys())
            ]


def capture_loop(picam2, raw_slot, counters, stop_event):
    while not stop_event.is_set():
        frame = picam2.capture_array()
        raw_slot.put(frame)
        counters["captured"] += 1


def infer_loop(yolo, reid, raw_slot, det_slot, counters, stop_event):
    track_state = {}
    last_counter = -1

    while not stop_event.is_set():
        frame, counter = raw_slot.get_latest()
        if frame is None or counter == last_counter:
            if stop_event.wait(0.03):
                break
            continue
        last_counter = counter

        results = yolo.track(
            source=frame, persist=True, classes=[16],
            conf=0.12, iou=0.6, imgsz=640,
            verbose=False, device="cpu",
            tracker=BYTETRACK_YAML,
        )
        counters["inferred"] += 1

        seen_ids = set()
        for r in results:
            if r.boxes is None:
                continue
            for b in r.boxes:
                if b.id is None:
                    continue
                tid = int(b.id.item())
                x1, y1, x2, y2 = map(int, b.xyxy[0].tolist())
                conf = float(b.conf[0].item())
                seen_ids.add(tid)

                st = track_state.get(tid)
                if st is None:
                    track_state[tid] = {
                        "bbox": (x1, y1, x2, y2),
                        "conf": conf, "miss": 0, "hits": 1,
                    }
                else:
                    st["bbox"] = (x1, y1, x2, y2)
                    st["conf"] = conf
                    st["miss"] = 0
                    st["hits"] += 1

                if (
                    track_state[tid]["hits"] >= MIN_HITS_TO_SHOW
                    and (x2 - x1) >= MIN_BBOX_SIZE
                    and (y2 - y1) >= MIN_BBOX_SIZE
                ):
                    reid.process_crop(tid, frame[y1:y2, x1:x2])

        for tid in list(track_state.keys()):
            if tid not in seen_ids:
                track_state[tid]["miss"] += 1
                if track_state[tid]["miss"] > MISS_TTL:
                    del track_state[tid]

        reid.cleanup(set(track_state.keys()))

        stable_map = reid.snapshot_stable()
        snapshot = []
        for tid, st in track_state.items():
            if st["hits"] < MIN_HITS_TO_SHOW:
                continue
            snapshot.append({
                "tid": tid,
                "bbox": st["bbox"],          # CAPTURE_SIZE 좌표
                "conf": st["conf"],
                "miss": st["miss"],
                "stable_id": stable_map.get(tid),  # None 이면 워밍업 중
            })
        det_slot.put(snapshot)

        if snapshot:
            n_known = sum(1 for d in snapshot
                          if d["stable_id"] and d["stable_id"] != UNKNOWN_LABEL)
            n_unk = sum(1 for d in snapshot if d["stable_id"] == UNKNOWN_LABEL)
            print(
                f"[{int(time.time())}] tracking={len(snapshot)} "
                f"known={n_known} unknown={n_unk} gallery={len(reid.list_gallery())}"
            )


def broadcast_loop(broadcaster, raw_slot, det_slot, counters, stop_event):
    scale_x = STREAM_SIZE[0] / CAPTURE_SIZE[0]
    scale_y = STREAM_SIZE[1] / CAPTURE_SIZE[1]
    stream_w, stream_h = STREAM_SIZE

    while not stop_event.is_set():
        start = time.time()

        frame, _ = raw_slot.get_latest()
        dets_snap = det_slot.get() or []

        if frame is not None:
            disp = cv2.resize(frame, STREAM_SIZE, interpolation=cv2.INTER_AREA)

            broadcast_dets = []
            for det in dets_snap:
                tid = det["tid"]
                ox1, oy1, ox2, oy2 = det["bbox"]
                x1 = int(ox1 * scale_x)
                y1 = int(oy1 * scale_y)
                x2 = int(ox2 * scale_x)
                y2 = int(oy2 * scale_y)

                is_missing = det["miss"] > 0
                stable_id = det["stable_id"]

                if stable_id is None:
                    label = f"warming {tid}"
                    bcast_class = "warming"
                elif stable_id == UNKNOWN_LABEL:
                    label = f"Unknown #{tid}"
                    bcast_class = UNKNOWN_LABEL
                else:
                    label = stable_id
                    bcast_class = stable_id

                if stable_id == UNKNOWN_LABEL:
                    color = (0, 165, 255) if not is_missing else (0, 120, 200)  # 주황
                else:
                    color = (0, 255, 0) if not is_missing else (0, 180, 0)

                cv2.rectangle(disp, (x1, y1), (x2, y2), color, 2)
                (tw, _), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
                top = max(0, y1 - 22)
                cv2.rectangle(disp, (x1, top), (x1 + tw + 6, top + 22), color, -1)
                cv2.putText(
                    disp, label, (x1 + 3, top + 16),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 0), 2,
                )

                broadcast_dets.append({
                    "track_id": tid,
                    "x": x1 / stream_w,
                    "y": y1 / stream_h,
                    "w": (x2 - x1) / stream_w,
                    "h": (y2 - y1) / stream_h,
                    "conf": round(det["conf"], 3),
                    "class": bcast_class,
                    "stale": is_missing,
                })

            status = "detecting" if broadcast_dets else "idle"
            if broadcaster.send_frame(disp, detections=broadcast_dets, status=status):
                counters["sent"] += 1

        elapsed = time.time() - start
        wait = BROADCAST_INTERVAL_SEC - elapsed
        if wait > 0:
            stop_event.wait(wait)


def main():
    print(f"모델 로딩 중... (yolo={YOLO_WEIGHTS}, tracker={BYTETRACK_YAML})")
    yolo = YOLO(YOLO_WEIGHTS, task="detect")
    reid = SmartFeederReID()

    # Supabase 에 이미 등록된 개체 복구
    reid.load_from_supabase_rows(fetch_dogs_with_embedding())

    broadcaster = SupabaseFrameBroadcaster(fps_limit=999)
    print(
        f"[debug] broadcaster.enabled={broadcaster.enabled}  "
        f"url_set={bool(broadcaster.url)}  key_set={bool(broadcaster.key)}  "
        f"topic={broadcaster.topic}  broadcast_interval={BROADCAST_INTERVAL_SEC}s"
    )

    picam2 = Picamera2()
    config = picam2.create_video_configuration(
        main={"size": CAPTURE_SIZE, "format": "RGB888"}
    )
    picam2.configure(config)
    picam2.start()
    time.sleep(0.5)

    print("카메라 구동 시작 (Ctrl+C 로 종료)")

    api_port = int(os.environ.get("FEEDER_API_PORT", "8765"))
    start_http_api(reid, port=api_port)

    raw_slot = _FrameSlot()
    det_slot = _Slot(init=[])
    counters = {"captured": 0, "inferred": 0, "sent": 0}
    stop_event = threading.Event()

    threads = [
        threading.Thread(target=capture_loop,
                         args=(picam2, raw_slot, counters, stop_event),
                         name="capture", daemon=True),
        threading.Thread(target=infer_loop,
                         args=(yolo, reid, raw_slot, det_slot, counters, stop_event),
                         name="infer", daemon=True),
        threading.Thread(target=broadcast_loop,
                         args=(broadcaster, raw_slot, det_slot, counters, stop_event),
                         name="broadcast", daemon=True),
    ]
    for t in threads:
        t.start()

    drop_attrs = ("drop_disabled", "drop_fps", "drop_encode", "drop_http", "drop_exc")
    prev = dict(counters)
    prev_drops = {k: getattr(broadcaster, k) for k in drop_attrs}
    prev_t = time.time()

    try:
        while not stop_event.is_set():
            if stop_event.wait(5.0):
                break
            now = time.time()
            elapsed = now - prev_t

            dc = counters["captured"] - prev["captured"]
            di = counters["inferred"] - prev["inferred"]
            ds = counters["sent"] - prev["sent"]

            drops_now = {k: getattr(broadcaster, k) for k in drop_attrs}
            dd = {k: drops_now[k] - prev_drops[k] for k in drop_attrs}

            print(
                f"[stats] {elapsed:.1f}s  "
                f"captured={dc} ({dc/elapsed:.1f} fps)  "
                f"inferred={di} ({di/elapsed:.1f} fps)  "
                f"sent={ds} ({ds/elapsed:.1f} fps)  "
                f"gallery={len(reid.list_gallery())} pending={len(reid.list_pending())}  "
                f"(disabled={dd['drop_disabled']} fps={dd['drop_fps']} "
                f"encode={dd['drop_encode']} http={dd['drop_http']} exc={dd['drop_exc']})"
            )
            prev = dict(counters)
            prev_drops = drops_now
            prev_t = now
    except KeyboardInterrupt:
        print("\n종료 신호 받음.")
    finally:
        stop_event.set()
        for t in threads:
            t.join(timeout=2.0)
        picam2.stop()
        print("카메라 종료.")


if __name__ == "__main__":
    main()
