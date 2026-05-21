"""급식 세션 상태기.

웹의 '급식 시작' 클릭 → 일정 시간 (기본 60s) 동안 'feeding active' 상태.
이 동안 Unknown stable_id 가 감지되면:
  - 경고 WAV 재생 (audio queue)
  - on_blocked(track_id) 콜백 (보통 supabase alert insert)
  - 같은 세션에서 WARNING_DEBOUNCE_SEC 내 연쇄 발화 안 함.
"""
from __future__ import annotations

import threading
import time

DEFAULT_DURATION_SEC = 60
WARNING_DEBOUNCE_SEC = 5.0


class FeedingSession:
    def __init__(self, audio, on_blocked=None):
        """
        audio: AudioPlayer 인스턴스 (.play(path))
        on_blocked: callable(track_id: int) — Unknown 감지 시 호출. None 가능.
                    내부에서 알아서 비동기 처리 (HTTP 등) — feeding_session 은 락 잡고
                    있다 호출하지 않으므로 호출부에서 직접 블로킹해도 무방하나
                    그래도 thread 로 띄우는 게 안전.
        """
        self._audio = audio
        self._on_blocked = on_blocked
        self._lock = threading.Lock()
        self._active = None
        self._last_warning_at = 0.0

    def start(self, dog_id, name, voice_wav_path,
              duration_sec=DEFAULT_DURATION_SEC):
        """급식 세션 시작. 이미 진행 중이면 (False, error_str).
        voice_wav_path 가 없거나 파일 없으면 음성 스킵 — 세션은 정상 시작.
        """
        now = time.time()
        with self._lock:
            if self._active and self._active["ends_at"] > now:
                remaining = int(self._active["ends_at"] - now)
                return False, f"이미 급식 진행 중 ({remaining}s 남음)"
            self._active = {
                "dog_id": dog_id,
                "name": name,
                "started_at": now,
                "ends_at": now + duration_sec,
                "blocked_count": 0,
            }
            self._last_warning_at = 0.0
        self._audio.play(voice_wav_path)
        return True, None

    def status(self):
        """현재 세션 dict 또는 None. 만료된 세션은 lazy 정리."""
        now = time.time()
        with self._lock:
            if not self._active:
                return None
            if self._active["ends_at"] <= now:
                self._active = None
                return None
            return {
                "dog_id": self._active["dog_id"],
                "name": self._active["name"],
                "started_at": self._active["started_at"],
                "ends_at": self._active["ends_at"],
                "remaining_sec": max(0, int(self._active["ends_at"] - now)),
                "blocked_count": self._active["blocked_count"],
            }

    def is_active(self):
        return self.status() is not None

    def on_unknown_detected(self, track_id, warning_wav_path):
        """infer_loop 의 stable_id == UNKNOWN_LABEL 분기에서 매 cycle 호출 가능.
        세션 비활성 / debounce 중 / 만료 직전이면 no-op.
        """
        now = time.time()
        triggered = False
        with self._lock:
            if not self._active or self._active["ends_at"] <= now:
                return
            if now - self._last_warning_at < WARNING_DEBOUNCE_SEC:
                return
            self._last_warning_at = now
            self._active["blocked_count"] += 1
            triggered = True
        if triggered:
            self._audio.play(warning_wav_path)
            if self._on_blocked:
                try:
                    self._on_blocked(track_id)
                except Exception as e:
                    print(f"[feeding] on_blocked callback failed: {e}")
