"""Supabase Realtime broadcast 송출기.

라즈베리파이에서 YOLO 추론 결과(annotated JPEG + bbox 메타)를
Supabase Realtime 으로 푸시한다. 웹 클라이언트는 `feeder:<device_id>` 토픽을
구독해 실시간으로 영상을 받는다.

HTTPS REST 엔드포인트(`/realtime/v1/api/broadcast`) 를 사용해
Python 쪽에서 장기 WebSocket 을 유지하지 않는다 — 추론 루프와 잘 어울리고
연결 끊김도 매 요청마다 자동 재시도된다.

필요한 환경 변수:
    SUPABASE_URL            예: https://abcdef.supabase.co
    SUPABASE_SERVICE_KEY    service_role 키 (RLS 우회 — 절대 브라우저에 노출 금지)
    FEEDER_DEVICE_ID        토픽 식별자 (웹의 VITE_FEEDER_*_DEVICE_ID 와 일치)
    FEEDER_FPS_LIMIT        초당 송출 프레임 상한 (기본 6)
    FEEDER_JPEG_QUALITY     JPEG 품질 1~100 (기본 60)
    FEEDER_STREAM_WIDTH     송출 전 축소 폭 (기본 640)
"""
from __future__ import annotations

import base64
import os
import threading
import time
from typing import Iterable, Optional

import cv2
import numpy as np
import requests


class SupabaseFrameBroadcaster:
    def __init__(
        self,
        url: Optional[str] = None,
        key: Optional[str] = None,
        device_id: Optional[str] = None,
        fps_limit: Optional[float] = None,
        jpeg_quality: Optional[int] = None,
        stream_width: Optional[int] = None,
        timeout: float = 2.0,
    ) -> None:
        self.url = (url or os.getenv("SUPABASE_URL", "")).rstrip("/")
        self.key = key or os.getenv("SUPABASE_SERVICE_KEY", "")
        self.device_id = device_id or os.getenv("FEEDER_DEVICE_ID", "feeder-1")
        self.topic = f"feeder:{self.device_id}"
        self.endpoint = f"{self.url}/realtime/v1/api/broadcast"

        fps = fps_limit if fps_limit is not None else float(os.getenv("FEEDER_FPS_LIMIT", "6"))
        self.min_interval = 1.0 / max(fps, 0.1)
        self.jpeg_quality = int(
            jpeg_quality if jpeg_quality is not None else os.getenv("FEEDER_JPEG_QUALITY", "60")
        )
        self.stream_width = int(
            stream_width if stream_width is not None else os.getenv("FEEDER_STREAM_WIDTH", "640")
        )
        self.timeout = timeout

        self.headers = {
            "apikey": self.key,
            "Authorization": f"Bearer {self.key}",
            "Content-Type": "application/json",
        }
        self._last_send = 0.0
        self._lock = threading.Lock()
        self._session = requests.Session()
        self.enabled = bool(self.url and self.key)

        if not self.enabled:
            print("[broadcast] SUPABASE_URL / SUPABASE_SERVICE_KEY 미설정 — 프레임 송출 비활성")
        else:
            print(f"[broadcast] 활성: topic={self.topic}, fps_cap={fps}, q={self.jpeg_quality}")

    def send_frame(
        self,
        frame: np.ndarray,
        detections: Optional[Iterable[dict]] = None,
        status: str = "active",
    ) -> bool:
        """Annotated 프레임을 브로드캐스트. fps 상한 초과 시 조용히 드롭."""
        if not self.enabled:
            return False

        now = time.time()
        with self._lock:
            if now - self._last_send < self.min_interval:
                return False
            self._last_send = now

        h, w = frame.shape[:2]
        if w > self.stream_width:
            new_h = int(h * self.stream_width / w)
            frame_small = cv2.resize(
                frame, (self.stream_width, new_h), interpolation=cv2.INTER_AREA
            )
        else:
            frame_small = frame

        ok, buf = cv2.imencode(
            ".jpg", frame_small, [cv2.IMWRITE_JPEG_QUALITY, self.jpeg_quality]
        )
        if not ok:
            return False

        payload = {
            "messages": [
                {
                    "topic": self.topic,
                    "event": "frame",
                    "private": False,
                    "payload": {
                        "jpeg_b64": base64.b64encode(buf.tobytes()).decode("ascii"),
                        "ts": int(now * 1000),
                        "width": frame_small.shape[1],
                        "height": frame_small.shape[0],
                        "detections": list(detections or []),
                        "status": status,
                    },
                }
            ]
        }

        try:
            r = self._session.post(
                self.endpoint, json=payload, headers=self.headers, timeout=self.timeout
            )
            if r.status_code >= 400:
                print(f"[broadcast] {r.status_code}: {r.text[:200]}")
                return False
            return True
        except requests.RequestException as e:
            print(f"[broadcast] 송출 실패: {e}")
            return False
