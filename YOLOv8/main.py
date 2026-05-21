import os
import time
import cv2
from picamera2 import Picamera2
from ultralytics import YOLO

# 검출된 프레임을 디스크에 저장하고 싶을 때 경로 지정 (None이면 저장 안 함)
SAVE_DIR = "./captures"
SAVE_EVERY_N_DETECTIONS = 30  # N번째 검출마다 저장 (스팸 방지)

CAPTURE_SIZE = (3280, 2464)


def main():
    print("모델 로딩 중...")
    model = YOLO('yolov8n.onnx', task='detect')

    if SAVE_DIR:
        os.makedirs(SAVE_DIR, exist_ok=True)

    picam2 = Picamera2()
    # picamera2 format 'RGB888'은 메모리 레이아웃이 B,G,R 순 → numpy 배열이 OpenCV BGR과 호환
    config = picam2.create_video_configuration(
        main={"size": CAPTURE_SIZE, "format": "RGB888"}
    )
    picam2.configure(config)
    picam2.start()
    time.sleep(0.5)  # 센서 워밍업

    print("카메라 구동 시작 (Ctrl+C 로 종료)")

    frame_idx = 0
    detection_idx = 0
    try:
        while True:
            frame = picam2.capture_array()
            frame_idx += 1

            results = model.predict(
                source=frame, classes=[16], conf=0.4,
                imgsz=320, verbose=False, device='cpu',
            )

            detections = []
            for result in results:
                for box in result.boxes:
                    x1, y1, x2, y2 = map(int, box.xyxy[0])
                    conf = float(box.conf[0])
                    detections.append((x1, y1, x2, y2, conf))

            if detections:
                detection_idx += 1
                print(f"[frame {frame_idx}] dogs={len(detections)} "
                      f"{[(d[:4], round(d[4], 2)) for d in detections]}")

                if SAVE_DIR and detection_idx % SAVE_EVERY_N_DETECTIONS == 0:
                    for x1, y1, x2, y2, _ in detections:
                        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
                    fname = f"{SAVE_DIR}/dog_{int(time.time())}.jpg"
                    cv2.imwrite(fname, frame)
                    print(f"  saved: {fname}")
    except KeyboardInterrupt:
        print("\n종료 신호 받음.")
    finally:
        picam2.stop()
        print("프로그램이 종료되었습니다.")


if __name__ == "__main__":
    main()
