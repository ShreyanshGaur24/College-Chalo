"""
College-Chalo Authentication & Security Module
Handles password hashing, token validation, and community role verification.
"""

import hashlib
import os
import hmac
import time
import json
import base64
from backend.database import get_connection

SECRET_KEY = os.environ.get("COLLEGE_CHALO_SECRET", "college_chalo_super_secret_community_key_2026")

def hash_password(password: str) -> str:
    salt = "college_chalo_salt_salt_"
    return hashlib.sha256((salt + password).encode('utf-8')).hexdigest()

def verify_password(password: str, hashed: str) -> bool:
    return hmac.compare_digest(hash_password(password), hashed)

def create_token(user_id: str, role: str) -> str:
    payload = {
        "uid": user_id,
        "role": role,
        "iat": int(time.time()),
        "exp": int(time.time()) + 86400 * 7 # 7 days
    }
    payload_bytes = json.dumps(payload).encode('utf-8')
    token_part = base64.urlsafe_b64encode(payload_bytes).decode('utf-8')
    signature = hmac.new(SECRET_KEY.encode('utf-8'), token_part.encode('utf-8'), hashlib.sha256).hexdigest()
    return f"{token_part}.{signature}"

def decode_token(token: str):
    if not token or "." not in token:
        return None
    try:
        token_part, signature = token.split(".", 1)
        expected_sig = hmac.new(SECRET_KEY.encode('utf-8'), token_part.encode('utf-8'), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected_sig):
            return None
        payload_bytes = base64.urlsafe_b64decode(token_part.encode('utf-8'))
        payload = json.loads(payload_bytes.decode('utf-8'))
        if payload.get("exp", 0) < int(time.time()):
            return None
        return payload
    except Exception:
        return None

def get_user_from_token(token: str):
    payload = decode_token(token)
    if not payload:
        return None
    user_id = payload.get("uid")
    conn = get_connection()
    user = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    conn.close()
    if user:
        return dict(user)
    return None
