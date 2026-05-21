"""오디오 재생 헬퍼 — 단일 worker thread + queue 로 직렬화.

- aplay 서브프로세스로 WAV 재생.
- play() 는 큐에 enqueue 만 하고 즉시 리턴 → infer/HTTP 스레드 블로킹 안 함.
- 동시 재생 시 음성이 겹치는 걸 큐가 자연스럽게 직렬화.
- 파일 없으면 로그만 찍고 silent skip — 호출부가 매번 exists() 체크 안 해도 됨.
"""
from __future__ import annotations

import os
import queue
import subprocess
import threading


class AudioPlayer:
    def __init__(self, aplay_device=None):
        """aplay_device: 예 'plughw:2,0'. None 이면 ALSA default (~/.asoundrc)."""
        self._aplay_device = aplay_device or None
        self._q: queue.Queue = queue.Queue()
        self._stop = threading.Event()
        self._t = threading.Thread(target=self._run, name="audio", daemon=True)
        self._t.start()

    def play(self, path):
        """파일을 큐에 enqueue. path 가 비었거나 파일 없으면 무시 (로그만)."""
        if not path:
            return
        if not os.path.exists(path):
            print(f"[audio] missing wav: {path}")
            return
        self._q.put(path)

    def _run(self):
        while not self._stop.is_set():
            try:
                path = self._q.get(timeout=1.0)
            except queue.Empty:
                continue
            cmd = ["aplay", "-q"]
            if self._aplay_device:
                cmd += ["-D", self._aplay_device]
            cmd.append(path)
            try:
                subprocess.run(cmd, check=False, timeout=30)
            except Exception as e:
                print(f"[audio] play failed for {path}: {e}")
