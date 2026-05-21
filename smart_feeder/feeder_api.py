"""Pi 로컬 HTTP API — 웹 UI 에서 ReID 갤러리 + Supabase dogs 테이블 관리.

엔드포인트:
- POST   /register
    body: {
      "track_id": int,          # 필수
      "name": str,              # 필수
      "breed_code": str,        # 필수 (breeds.code FK)
      "weight_kg": number,      # 필수, > 0
      "photo_url": str,         # 선택
      "shelter_id": uuid,       # 선택
      "food_type": str,         # 선택
      "recommended_g": int,     # 선택
      "vet_note": str           # 선택
    }
    → Pi 의 pending feature 를 Supabase dogs 행에 임베딩과 함께 insert,
      성공하면 로컬 갤러리에 반영.
- GET    /pending          : 현재 Unknown track_id 목록
                              ([{track_id, expires_in_sec, has_thumbnail}, ...])
- GET    /pending/<tid>/thumbnail : 해당 pending 의 마지막 crop JPEG
- GET    /gallery          : 로컬 갤러리 (name + dog_id)
- DELETE /gallery/<name>   : 로컬 갤러리에서만 제거 (Supabase 행은 그대로)
- GET    /healthz          : 헬스체크

배포:
- env SUPABASE_URL, SUPABASE_SERVICE_KEY 필요 (이미 supabase_realtime_client 가 씀)
- env FEEDER_API_TOKEN 설정 시 모든 요청에 Authorization: Bearer <token> 요구
"""
from __future__ import annotations

import json
import os
import threading
from datetime import datetime, timezone

import requests
from flask import Flask, Response, jsonify, request


def _supabase_config():
    url = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_KEY", "").strip()
    return url, key


def _supabase_headers(key):
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }


def _vector_to_pg(embedding):
    """list[float] → '[v1,v2,...]' pgvector 문자열."""
    return "[" + ",".join(f"{x:.6f}" for x in embedding) + "]"


def fetch_dogs_with_embedding():
    """기동 시 호출 — Supabase dogs 에서 활성 + embedding 있는 행 조회.
    실패해도 빈 리스트 반환 (앱 기동 막지 않음).
    """
    url, key = _supabase_config()
    if not url or not key:
        print("[supabase] URL or SERVICE_KEY missing — skipping gallery load")
        return []
    try:
        resp = requests.get(
            f"{url}/rest/v1/dogs",
            headers=_supabase_headers(key),
            params={
                "select": "id,name,embedding",
                "status": "neq.archived",
                "embedding": "not.is.null",
            },
            timeout=10,
        )
    except requests.RequestException as e:
        print(f"[supabase] fetch failed: {e}")
        return []
    if resp.status_code != 200:
        print(f"[supabase] fetch error {resp.status_code}: {resp.text[:200]}")
        return []
    return resp.json() or []


def _alert_message_payload(device_id, track_id):
    """alerts.message 에 식별자를 JSON 으로 임베드.
    웹은 type=='unregistered_access' 인 alert 의 message 를 JSON.parse 로 풀어서
    (device_id, track_id) 추출 → /dogs?registerPendingTid=...&deviceId=... 라우팅.
    """
    return json.dumps({"device_id": device_id, "track_id": track_id},
                      ensure_ascii=False)


def insert_unregistered_access_alert(device_id, track_id):
    """미등록 개체 접근 알림 1 건 insert. 성공 시 alert_id (uuid str), 실패 시 None.
    pending feature 가 새로 생기는 순간에만 호출 (process_crop 의 'is_new' branch).
    """
    url, key = _supabase_config()
    if not url or not key:
        print("[alerts] supabase not configured — skipping alert insert")
        return None
    payload = {
        "type": "unregistered_access",
        "severity": "warn",
        "title": f"미등록 개체 #{track_id} 접근",
        "message": _alert_message_payload(device_id, track_id),
    }
    try:
        resp = requests.post(
            f"{url}/rest/v1/alerts",
            headers={**_supabase_headers(key), "Prefer": "return=representation"},
            json=payload,
            timeout=10,
        )
    except requests.RequestException as e:
        print(f"[alerts] insert failed: {e}")
        return None
    if resp.status_code not in (200, 201):
        print(f"[alerts] insert error {resp.status_code}: {resp.text[:200]}")
        return None
    rows = resp.json() or []
    if not rows:
        return None
    return rows[0].get("id")


def resolve_alert(alert_id):
    """alerts.resolved_at 을 지금 시각으로 PATCH. 호출 케이스:
    - 사용자가 UI 로 등록 성공 (commit_registration)
    - pending 이 TTL 만료 (cleanup)
    - 같은 개체의 중복 pending 정리 (commit_registration dedup)
    이미 resolved 상태여도 멱등 — 그냥 resolved_at 만 덮어쓰임.
    """
    if not alert_id:
        return False
    url, key = _supabase_config()
    if not url or not key:
        return False
    try:
        resp = requests.patch(
            f"{url}/rest/v1/alerts",
            headers=_supabase_headers(key),
            params={"id": f"eq.{alert_id}"},
            json={"resolved_at": datetime.now(timezone.utc).isoformat()},
            timeout=10,
        )
    except requests.RequestException as e:
        print(f"[alerts] resolve failed: {e}")
        return False
    if resp.status_code not in (200, 204):
        print(f"[alerts] resolve error {resp.status_code}: {resp.text[:200]}")
        return False
    return True


