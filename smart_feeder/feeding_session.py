"""급식 세션 상태기.

웹의 '급식 시작' 클릭 → 일정 시간 (기본 60s) 동안 'feeding active' 상태.
이 동안:
  - 세션 대상 개체가 카메라에 잡히면 → on_complete 콜백 1회 (급식 완료 기록).
  - Unknown(미등록) 개체가 감지되면 → 경고 WAV + on_blocked 콜백,
    그리고 세션 종료 시각을 PAUSE_ON_BLOCK_SEC 만큼 미룸 ('시간 멈춤' 효과 —
    다른 개체가 방해한 만큼 대상견에게 급식 시간을 돌려준다).
  - 같은 세션에서 WARNING_DEBOUNCE_SEC 내 경고는 연쇄 발화 안 함.
"""
from __future__ import annotations

import threading
import time

DEFAULT_DURATION_SEC = 60
WARNING_DEBOUNCE_SEC = 5.0
# 미등록 개체 감지 1회당 세션 종료 시각을 이만큼 뒤로 민다 (시간 멈춤 효과).
PAUSE_ON_BLOCK_SEC = 5.0
# 세션 절대 상한 — 연장이 무한히 쌓이는 것 방지.
MAX_SESSION_SEC = 600


class FeedingSession:
    def __init__(self, audio, on_blocked=None, on_complete=None):
        """
        audio: AudioPlayer 인스턴스 (.play(path))
        on_blocked: callable(track_id: int) — Unknown 감지 시 호출. None 가능.
        on_complete: callable(dog_id: str, dispensed_g: float) — 세션 대상 개체가
                     카메라에 확인됐을 때 1회 호출. 보통 supabase feeding_records insert.
                     콜백은 호출부에서 thread 로 띄우는 게 안전 (락 밖에서 호출되지만).
        """
        self._audio = audio
        self._on_blocked = on_blocked
        self._on_complete = on_complete
        self._lock = threading.Lock()
        self._active = None
        self._last_warning_at = 0.0

    def start(self, dog_id, name, voice_wav_path,
              duration_sec=DEFAULT_DURATION_SEC, dispensed_g=0):
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
                "dispensed_g": dispensed_g,
                "recorded": False,
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
                "recorded": self._active["recorded"],
            }

    def is_active(self):
        return self.status() is not None

    def on_dog_seen(self, name):
        """세션 대상 개체가 카메라에 잡히면 완료 기록을 1회 발화.
        infer_loop 에서 stable_id 가 등록 개체(=Unknown 아님)일 때 호출.
        세션 비활성 / 이미 기록됨 / 대상 아닌 개체면 no-op.
        """
        fire = None
        now = time.time()
        with self._lock:
            if not self._active or self._active["ends_at"] <= now:
                return
            if self._active["recorded"]:
                return
            if name != self._active["name"]:
                return  # 다른 등록 개체 — 이번 세션 대상 아님
            self._active["recorded"] = True
            fire = (self._active["dog_id"], self._active["dispensed_g"])
        if fire and self._on_complete:
            try:
                self._on_complete(*fire)
            except Exception as e:
                print(f"[feeding] on_complete callback failed: {e}")

    def on_unknown_detected(self, track_id, warning_wav_path):
        """infer_loop 의 stable_id == UNKNOWN_LABEL 분기에서 매 cycle 호출 가능.
        세션 비활성 / debounce 중 / 만료 직전이면 no-op.
        발화 시 경고음 + on_blocked + 세션 종료 시각 연장(시간 멈춤).
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
            # 다른 개체가 방해한 만큼 종료 시각을 미뤄 대상견 급식 시간을 보전.
            self._active["ends_at"] = min(
                self._active["ends_at"] + PAUSE_ON_BLOCK_SEC,
                self._active["started_at"] + MAX_SESSION_SEC,
            )
            triggered = True
        if triggered:
            self._audio.play(warning_wav_path)
            if self._on_blocked:
                try:
                    self._on_blocked(track_id)
                except Exception as e:
                    print(f"[feeding] on_blocked callback failed: {e}")
