import os
import sys
import time
import cv2
import torch
import torch.nn.functional as F
from PIL import Image
from torchvision import transforms
from ultralytics import YOLO
from collections import Counter, deque
import numpy as np

sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'deep-person-reid'))
import torchreid


class SmartFeederReID:
    def __init__(self, yolo_path='./models/yolov8n.pt', osnet_weight='./models/osnet_x0_25_augmented_model.pth.tar-200'):
        print("[INIT] system starting...")

        self.device = 'cpu'
        self.yolo_model = YOLO(yolo_path)

        self.osnet_model = torchreid.models.build_model(
            name='osnet_x0_25',
            num_classes=130,
            loss='triplet',
            pretrained=False
        )
        torchreid.utils.load_pretrained_weights(self.osnet_model, osnet_weight)
        self.osnet_model.to(self.device)
        self.osnet_model.eval()

        self.transform = transforms.Compose([
            transforms.Resize((256, 256)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406],
                                 std=[0.229, 0.224, 0.225])
        ])

        self.gallery_db   = {}       # dog_id → feature
        self.dog_counter  = 0

        # ── 하이퍼파라미터 ────────────────────────
        self.dist_threshold   = 0.6  # 낮출수록 엄격
        self.ema_alpha        = 0.9
        self.vote_window      = 15
        self.min_box_size     = 50
        self.frame_skip       = 3
        self.warmup_frames    = 8    # 등록 전 수집할 프레임 수

        # ── 트래커 관련 ───────────────────────────
        self.vote_buffer      = {}   # track_id → deque
        self.last_results     = {}   # track_id → (stable_id, x1,y1,x2,y2)
        self.warmup_buffer    = {}   # track_id → [feat, ...] (등록 대기)
        self.track_id_counter = 0
        self.active_tracks    = {}   # track_id → (cx, cy) 이전 위치

        print("[INIT] done.")

    # ── Feature ───────────────────────────────
    def extract_feature(self, cropped_img_bgr):
        h, w = cropped_img_bgr.shape[:2]
        max_side = max(h, w)
        padded = np.zeros((max_side, max_side, 3), dtype=np.uint8)
        padded[(max_side-h)//2:(max_side-h)//2+h,
               (max_side-w)//2:(max_side-w)//2+w] = cropped_img_bgr
        img_rgb = cv2.cvtColor(padded, cv2.COLOR_BGR2RGB)
        inp = self.transform(Image.fromarray(img_rgb)).unsqueeze(0).to(self.device)
        with torch.no_grad():
            feat = F.normalize(self.osnet_model(inp), p=2, dim=1)
        return feat

    # ── IoU 기반 트래킹 ───────────────────────
    def _iou(self, a, b):
        ax1,ay1,ax2,ay2 = a
        bx1,by1,bx2,by2 = b
        ix1,iy1 = max(ax1,bx1), max(ay1,by1)
        ix2,iy2 = min(ax2,bx2), min(ay2,by2)
        inter = max(0, ix2-ix1) * max(0, iy2-iy1)
        if inter == 0: return 0.0
        ua = (ax2-ax1)*(ay2-ay1) + (bx2-bx1)*(by2-by1) - inter
        return inter / ua

    def _match_tracks(self, detections):
        """detection bbox → track_id 매핑 (IoU 기반)"""
        if not self.active_tracks:
            matched = {}
            for det in detections:
                self.track_id_counter += 1
                tid = self.track_id_counter
                matched[tid] = det
                self.active_tracks[tid] = det
            return matched

        matched = {}
        used_tracks = set()

        for det in detections:
            best_iou, best_tid = 0.0, None
            for tid, prev_box in self.active_tracks.items():
                if tid in used_tracks:
                    continue
                iou = self._iou(det, prev_box)
                if iou > best_iou:
                    best_iou, best_tid = iou, tid

            if best_iou > 0.3:  # IoU 임계값
                matched[best_tid] = det
                used_tracks.add(best_tid)
            else:
                # 새 track 생성
                self.track_id_counter += 1
                tid = self.track_id_counter
                matched[tid] = det

        self.active_tracks = {tid: box for tid, box in matched.items()}
        return matched

    # ── Gallery ───────────────────────────────
    def _identify_or_register(self, query_feat):
        if not self.gallery_db:
            return self._register(query_feat)

        min_dist, best_id = float('inf'), None
        for dog_id, db_feat in self.gallery_db.items():
            d = torch.norm(query_feat - db_feat).item()
            if d < min_dist:
                min_dist, best_id = d, dog_id

        if min_dist > self.dist_threshold:
            print(f"[GALLERY] no match (dist={min_dist:.3f}), new registration")
            return self._register(query_feat)

        # EMA 갱신 — 충분히 가까울 때만
        if min_dist < self.dist_threshold * 0.7:
            updated = self.ema_alpha * self.gallery_db[best_id] + (1-self.ema_alpha) * query_feat
            self.gallery_db[best_id] = F.normalize(updated, p=2, dim=1)

        return best_id

    def _register(self, feature):
        self.dog_counter += 1
        new_id = f"Dog_{self.dog_counter:03d}"
        self.gallery_db[new_id] = feature
        print(f"[GALLERY] registered {new_id} (total={len(self.gallery_db)})")
        return new_id

    def _warmup_and_register(self, track_id, feat):
        """
        warmup_frames 동안 feature 모아서 평균으로 등록
        → 단일 프레임 노이즈 제거
        """
        if track_id not in self.warmup_buffer:
            self.warmup_buffer[track_id] = []
        self.warmup_buffer[track_id].append(feat)

        if len(self.warmup_buffer[track_id]) < self.warmup_frames:
            return None  # 아직 수집 중

        # 충분히 모였으면 평균 feature로 등록
        stacked = torch.cat(self.warmup_buffer[track_id], dim=0)
        mean_feat = F.normalize(stacked.mean(dim=0, keepdim=True), p=2, dim=1)
        del self.warmup_buffer[track_id]
        return self._identify_or_register(mean_feat)

    # ── Vote ──────────────────────────────────
    def _get_stable_id(self, raw_id, track_id):
        if track_id not in self.vote_buffer:
            self.vote_buffer[track_id] = deque(maxlen=self.vote_window)
        self.vote_buffer[track_id].append(raw_id)
        return Counter(self.vote_buffer[track_id]).most_common(1)[0][0]

    # ── Cleanup ───────────────────────────────
    def _cleanup(self, active_ids):
        for buf in [self.vote_buffer, self.last_results, self.warmup_buffer]:
            for k in [k for k in buf if k not in active_ids]:
                del buf[k]

    # ── Main Loop ─────────────────────────────
    def run_camera(self, camera_index=0):
        from picamera2 import Picamera2

        picam2 = Picamera2()
        config = picam2.create_video_configuration(
            main={"size": (640, 480), "format": "RGB888"}
        )
        picam2.configure(config)
        picam2.start()
        time.sleep(0.5)

        print("camera started. q=quit / r=reset gallery")
        frame_count = 0

        while True:
            frame = picam2.capture_array()

            frame_count += 1
            run_reid = (frame_count % self.frame_skip == 0)
            active_ids = set()

            if run_reid:
                results = self.yolo_model(frame, classes=[16], verbose=False, imgsz=640, device='cpu')
                detections = []
                for box in results[0].boxes:
                    x1,y1,x2,y2 = map(int, box.xyxy[0])
                    if (x2-x1) >= self.min_box_size and (y2-y1) >= self.min_box_size:
                        detections.append((x1,y1,x2,y2))

                matched = self._match_tracks(detections)

                for track_id, (x1,y1,x2,y2) in matched.items():
                    active_ids.add(track_id)
                    feat = self.extract_feature(frame[y1:y2, x1:x2])

                    # warmup 완료 전이면 수집만
                    if track_id in self.warmup_buffer or track_id not in [
                        tid for buf in [self.vote_buffer] for tid in buf
                        if self.vote_buffer.get(tid)
                    ]:
                        raw_id = self._warmup_and_register(track_id, feat)
                        if raw_id is None:
                            # 수집 중 — 이전 결과 유지
                            active_ids.add(track_id)
                            continue
                    else:
                        raw_id = self._identify_or_register(feat)

                    stable_id = self._get_stable_id(raw_id, track_id)
                    self.last_results[track_id] = (stable_id, x1, y1, x2, y2)

                self._cleanup(active_ids)

            # 시각화
            for tid, (stable_id, x1, y1, x2, y2) in self.last_results.items():
                color = self._id_to_color(stable_id)
                cv2.rectangle(frame, (x1,y1), (x2,y2), color, 2)
                cv2.putText(frame, stable_id, (x1, y1-8),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)
                # warmup 중 표시
                if tid in self.warmup_buffer:
                    n = len(self.warmup_buffer[tid])
                    cv2.putText(frame, f"warming {n}/{self.warmup_frames}",
                                (x1, y2+18), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (180,180,180), 1)

            cv2.putText(frame, f"gallery={len(self.gallery_db)}",
                        (10,25), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (220,220,220), 1)
            cv2.imshow('SmartFeeder', frame)

            key = cv2.waitKey(1) & 0xFF
            if key == ord('q'):
                print("[EXIT] stopped")
                break
            elif key == ord('r'):
                self.gallery_db.clear()
                self.vote_buffer.clear()
                self.last_results.clear()
                self.warmup_buffer.clear()
                self.active_tracks.clear()
                self.dog_counter = 0
                print("[RESET] gallery cleared")

        picam2.stop()
        cv2.destroyAllWindows()

    @staticmethod
    def _id_to_color(dog_id):
        h = hash(dog_id) & 0xFFFFFF
        return (h & 0xFF, (h >> 8) & 0xFF, (h >> 16) & 0xFF)


if __name__ == '__main__':
    feeder = SmartFeederReID()
    feeder.run_camera()