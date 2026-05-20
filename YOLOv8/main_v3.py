import cv2
import threading
import time
from ultralytics import YOLO
from picamera2 import Picamera2

from supabase_realtime_client import SupabaseFrameBroadcaster

MISS_TTL = 2
MIN_HITS_TO_SHOW = 2
INFER_EVERY_N = 10

CAPTURE_SIZE = (3280, 2464)
STREAM_SIZE = (820, 616)

# 송출 스레드가 고정 주기로 최신 프레임을 보냄 (~6.7 fps)
BROADCAST_INTERVAL_SEC = 0.15


class _LatestFrame:
    """캡처 스레드가 덮어쓰고 송출 스레드가 가져가는 단일 슬롯."""

    def __init__(self):
        self._lock = threading.Lock()
        self._payload = None

    def update(self, frame, detections, status):
        with self._lock:
            self._payload = (frame, detections, status)

    def take(self):
        with self._lock:
            return self._payload


def capture_loop(picam2, model, latest, counters, stop_event):
    scale_x = STREAM_SIZE[0] / CAPTURE_SIZE[0]
    scale_y = STREAM_SIZE[1] / CAPTURE_SIZE[1]
    stream_w, stream_h = STREAM_SIZE

    track_state = {}
    frame_idx = 0

    while not stop_event.is_set():
        frame = picam2.capture_array()

        if frame_idx % INFER_EVERY_N == 0:
            results = model.track(
                source=frame,
                persist=True,
                classes=[16],
                conf=0.12,
                iou=0.6,
                imgsz=640,
                verbose=False,
                device="cpu",
                tracker="custom_bytetrack.yaml",
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

                    if tid not in track_state:
                        track_state[tid] = {
                            "bbox": (x1, y1, x2, y2),
                            "conf": conf,
                            "miss": 0,
                            "hits": 1,
                        }
                    else:
                        track_state[tid]["bbox"] = (x1, y1, x2, y2)
                        track_state[tid]["conf"] = conf
                        track_state[tid]["miss"] = 0
                        track_state[tid]["hits"] += 1

            for tid in list(track_state.keys()):
                if tid not in seen_ids:
                    track_state[tid]["miss"] += 1
                    if track_state[tid]["miss"] > MISS_TTL:
                        del track_state[tid]

            detected_count = sum(
                1 for st in track_state.values() if st["hits"] >= MIN_HITS_TO_SHOW
            )
            if detected_count > 0:
                print(f"[{int(time.time())}] Tracking {detected_count} dogs")

        # 송출용 축소 프레임 (매 캡처마다 새로 할당 → 스레드 간 race 없음)
        disp = cv2.resize(frame, STREAM_SIZE, interpolation=cv2.INTER_AREA)

        broadcast_dets = []
        for tid, st in track_state.items():
            if st["hits"] < MIN_HITS_TO_SHOW:
                continue

            ox1, oy1, ox2, oy2 = st["bbox"]
            x1 = int(ox1 * scale_x)
            y1 = int(oy1 * scale_y)
            x2 = int(ox2 * scale_x)
            y2 = int(oy2 * scale_y)

            is_missing = st["miss"] > 0
            color = (0, 255, 0) if not is_missing else (0, 180, 0)
            label = f"Dog {tid}"

            cv2.rectangle(disp, (x1, y1), (x2, y2), color, 2)
            (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.7, 2)
            top = max(0, y1 - 22)
            cv2.rectangle(disp, (x1, top), (x1 + tw + 6, top + 22), color, -1)
            cv2.putText(
                disp, label, (x1 + 3, top + 16),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 2,
            )

            broadcast_dets.append({
                "track_id": tid,
                "x": x1 / stream_w,
                "y": y1 / stream_h,
                "w": (x2 - x1) / stream_w,
                "h": (y2 - y1) / stream_h,
                "conf": round(st.get("conf", 0.0), 3),
                "class": "dog",
                "stale": is_missing,
            })

        status = "detecting" if broadcast_dets else "idle"
        latest.update(disp, broadcast_dets, status)
        counters["captured"] += 1
        frame_idx += 1


def broadcast_loop(broadcaster, latest, counters, stop_event):
    while not stop_event.is_set():
        start = time.time()
        payload = latest.take()
        if payload is not None:
            frame, dets, status = payload
            if broadcaster.send_frame(frame, detections=dets, status=status):
                counters["sent"] += 1

        elapsed = time.time() - start
        wait = BROADCAST_INTERVAL_SEC - elapsed
        if wait > 0:
            stop_event.wait(wait)


def main():
    print("모델 로딩 중...")
    model = YOLO("yolov8n.onnx", task="detect")
    # 송출 주기는 broadcast_loop 가 통제 — broadcaster 내부 fps 게이트는 사실상 무시.
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

    print("카메라 구동 시작 — Supabase Realtime 으로 송출 (Ctrl+C 로 종료)")

    latest = _LatestFrame()
    counters = {"captured": 0, "inferred": 0, "sent": 0}
    stop_event = threading.Event()

    cap_thread = threading.Thread(
        target=capture_loop,
        args=(picam2, model, latest, counters, stop_event),
        name="capture",
        daemon=True,
    )
    bcast_thread = threading.Thread(
        target=broadcast_loop,
        args=(broadcaster, latest, counters, stop_event),
        name="broadcast",
        daemon=True,
    )
    cap_thread.start()
    bcast_thread.start()

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
                f"[broadcast-stats] {elapsed:.1f}s  "
                f"captured={dc} ({dc/elapsed:.1f} fps)  "
                f"inferred={di}  "
                f"sent={ds} ({ds/elapsed:.1f} fps)  "
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
        cap_thread.join(timeout=2.0)
        bcast_thread.join(timeout=2.0)
        picam2.stop()
        print("카메라 종료.")


if __name__ == "__main__":
    main()
