"""MinIO 객체 저장소 (SVC-12) — 백엔드 프록시 방식.

presigned URL 직접 노출은 S3 호스트 공개 결정 후 (인터페이스정의서 I-008) —
현 단계는 업/다운로드를 백엔드가 중계한다 (인증·Grade 통제 지점 일원화).
"""
from __future__ import annotations

import io
import logging
import os

logger = logging.getLogger("edim.storage")

BUCKET = os.getenv("MINIO_BUCKET", "edim")

_client = None
_checked = False


def get_client():
    """지연 초기화 — 미설정/불가 시 None (파일 API 는 503)."""
    global _client, _checked
    if _checked:
        return _client
    _checked = True
    endpoint = os.getenv("MINIO_ENDPOINT", "")
    user = os.getenv("MINIO_USER", "")
    password = os.getenv("MINIO_PASSWORD", "")
    if not endpoint or not user:
        logger.warning("MinIO env missing — file storage disabled")
        return None
    try:
        from minio import Minio
        client = Minio(endpoint, access_key=user, secret_key=password, secure=False)
        if not client.bucket_exists(BUCKET):
            client.make_bucket(BUCKET)
        _client = client
        logger.info("MinIO ready — bucket '%s'", BUCKET)
    except Exception:  # noqa: BLE001
        logger.exception("MinIO unavailable")
        _client = None
    return _client


def put_object(key: str, data: bytes, content_type: str) -> None:
    client = get_client()
    if client is None:
        raise RuntimeError("storage unavailable")
    client.put_object(BUCKET, key, io.BytesIO(data), length=len(data),
                      content_type=content_type)


def get_object(key: str):
    client = get_client()
    if client is None:
        raise RuntimeError("storage unavailable")
    return client.get_object(BUCKET, key)


def remove_object(key: str) -> None:
    client = get_client()
    if client is None:
        raise RuntimeError("storage unavailable")
    client.remove_object(BUCKET, key)
