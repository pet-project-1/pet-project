import cv2
import time
import os
import threading
from ultralytics import YOLO
from picamera2 import Picamera2
from flask import Flask, Response

MISS_TTL = 6
MIN_HITS_TO_SHOW = 2
SAVE_DIR = "./captures"
SAVE_EVERY_N_DETECTIONS = 10

CAPTURE_SIZE = (3280, 2464)
STREAM_SIZE = (820, 616)
JPEG_QUALITY = 70          # 낮출수록 대역폭↓ 화질↓
STREAM_PORT = 5000

app = Flask(__name__)
latest_frame = None
frame_lock = threading.Lock()


def detection_loop():
    global latest_frame

    print("모델 로딩 중...")
    model = YOLO("yolov8n.onnx", task="detect")

    if SAVE_DIR:
        os.makedirs(SAVE_DIR, exist_ok=True)

    picam2 = Picamera2()
    config = picam2.create_video_configuration(
        main={"size": CAPTURE_SIZE, "format": "RGB888"}
    )
    picam2.configure(config)
    picam2.start()
    time.sleep(0.5)

    print(f"카메라 구동 시작 — 브라우저에서 http://<IP>:{STREAM_PORT} 접속")

    scale_x = STREAM_SIZE[0] / CAPTURE_SIZE[0]
    scale_y = STREAM_SIZE[1] / CAPTURE_SIZE[1]

    track_state = {}
    detection_idx = 0

    try:
        while True:
            frame = picam2.capture_array()

            results = model.track(
                source=frame,
                persist=True,
                classes=[16],
                conf=0.12,
                iou=0.6,
                imgsz=640,
                verbose=False,
                device="cpu",
                tracker="custom_bytetrack.yaml"
            )

            seen_ids = set()

            for r in results:
                if r.boxes is None:
                    continue
                for b in r.boxes:
                    if b.id is None:
                        continue

                    tid = int(b.id.item())
                    x1, y1, x2, y2 = map(int, b.xyxy[0].tolist())
                    seen_ids.add(tid)

                    if tid not in track_state:
                        track_state[tid] = {"bbox": (x1, y1, x2, y2), "miss": 0, "hits": 1}
                    else:
                        track_state[tid]["bbox"] = (x1, y1, x2, y2)
                        track_state[tid]["miss"] = 0
                        track_state[tid]["hits"] += 1

            for tid in list(track_state.keys()):
                if tid not in seen_ids:
                    track_state[tid]["miss"] += 1
                    if track_state[tid]["miss"] > MISS_TTL:
                        del track_state[tid]

            # 스트리밍용 축소 프레임
            disp = cv2.resize(frame, STREAM_SIZE, interpolation=cv2.INTER_AREA)

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
                cv2.putText(disp, label, (x1 + 3, top + 16),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 2)

            # JPEG 인코딩 후 공유 버퍼에 저장
            _, buf = cv2.imencode('.jpg', disp,
                                  [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
            with frame_lock:
                latest_frame = buf.tobytes()

            if track_state:
                detected_count = sum(1 for st in track_state.values()
                                     if st["hits"] >= MIN_HITS_TO_SHOW)
                print(f"[{int(time.time())}] Tracking {detected_count} dogs")

                detection_idx += 1
                if SAVE_DIR and detection_idx % SAVE_EVERY_N_DETECTIONS == 0:
                    save_frame = frame.copy()
                    for tid2, st2 in track_state.items():
                        if st2["hits"] < MIN_HITS_TO_SHOW:
                            continue
                        sx1, sy1, sx2, sy2 = st2["bbox"]
                        cv2.rectangle(save_frame, (sx1, sy1), (sx2, sy2), (0, 255, 0), 3)
                        cv2.putText(save_frame, f"Dog {tid2}", (sx1, sy1 - 10),
                                    cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 255, 0), 3)
                    fname = f"{SAVE_DIR}/dog_{int(time.time())}.jpg"
                    cv2.imwrite(fname, save_frame)
                    print(f"  saved: {fname}")

    except KeyboardInterrupt:
        print("\n종료 신호 받음.")
    finally:
        picam2.stop()
        print("카메라 종료.")


def generate_mjpeg():
    while True:
        with frame_lock:
            if latest_frame is None:
                time.sleep(0.05)
                continue
            jpg = latest_frame

        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + jpg + b'\r\n')
        time.sleep(0.03)  # ~30fps cap (실제는 inference 속도에 바운드)


@app.route('/')
def index():
    return (
        '<html><body style="margin:0;background:#111;display:flex;'
        'justify-content:center;align-items:center;height:100vh">'
        f'<img src="/stream" style="max-width:100%;max-height:100vh">'
        '</body></html>'
    )


@app.route('/stream')
def stream():
    return Response(generate_mjpeg(),
                    mimetype='multipart/x-mixed-replace; boundary=frame')


if __name__ == "__main__":
    t = threading.Thread(target=detection_loop, daemon=True)
    t.start()
    app.run(host='0.0.0.0', port=STREAM_PORT, threaded=True)