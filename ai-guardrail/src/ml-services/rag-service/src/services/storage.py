import io
import logging
from typing import BinaryIO

from minio import Minio
from minio.error import S3Error

from src.config import settings

logger = logging.getLogger(__name__)

BUCKET_NAME = "kyra-documents"


class StorageService:
    """MinIO object storage wrapper."""

    def __init__(self) -> None:
        self._client = Minio(
            endpoint=settings.MINIO_ENDPOINT,
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=settings.MINIO_SECURE,
        )
        self._ensure_bucket()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def upload_file(
        self,
        object_name: str,
        data: BinaryIO,
        length: int,
        content_type: str = "application/octet-stream",
    ) -> str:
        """Upload a file to MinIO and return the object path."""
        self._client.put_object(
            bucket_name=BUCKET_NAME,
            object_name=object_name,
            data=data,
            length=length,
            content_type=content_type,
        )
        logger.info("Uploaded %s (%d bytes)", object_name, length)
        return f"{BUCKET_NAME}/{object_name}"

    def download_file(self, object_name: str) -> bytes:
        """Download a file from MinIO and return its bytes."""
        response = self._client.get_object(BUCKET_NAME, object_name)
        try:
            return response.read()
        finally:
            response.close()
            response.release_conn()

    def delete_file(self, object_name: str) -> None:
        """Delete a file from MinIO."""
        try:
            self._client.remove_object(BUCKET_NAME, object_name)
            logger.info("Deleted %s", object_name)
        except S3Error as exc:
            logger.warning("Failed to delete %s: %s", object_name, exc)

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _ensure_bucket(self) -> None:
        """Create the bucket if it does not exist."""
        try:
            if not self._client.bucket_exists(BUCKET_NAME):
                self._client.make_bucket(BUCKET_NAME)
                logger.info("Created bucket %s", BUCKET_NAME)
        except Exception as exc:
            logger.warning("Could not verify/create bucket: %s", exc)