def _insert_dog(payload):
    """dogs 테이블에 insert. (dog_id, None) | (None, error_str, status_code)."""
    url, key = _supabase_config()
    if not url or not key:
        return None, "SUPABASE_URL / SUPABASE_SERVICE_KEY not configured", 500
    try:
        resp = requests.post(
            f"{url}/rest/v1/dogs",
            headers={**_supabase_headers(key), "Prefer": "return=representation"},
            json=payload,
            timeout=10,
        )
    except requests.RequestException as e:
        return None, f"supabase request failed: {e}", 502
    if resp.status_code not in (200, 201):
        # 409 = unique 위배 (이름 중복), 23503 = FK 위배 (breed_code) 등
        # 그대로 클라이언트에 전달
        status = 409 if resp.status_code in (409, 400) else 502
        return None, resp.text[:300], status
    rows = resp.json()
    if not rows:
        return None, "supabase returned no row", 502
    return rows[0]["id"], None, 201


def create_app(reid):
    app = Flask(__name__)
    token = os.environ.get("FEEDER_API_TOKEN", "").strip()

    def _unauthorized():
        return jsonify({"ok": False, "error": "unauthorized"}), 401

    @app.before_request
    def _auth():
        if request.method == "OPTIONS":
            return
        if not token:
            return
        header = request.headers.get("Authorization", "")
        if header != f"Bearer {token}":
            return _unauthorized()

    @app.after_request
    def _cors(resp):
        resp.headers["Access-Control-Allow-Origin"] = "*"
        resp.headers["Access-Control-Allow-Methods"] = "GET, POST, DELETE, OPTIONS"
        resp.headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type"
        return resp

    @app.post("/register")
    def register():
        body = request.get_json(silent=True) or {}

        # 필수 필드 검증
        tid = body.get("track_id")
        name = (body.get("name") or "").strip() if isinstance(body.get("name"), str) else None
        breed_code = body.get("breed_code")
        weight_kg = body.get("weight_kg")

        if not isinstance(tid, int):
            return jsonify({"ok": False, "error": "track_id (int) required"}), 400
        if not name:
            return jsonify({"ok": False, "error": "name (non-empty string) required"}), 400
        if not isinstance(breed_code, str) or not breed_code.strip():
            return jsonify({"ok": False, "error": "breed_code (string) required"}), 400
        try:
            weight = float(weight_kg)
        except (TypeError, ValueError):
            return jsonify({"ok": False, "error": "weight_kg (number) required"}), 400
        if weight <= 0:
            return jsonify({"ok": False, "error": "weight_kg must be > 0"}), 400

        # pending feature 가져오기 (아직 pop 하지 않음 — Supabase 성공 후 commit 단계에서)
        emb = reid.take_pending_feature(tid)
        if emb is None:
            return jsonify({"ok": False, "error": f"no pending feature for track_id={tid}"}), 404

        payload = {
            "name": name,
            "breed_code": breed_code.strip(),
            "weight_kg": weight,
            "embedding": _vector_to_pg(emb),
            "status": "active",
        }
        for k in ("photo_url", "shelter_id", "food_type", "recommended_g", "vet_note"):
            v = body.get(k)
            if v is not None and v != "":
                payload[k] = v

        dog_id, err, status = _insert_dog(payload)
        if err:
            return jsonify({"ok": False, "error": err}), status

        ok, commit_err = reid.commit_registration(tid, name, dog_id)
        if not ok:
            # Supabase 에는 이미 들어갔는데 로컬에서 실패 — 드물지만 가능
            # (예: 같은 이름이 동시 등록). 로그만 남기고 클라이언트엔 성공 처리.
            print(f"[WARN] supabase insert ok but local commit failed: {commit_err}")
        return jsonify({
            "ok": True,
            "dog_id": dog_id,
            "name": name,
            "track_id": tid,
        }), 201

    @app.get("/pending")
    def pending():
        return jsonify({"pending": reid.list_pending()})

    @app.get("/pending/<int:tid>/thumbnail")
    def pending_thumbnail(tid):
        data = reid.get_pending_thumbnail(tid)
        if data is None:
            return jsonify({"ok": False, "error": "not found"}), 404
        return Response(data, mimetype="image/jpeg")

    @app.get("/gallery")
    def gallery():
        return jsonify({"dogs": reid.list_gallery()})

    @app.delete("/gallery/<name>")
    def unregister(name):
        ok = reid.unregister(name)
        if not ok:
            return jsonify({"ok": False, "error": f"'{name}' not in local gallery"}), 404
        return jsonify({"ok": True, "name": name})

    @app.get("/healthz")
    def healthz():
        url, key = _supabase_config()
        return jsonify({
            "ok": True,
            "supabase_configured": bool(url and key),
            "gallery_size": len(reid.list_gallery()),
            "pending_count": len(reid.list_pending()),
        })

    return app


def start_in_thread(reid, host="0.0.0.0", port=8765):
    """Flask 앱을 데몬 스레드로 시동."""
    app = create_app(reid)

    def _run():
        from werkzeug.serving import run_simple
        print(f"[http] listening on {host}:{port}")
        run_simple(host, port, app, use_reloader=False, threaded=True)

    t = threading.Thread(target=_run, name="http", daemon=True)
    t.start()
    return t
