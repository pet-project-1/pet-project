import cv2
from ultralytics import YOLO

def main():
    print("모델 로딩 중...")
    # YOLO 모델 로드 (ONNX 파일을 로드해도 내부적으로 ONNXRuntime 엔진을 사용하여 빠르게 동작합니다)
    model = YOLO('yolov8n.onnx', task='detect')
    
    # 카메라 세팅
    # Pi Camera 모듈을 사용할 경우 인덱스를 0 또는 -1 등 상황에 맞게 변경해야 할 수 있습니다.
    cap = cv2.VideoCapture(0)
    
    if not cap.isOpened():
        print("에러: 카메라를 열 수 없습니다.")
        return

    print("카메라 구동 시작 (종료를 원하면 화면 클릭 후 'q' 키를 누르세요)")

    while True:
        ret, frame = cap.read()
        if not ret:
            print("에러: 프레임을 읽어올 수 없습니다.")
            break

        # YOLO 추론 (강아지 검출)
        # classes=[16] : COCO 데이터셋에서 강아지만 필터링
        # imgsz=320 : Pi 4b 속도를 위해 해상도를 320으로 제한
        results = model.predict(source=frame, classes=[16], conf=0.4, imgsz=320, verbose=False, device='cpu')
        for result in results:
            boxes = result.boxes
            for box in boxes:
                # Bounding Box 좌표 추출 (정수형 변환)
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                
                # 화면에 초록색 네모 박스 그리기
                cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
                
                # 텍스트 ('Dog') 배경 및 글씨 쓰기
                label = "Dog"
                (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.7, 2)
                cv2.rectangle(frame, (x1, y1 - 20), (x1 + tw, y1), (0, 255, 0), -1)
                cv2.putText(frame, label, (x1, y1 - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 0), 2)

        # 화면 출력
        cv2.imshow("YOLOv8 Dog Detection (Pi 4b)", frame)
        
        # 'q' 키를 누르면 루프 탈출
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    # 자원 해제
    cap.release()
    cv2.destroyAllWindows()
    print("프로그램이 종료되었습니다.")

if __name__ == "__main__":
    main()