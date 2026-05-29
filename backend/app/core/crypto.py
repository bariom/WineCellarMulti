from __future__ import annotations

import base64
import hashlib
import hmac
import os

from app.core.config import settings


ENCRYPTED_PREFIX = "enc:v1:"


def key_stream(nonce: bytes, length: int) -> bytes:
    chunks: list[bytes] = []
    counter = 0
    secret = settings.secret_key.encode("utf-8")
    while sum(len(chunk) for chunk in chunks) < length:
        chunks.append(hmac.new(secret, nonce + counter.to_bytes(4, "big"), hashlib.sha256).digest())
        counter += 1
    return b"".join(chunks)[:length]


def encrypt_secret(value: str) -> str:
    if not value:
        return ""
    if value.startswith(ENCRYPTED_PREFIX):
        return value
    plaintext = value.encode("utf-8")
    nonce = os.urandom(16)
    stream = key_stream(nonce, len(plaintext))
    ciphertext = bytes(byte ^ stream[index] for index, byte in enumerate(plaintext))
    tag = hmac.new(settings.secret_key.encode("utf-8"), nonce + ciphertext, hashlib.sha256).digest()
    return ENCRYPTED_PREFIX + base64.urlsafe_b64encode(nonce + tag + ciphertext).decode("ascii")


def decrypt_secret(value: str) -> str:
    if not value or not value.startswith(ENCRYPTED_PREFIX):
        return value or ""
    try:
        payload = base64.urlsafe_b64decode(value[len(ENCRYPTED_PREFIX) :].encode("ascii"))
    except ValueError:
        return ""
    if len(payload) < 48:
        return ""
    nonce = payload[:16]
    tag = payload[16:48]
    ciphertext = payload[48:]
    expected = hmac.new(settings.secret_key.encode("utf-8"), nonce + ciphertext, hashlib.sha256).digest()
    if not hmac.compare_digest(tag, expected):
        return ""
    stream = key_stream(nonce, len(ciphertext))
    plaintext = bytes(byte ^ stream[index] for index, byte in enumerate(ciphertext))
    return plaintext.decode("utf-8", errors="replace")
