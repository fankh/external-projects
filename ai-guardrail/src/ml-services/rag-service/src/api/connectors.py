import io
import uuid
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.db import get_session, async_session_factory
from src.models.database import Collection as DBCollection
from src.models.database import Document as DBDocument
from src.utils.parsers import parse_file

router = APIRouter(prefix="/v1/connectors", tags=["connectors"])


class S3SyncRequest(BaseModel):
    skip_existing: bool = Field(True, description="Skip keys already indexed in this collection (by metadata.key)")
    collection_id: str = Field(..., description="Target collection id")
    bucket: str
    prefix: str = ""
    region: Optional[str] = None
    access_key_id: Optional[str] = None
    secret_access_key: Optional[str] = None
    endpoint_url: Optional[str] = Field(None, description="Custom S3 endpoint (MinIO etc.)")
    max_objects: int = Field(100, ge=1, le=10000)


class S3SyncResponse(BaseModel):
    status: str
    collection_id: str
    queued: int
    skipped: int
    errors: list[str]


async def _index_bytes_task(document_id: str, collection_id: str, file_name: str, file_data: bytes) -> None:
    from src.main import get_indexing_service
    async with async_session_factory() as session:
        try:
            content = parse_file(file_name, file_data)
            indexing = get_indexing_service()
            await indexing.index_document(
                session=session,
                collection_id=collection_id,
                document_id=document_id,
                content=content,
                document_name=file_name,
            )
        except Exception as exc:
            import logging
            logging.getLogger(__name__).exception("Failed to index %s: %s", document_id, exc)
            doc = await session.get(DBDocument, uuid.UUID(document_id))
            if doc:
                doc.status = "failed"
                await session.commit()


@router.post("/s3/sync", response_model=S3SyncResponse, status_code=status.HTTP_202_ACCEPTED)
async def sync_s3_bucket(
    req: S3SyncRequest,
    background: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
) -> S3SyncResponse:
    """List objects under bucket/prefix and queue each for ingestion."""
    import os

    try:
        import aioboto3
    except ImportError:
        raise HTTPException(500, "aioboto3 not installed in this image")

    # Verify collection
    col = await session.get(DBCollection, uuid.UUID(req.collection_id))
    if not col:
        raise HTTPException(404, "Collection not found")

    queued = 0
    skipped = 0
    errors: list[str] = []

    sess_kwargs = {
        "aws_access_key_id": req.access_key_id or os.getenv("AWS_ACCESS_KEY_ID"),
        "aws_secret_access_key": req.secret_access_key or os.getenv("AWS_SECRET_ACCESS_KEY"),
        "region_name": req.region or os.getenv("AWS_REGION", "us-east-1"),
    }
    client_kwargs = {}
    if req.endpoint_url:
        client_kwargs["endpoint_url"] = req.endpoint_url

    aio_sess = aioboto3.Session(**sess_kwargs)
    async with aio_sess.client("s3", **client_kwargs) as s3:
        try:
            paginator = s3.get_paginator("list_objects_v2")
            count = 0
            async for page in paginator.paginate(Bucket=req.bucket, Prefix=req.prefix):
                for obj in page.get("Contents", []):
                    if count >= req.max_objects:
                        break
                    count += 1
                    key = obj["Key"]
                    if key.endswith("/"):
                        skipped += 1
                        continue
                    if req.skip_existing:
                        existing = await session.execute(
                            select(DBDocument).where(
                                DBDocument.collection_id == uuid.UUID(req.collection_id),
                                DBDocument.name == key,
                            )
                        )
                        if existing.first() is not None:
                            skipped += 1
                            continue
                    try:
                        resp = await s3.get_object(Bucket=req.bucket, Key=key)
                        body = await resp["Body"].read()
                        doc_id = str(uuid.uuid4())
                        doc = DBDocument(
                            id=uuid.UUID(doc_id),
                            collection_id=uuid.UUID(req.collection_id),
                            name=key,
                            status="processing",
                            metadata_={"source": "s3", "bucket": req.bucket, "key": key},
                        )
                        session.add(doc)
                        await session.commit()
                        background.add_task(_index_bytes_task, doc_id, req.collection_id, key, body)
                        queued += 1
                    except Exception as exc:
                        errors.append(f"{key}: {exc}")
                if count >= req.max_objects:
                    break
        except Exception as exc:
            raise HTTPException(500, f"S3 listing failed: {exc}")

    await _record_run(session, connector="s3", collection_id=req.collection_id, status="accepted", queued=queued, skipped=skipped, errors=len(errors))

    return S3SyncResponse(
        status="accepted",
        collection_id=req.collection_id,
        queued=queued,
        skipped=skipped,
        errors=errors[:20],
    )


class S3SyncStats(BaseModel):
    total_s3_documents: int
    collections_with_s3: list[str]


@router.get("/s3/stats", response_model=S3SyncStats)
async def s3_stats(session: AsyncSession = Depends(get_session)) -> S3SyncStats:
    stmt = select(DBDocument).where(DBDocument.metadata_["source"].as_string() == "s3")
    result = await session.execute(stmt)
    docs = list(result.scalars().all())
    coll_ids = list({str(d.collection_id) for d in docs})
    return S3SyncStats(total_s3_documents=len(docs), collections_with_s3=coll_ids)


# ====== Generic REST connector ======

class RestSyncRequest(BaseModel):
    collection_id: str = Field(..., description="Target collection id")
    url: str = Field(..., description="GET URL returning JSON")
    headers: Optional[dict[str, str]] = Field(None, description="Optional request headers")
    items_path: str = Field("items", description="Dot-path into JSON response to the list of items (e.g. 'data.docs')")
    id_field: str = Field("id", description="Field name within each item for document id")
    content_field: str = Field("content", description="Field name within each item for text content")
    title_field: str = Field("title", description="Field name for human-readable title")
    max_items: int = Field(500, ge=1, le=10000)
    skip_existing: bool = True


class RestSyncResponse(BaseModel):
    status: str
    collection_id: str
    queued: int
    skipped: int
    errors: list[str]


def _path_get(obj: object, path: str) -> object:
    cur = obj
    for part in path.split("."):
        if not part:
            continue
        if isinstance(cur, dict):
            cur = cur.get(part)
        else:
            return None
    return cur


@router.post("/rest/sync", response_model=RestSyncResponse, status_code=status.HTTP_202_ACCEPTED)
async def sync_rest_source(
    req: RestSyncRequest,
    background: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
) -> RestSyncResponse:
    """Fetch a JSON payload from URL, extract items, queue each for indexing."""
    try:
        import httpx
    except ImportError:
        raise HTTPException(500, "httpx not installed in this image")

    col = await session.get(DBCollection, uuid.UUID(req.collection_id))
    if not col:
        raise HTTPException(404, "Collection not found")

    queued = 0
    skipped = 0
    errors: list[str] = []

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            resp = await client.get(req.url, headers=req.headers or {})
            resp.raise_for_status()
            payload = resp.json()
        except Exception as exc:
            raise HTTPException(502, f"REST fetch failed: {exc}")

    items = _path_get(payload, req.items_path) if req.items_path else payload
    if not isinstance(items, list):
        raise HTTPException(400, f"items_path '{req.items_path}' did not resolve to a list")

    for idx, item in enumerate(items[: req.max_items]):
        if not isinstance(item, dict):
            continue
        item_id = str(item.get(req.id_field, f"rest-{idx}"))
        title = str(item.get(req.title_field, item_id))
        content = item.get(req.content_field)
        if not content or not isinstance(content, str):
            skipped += 1
            continue

        if req.skip_existing:
            existing = await session.execute(
                select(DBDocument).where(
                    DBDocument.collection_id == uuid.UUID(req.collection_id),
                    DBDocument.name == title,
                )
            )
            if existing.first() is not None:
                skipped += 1
                continue

        try:
            doc_id = str(uuid.uuid4())
            doc = DBDocument(
                id=uuid.UUID(doc_id),
                collection_id=uuid.UUID(req.collection_id),
                name=title,
                status="processing",
                metadata_={"source": "rest", "url": req.url, "item_id": item_id},
            )
            session.add(doc)
            await session.commit()
            background.add_task(_index_bytes_task, doc_id, req.collection_id, title, content.encode("utf-8"))
            queued += 1
        except Exception as exc:
            errors.append(f"{item_id}: {exc}")

    await _record_run(session, connector="rest", collection_id=req.collection_id, status="accepted", queued=queued, skipped=skipped, errors=len(errors))

    return RestSyncResponse(
        status="accepted",
        collection_id=req.collection_id,
        queued=queued,
        skipped=skipped,
        errors=errors[:20],
    )


# ====== Confluence Cloud connector ======

class ConfluenceSyncRequest(BaseModel):
    collection_id: str
    base_url: str = Field(..., description="https://your-domain.atlassian.net/wiki")
    username: str = Field(..., description="Atlassian account email")
    api_token: str = Field(..., description="Atlassian API token")
    space_key: Optional[str] = Field(None, description="Only sync a specific space (CQL)")
    max_pages: int = Field(200, ge=1, le=2000)
    skip_existing: bool = True


class ConfluenceSyncResponse(BaseModel):
    status: str
    collection_id: str
    queued: int
    skipped: int
    errors: list[str]


@router.post("/confluence/sync", response_model=ConfluenceSyncResponse, status_code=status.HTTP_202_ACCEPTED)
async def sync_confluence(
    req: ConfluenceSyncRequest,
    background: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
) -> ConfluenceSyncResponse:
    """Page through Confluence Cloud search API, queue each page for indexing."""
    try:
        import httpx
    except ImportError:
        raise HTTPException(500, "httpx not installed")

    col = await session.get(DBCollection, uuid.UUID(req.collection_id))
    if not col:
        raise HTTPException(404, "Collection not found")

    auth = (req.username, req.api_token)
    queued = 0
    skipped = 0
    errors: list[str] = []
    base = req.base_url.rstrip("/")

    # Build CQL: type=page, optionally restricted to space
    cql = 'type = "page"'
    if req.space_key:
        cql = f'{cql} AND space.key = "{req.space_key}"'

    async with httpx.AsyncClient(timeout=30.0, auth=auth) as client:
        start = 0
        limit = 50
        while queued + skipped < req.max_pages:
            try:
                resp = await client.get(
                    f"{base}/rest/api/content/search",
                    params={"cql": cql, "limit": limit, "start": start, "expand": "body.storage,version,space"},
                )
                resp.raise_for_status()
                payload = resp.json()
            except Exception as exc:
                errors.append(f"fetch start={start}: {exc}")
                break

            results = payload.get("results", [])
            if not results:
                break

            for page in results:
                if queued + skipped >= req.max_pages:
                    break
                page_id = page.get("id")
                title = page.get("title", page_id)
                body_html = (page.get("body") or {}).get("storage", {}).get("value") or ""

                if not body_html:
                    skipped += 1
                    continue

                # Strip Confluence XML/HTML tags down to plain-ish text
                import re as _re
                text = _re.sub(r"<[^>]+>", " ", body_html)
                text = _re.sub(r"\s+", " ", text).strip()
                if len(text) < 20:
                    skipped += 1
                    continue

                if req.skip_existing:
                    existing = await session.execute(
                        select(DBDocument).where(
                            DBDocument.collection_id == uuid.UUID(req.collection_id),
                            DBDocument.name == title,
                        )
                    )
                    if existing.first() is not None:
                        skipped += 1
                        continue

                try:
                    doc_id = str(uuid.uuid4())
                    space_key = (page.get("space") or {}).get("key", "")
                    doc = DBDocument(
                        id=uuid.UUID(doc_id),
                        collection_id=uuid.UUID(req.collection_id),
                        name=title,
                        status="processing",
                        metadata_={
                            "source": "confluence",
                            "base_url": base,
                            "space_key": space_key,
                            "page_id": page_id,
                            "version": (page.get("version") or {}).get("number"),
                        },
                    )
                    session.add(doc)
                    await session.commit()
                    background.add_task(_index_bytes_task, doc_id, req.collection_id, title + ".txt", text.encode("utf-8"))
                    queued += 1
                except Exception as exc:
                    errors.append(f"{page_id}: {exc}")

            if len(results) < limit:
                break
            start += limit

    await _record_run(session, connector="confluence", collection_id=req.collection_id, status="accepted", queued=queued, skipped=skipped, errors=len(errors))

    return ConfluenceSyncResponse(
        status="accepted",
        collection_id=req.collection_id,
        queued=queued,
        skipped=skipped,
        errors=errors[:20],
    )


# ====== Microsoft SharePoint / OneDrive (Graph API) ======

class SharepointSyncRequest(BaseModel):
    collection_id: str
    tenant_id: str = Field(..., description="Azure AD tenant ID")
    client_id: str = Field(..., description="Azure AD app (client) ID")
    client_secret: str = Field(..., description="Azure AD app client secret")
    site_id: str = Field(..., description="SharePoint site id (hostname,site,web) or /sites/name")
    drive_id: Optional[str] = Field(None, description="Specific drive; defaults to site default drive")
    folder_path: str = Field("/", description="Folder path within drive, default root")
    max_files: int = Field(100, ge=1, le=2000)
    skip_existing: bool = True


class SharepointSyncResponse(BaseModel):
    status: str
    collection_id: str
    queued: int
    skipped: int
    errors: list[str]


async def _graph_token(tenant_id: str, client_id: str, client_secret: str) -> str:
    import httpx
    url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"
    data = {
        "grant_type": "client_credentials",
        "client_id": client_id,
        "client_secret": client_secret,
        "scope": "https://graph.microsoft.com/.default",
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(url, data=data)
        resp.raise_for_status()
        return resp.json()["access_token"]


@router.post("/sharepoint/sync", response_model=SharepointSyncResponse, status_code=status.HTTP_202_ACCEPTED)
async def sync_sharepoint(
    req: SharepointSyncRequest,
    background: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
) -> SharepointSyncResponse:
    """List files in a SharePoint drive folder via Graph API, queue each for indexing."""
    try:
        import httpx
    except ImportError:
        raise HTTPException(500, "httpx not installed")

    col = await session.get(DBCollection, uuid.UUID(req.collection_id))
    if not col:
        raise HTTPException(404, "Collection not found")

    try:
        token = await _graph_token(req.tenant_id, req.client_id, req.client_secret)
    except Exception as exc:
        raise HTTPException(401, f"Azure AD token exchange failed: {exc}")

    queued = 0
    skipped = 0
    errors: list[str] = []
    headers = {"Authorization": f"Bearer {token}"}

    # Build drive root URL
    if req.drive_id:
        base = f"https://graph.microsoft.com/v1.0/drives/{req.drive_id}"
    else:
        base = f"https://graph.microsoft.com/v1.0/sites/{req.site_id}/drive"

    folder_path = req.folder_path.strip("/")
    list_url = f"{base}/root/children" if not folder_path else f"{base}/root:/{folder_path}:/children"

    async with httpx.AsyncClient(timeout=60.0, headers=headers) as client:
        next_url = list_url
        while next_url and (queued + skipped) < req.max_files:
            try:
                resp = await client.get(next_url)
                resp.raise_for_status()
                payload = resp.json()
            except Exception as exc:
                errors.append(f"list: {exc}")
                break

            for item in payload.get("value", []):
                if queued + skipped >= req.max_files:
                    break
                # Only files (not folders)
                if "file" not in item:
                    continue
                name = item.get("name", item.get("id"))
                item_id = item.get("id")
                mime = item.get("file", {}).get("mimeType", "")
                size = item.get("size", 0)

                # Skip huge files (>10MB) — index summary would need a separate chunking path
                if size > 10 * 1024 * 1024:
                    skipped += 1
                    continue

                if req.skip_existing:
                    existing = await session.execute(
                        select(DBDocument).where(
                            DBDocument.collection_id == uuid.UUID(req.collection_id),
                            DBDocument.name == name,
                        )
                    )
                    if existing.first() is not None:
                        skipped += 1
                        continue

                # Download content
                dl = item.get("@microsoft.graph.downloadUrl")
                if not dl:
                    # Fallback to Graph /content
                    dl = f"{base}/items/{item_id}/content"
                try:
                    dr = await client.get(dl)
                    dr.raise_for_status()
                    body = dr.content
                except Exception as exc:
                    errors.append(f"{name}: {exc}")
                    continue

                try:
                    doc_id = str(uuid.uuid4())
                    doc = DBDocument(
                        id=uuid.UUID(doc_id),
                        collection_id=uuid.UUID(req.collection_id),
                        name=name,
                        status="processing",
                        metadata_={
                            "source": "sharepoint",
                            "site_id": req.site_id,
                            "item_id": item_id,
                            "mime_type": mime,
                            "size": size,
                        },
                    )
                    session.add(doc)
                    await session.commit()
                    background.add_task(_index_bytes_task, doc_id, req.collection_id, name, body)
                    queued += 1
                except Exception as exc:
                    errors.append(f"{name}: {exc}")

            next_url = payload.get("@odata.nextLink")

    await _record_run(session, connector="sharepoint", collection_id=req.collection_id, status="accepted", queued=queued, skipped=skipped, errors=len(errors))

    return SharepointSyncResponse(
        status="accepted",
        collection_id=req.collection_id,
        queued=queued,
        skipped=skipped,
        errors=errors[:20],
    )


# ====== Google Drive connector ======

class GdriveSyncRequest(BaseModel):
    collection_id: str
    oauth_token: str = Field(..., description="OAuth2 access token with drive.readonly scope")
    folder_id: Optional[str] = Field(None, description="Folder to sync (default: root)")
    mime_filter: Optional[str] = Field("application/pdf,application/vnd.google-apps.document,text/plain", description="Comma-separated MIME types to include")
    max_files: int = Field(100, ge=1, le=2000)
    skip_existing: bool = True


class GdriveSyncResponse(BaseModel):
    status: str
    collection_id: str
    queued: int
    skipped: int
    errors: list[str]


@router.post("/gdrive/sync", response_model=GdriveSyncResponse, status_code=status.HTTP_202_ACCEPTED)
async def sync_google_drive(
    req: GdriveSyncRequest,
    background: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
) -> GdriveSyncResponse:
    """List files in a Google Drive folder and queue each for indexing."""
    try:
        import httpx
    except ImportError:
        raise HTTPException(500, "httpx not installed")

    col = await session.get(DBCollection, uuid.UUID(req.collection_id))
    if not col:
        raise HTTPException(404, "Collection not found")

    queued = 0
    skipped = 0
    errors: list[str] = []
    headers = {"Authorization": f"Bearer {req.oauth_token}"}

    # Build Drive search query
    q_parts = ["trashed = false"]
    if req.folder_id:
        q_parts.append(f"'{req.folder_id}' in parents")
    if req.mime_filter:
        mimes = [m.strip() for m in req.mime_filter.split(",") if m.strip()]
        mime_q = " or ".join(f"mimeType = '{m}'" for m in mimes)
        q_parts.append(f"({mime_q})")
    q = " and ".join(q_parts)

    async with httpx.AsyncClient(timeout=60.0, headers=headers) as client:
        page_token: Optional[str] = None
        while queued + skipped < req.max_files:
            params = {
                "q": q,
                "fields": "nextPageToken,files(id,name,mimeType,size,modifiedTime)",
                "pageSize": min(100, req.max_files - queued - skipped),
            }
            if page_token:
                params["pageToken"] = page_token
            try:
                resp = await client.get("https://www.googleapis.com/drive/v3/files", params=params)
                resp.raise_for_status()
                payload = resp.json()
            except Exception as exc:
                errors.append(f"list: {exc}")
                break

            files = payload.get("files", [])
            if not files:
                break

            for f in files:
                if queued + skipped >= req.max_files:
                    break
                file_id = f.get("id")
                name = f.get("name", file_id)
                mime = f.get("mimeType", "")
                size = int(f.get("size", 0) or 0)

                if size > 10 * 1024 * 1024:
                    skipped += 1
                    continue

                if req.skip_existing:
                    existing = await session.execute(
                        select(DBDocument).where(
                            DBDocument.collection_id == uuid.UUID(req.collection_id),
                            DBDocument.name == name,
                        )
                    )
                    if existing.first() is not None:
                        skipped += 1
                        continue

                # Download — Google Docs need export, others use alt=media
                try:
                    if mime == "application/vnd.google-apps.document":
                        dl_url = f"https://www.googleapis.com/drive/v3/files/{file_id}/export"
                        dl_params = {"mimeType": "text/plain"}
                    else:
                        dl_url = f"https://www.googleapis.com/drive/v3/files/{file_id}"
                        dl_params = {"alt": "media"}
                    dr = await client.get(dl_url, params=dl_params)
                    dr.raise_for_status()
                    body = dr.content
                except Exception as exc:
                    errors.append(f"{name}: {exc}")
                    continue

                try:
                    doc_id = str(uuid.uuid4())
                    doc = DBDocument(
                        id=uuid.UUID(doc_id),
                        collection_id=uuid.UUID(req.collection_id),
                        name=name,
                        status="processing",
                        metadata_={
                            "source": "gdrive",
                            "file_id": file_id,
                            "mime_type": mime,
                            "size": size,
                            "modified_at": f.get("modifiedTime"),
                        },
                    )
                    session.add(doc)
                    await session.commit()
                    background.add_task(_index_bytes_task, doc_id, req.collection_id, name, body)
                    queued += 1
                except Exception as exc:
                    errors.append(f"{name}: {exc}")

            page_token = payload.get("nextPageToken")
            if not page_token:
                break

    await _record_run(session, connector="gdrive", collection_id=req.collection_id, status="accepted", queued=queued, skipped=skipped, errors=len(errors))

    return GdriveSyncResponse(
        status="accepted",
        collection_id=req.collection_id,
        queued=queued,
        skipped=skipped,
        errors=errors[:20],
    )


# ====== SMB / CIFS connector ======

class SmbSyncRequest(BaseModel):
    collection_id: str
    server: str = Field(..., description="SMB server hostname or IP")
    share: str = Field(..., description="Share name")
    username: str
    password: str
    domain: Optional[str] = None
    path: str = Field("/", description="Subdirectory under share to walk")
    max_files: int = Field(100, ge=1, le=2000)
    skip_existing: bool = True


class SmbSyncResponse(BaseModel):
    status: str
    collection_id: str
    queued: int
    skipped: int
    errors: list[str]


@router.post("/smb/sync", response_model=SmbSyncResponse, status_code=status.HTTP_202_ACCEPTED)
async def sync_smb(
    req: SmbSyncRequest,
    background: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
) -> SmbSyncResponse:
    """List files in an SMB share + queue each for indexing.

    Requires `smbprotocol` Python package. Walks recursively from `path`
    skipping subdirectories beyond first level. Files >10MB are skipped.
    """
    try:
        import smbclient  # type: ignore[import-not-found]
    except ImportError:
        raise HTTPException(500, "smbprotocol not installed in this image — pip install smbprotocol")

    col = await session.get(DBCollection, uuid.UUID(req.collection_id))
    if not col:
        raise HTTPException(404, "Collection not found")

    queued = 0
    skipped = 0
    errors: list[str] = []

    try:
        smbclient.register_session(req.server, username=req.username, password=req.password)
    except Exception as exc:
        raise HTTPException(401, f"SMB auth failed: {exc}")

    base_path = f"\\\\{req.server}\\{req.share}\\{req.path.lstrip('/').replace('/', chr(92))}"
    try:
        for entry in smbclient.scandir(base_path):
            if queued + skipped >= req.max_files:
                break
            if not entry.is_file():
                continue
            name = entry.name
            full = f"{base_path}\\{name}"
            stat = entry.stat()
            if stat.st_size > 10 * 1024 * 1024:
                skipped += 1
                continue

            if req.skip_existing:
                existing = await session.execute(
                    select(DBDocument).where(
                        DBDocument.collection_id == uuid.UUID(req.collection_id),
                        DBDocument.name == name,
                    )
                )
                if existing.first() is not None:
                    skipped += 1
                    continue

            try:
                with smbclient.open_file(full, mode="rb") as fh:
                    body = fh.read()
                doc_id = str(uuid.uuid4())
                doc = DBDocument(
                    id=uuid.UUID(doc_id),
                    collection_id=uuid.UUID(req.collection_id),
                    name=name,
                    status="processing",
                    metadata_={
                        "source": "smb",
                        "server": req.server,
                        "share": req.share,
                        "path": req.path,
                        "size": stat.st_size,
                    },
                )
                session.add(doc)
                await session.commit()
                background.add_task(_index_bytes_task, doc_id, req.collection_id, name, body)
                queued += 1
            except Exception as exc:
                errors.append(f"{name}: {exc}")
    except Exception as exc:
        raise HTTPException(502, f"SMB list failed: {exc}")

    await _record_run(session, connector="smb", collection_id=req.collection_id, status="accepted", queued=queued, skipped=skipped, errors=len(errors))

    return SmbSyncResponse(
        status="accepted",
        collection_id=req.collection_id,
        queued=queued,
        skipped=skipped,
        errors=errors[:20],
    )


# ====== NFS / local mount connector ======

class NfsSyncRequest(BaseModel):
    collection_id: str
    mount_path: str = Field(..., description="Local mount path (mounted via OS NFS) inside the container")
    glob_pattern: str = Field("**/*", description="Glob pattern relative to mount_path")
    max_files: int = Field(200, ge=1, le=5000)
    skip_existing: bool = True


class NfsSyncResponse(BaseModel):
    status: str
    collection_id: str
    queued: int
    skipped: int
    errors: list[str]


@router.post("/nfs/sync", response_model=NfsSyncResponse, status_code=status.HTTP_202_ACCEPTED)
async def sync_nfs(
    req: NfsSyncRequest,
    background: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
) -> NfsSyncResponse:
    """Walk a local NFS-mounted directory + index files. The container needs the
    mount accessible at mount_path; mount-bind via docker-compose volumes to expose."""
    import pathlib

    col = await session.get(DBCollection, uuid.UUID(req.collection_id))
    if not col:
        raise HTTPException(404, "Collection not found")

    root = pathlib.Path(req.mount_path)
    if not root.exists() or not root.is_dir():
        raise HTTPException(400, f"mount_path does not exist or not a directory: {req.mount_path}")

    queued = 0
    skipped = 0
    errors: list[str] = []
    for f in root.glob(req.glob_pattern):
        if queued + skipped >= req.max_files:
            break
        if not f.is_file():
            continue
        size = f.stat().st_size
        if size > 10 * 1024 * 1024:
            skipped += 1
            continue
        name = f.name

        if req.skip_existing:
            existing = await session.execute(
                select(DBDocument).where(
                    DBDocument.collection_id == uuid.UUID(req.collection_id),
                    DBDocument.name == name,
                )
            )
            if existing.first() is not None:
                skipped += 1
                continue

        try:
            body = f.read_bytes()
            doc_id = str(uuid.uuid4())
            doc = DBDocument(
                id=uuid.UUID(doc_id),
                collection_id=uuid.UUID(req.collection_id),
                name=name,
                status="processing",
                metadata_={"source": "nfs", "mount_path": req.mount_path,
                           "rel_path": str(f.relative_to(root)), "size": size},
            )
            session.add(doc)
            await session.commit()
            background.add_task(_index_bytes_task, doc_id, req.collection_id, name, body)
            queued += 1
        except Exception as exc:
            errors.append(f"{name}: {exc}")

    await _record_run(session, connector="nfs", collection_id=req.collection_id, status="accepted", queued=queued, skipped=skipped, errors=len(errors))

    return NfsSyncResponse(
        status="accepted",
        collection_id=req.collection_id,
        queued=queued,
        skipped=skipped,
        errors=errors[:20],
    )


# ====== SFTP connector ======

class SftpSyncRequest(BaseModel):
    collection_id: str
    host: str
    port: int = Field(22, ge=1, le=65535)
    username: str
    password: Optional[str] = None
    private_key_pem: Optional[str] = Field(None, description="OpenSSH private key contents")
    remote_path: str = Field(".", description="Directory on the SFTP server to walk")
    max_files: int = Field(100, ge=1, le=2000)
    skip_existing: bool = True


class SftpSyncResponse(BaseModel):
    status: str
    collection_id: str
    queued: int
    skipped: int
    errors: list[str]


@router.post("/sftp/sync", response_model=SftpSyncResponse, status_code=status.HTTP_202_ACCEPTED)
async def sync_sftp(
    req: SftpSyncRequest,
    background: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
) -> SftpSyncResponse:
    """Connect to SFTP server, list remote directory, queue each file for indexing."""
    try:
        import paramiko  # type: ignore[import-not-found]
    except ImportError:
        raise HTTPException(500, "paramiko not installed in this image — pip install paramiko")
    import io

    col = await session.get(DBCollection, uuid.UUID(req.collection_id))
    if not col:
        raise HTTPException(404, "Collection not found")

    if not req.password and not req.private_key_pem:
        raise HTTPException(400, "Provide either password or private_key_pem")

    queued = 0
    skipped = 0
    errors: list[str] = []

    transport = paramiko.Transport((req.host, req.port))
    try:
        if req.private_key_pem:
            pk = paramiko.RSAKey.from_private_key(io.StringIO(req.private_key_pem))
            transport.connect(username=req.username, pkey=pk)
        else:
            transport.connect(username=req.username, password=req.password)
        sftp = paramiko.SFTPClient.from_transport(transport)
        if sftp is None:
            raise HTTPException(500, "SFTP channel open failed")
        try:
            entries = sftp.listdir_attr(req.remote_path)
            for entry in entries:
                if queued + skipped >= req.max_files:
                    break
                # Skip directories
                if entry.st_mode and (entry.st_mode & 0o040000):
                    continue
                name = entry.filename
                size = entry.st_size or 0
                if size > 10 * 1024 * 1024:
                    skipped += 1
                    continue

                if req.skip_existing:
                    existing = await session.execute(
                        select(DBDocument).where(
                            DBDocument.collection_id == uuid.UUID(req.collection_id),
                            DBDocument.name == name,
                        )
                    )
                    if existing.first() is not None:
                        skipped += 1
                        continue

                try:
                    remote = req.remote_path.rstrip("/") + "/" + name
                    with sftp.open(remote, "rb") as fh:
                        body = fh.read()
                    doc_id = str(uuid.uuid4())
                    doc = DBDocument(
                        id=uuid.UUID(doc_id),
                        collection_id=uuid.UUID(req.collection_id),
                        name=name,
                        status="processing",
                        metadata_={"source": "sftp", "host": req.host,
                                   "remote_path": remote, "size": size},
                    )
                    session.add(doc)
                    await session.commit()
                    background.add_task(_index_bytes_task, doc_id, req.collection_id, name, body)
                    queued += 1
                except Exception as exc:
                    errors.append(f"{name}: {exc}")
        finally:
            sftp.close()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(502, f"SFTP error: {exc}")
    finally:
        try:
            transport.close()
        except Exception:
            pass

    await _record_run(session, connector="sftp", collection_id=req.collection_id, status="accepted", queued=queued, skipped=skipped, errors=len(errors))

    return SftpSyncResponse(
        status="accepted",
        collection_id=req.collection_id,
        queued=queued,
        skipped=skipped,
        errors=errors[:20],
    )


# ---- Sync run log helper ----

import datetime as _dt

async def _record_run(session: AsyncSession, *, connector: str, collection_id: str, status: str,
                       queued: int, skipped: int, errors: int, request_meta: dict | None = None,
                       error_summary: str | None = None, started_at: _dt.datetime | None = None) -> None:
    """Insert a row into connector_sync_runs (best-effort)."""
    try:
        from sqlalchemy import text
        s2 = started_at or _dt.datetime.now(_dt.UTC)
        completed = _dt.datetime.now(_dt.UTC)
        duration_ms = int((completed - s2).total_seconds() * 1000)
        await session.execute(text("""
            INSERT INTO connector_sync_runs (collection_id, connector, status, queued, skipped, errors,
                                              started_at, completed_at, duration_ms, request_meta, error_summary)
            VALUES (CAST(:cid AS uuid), :connector, :status, :q, :sk, :er,
                    :started, :completed, :dur, CAST(:meta AS jsonb), :err)
        """), {
            "cid": collection_id, "connector": connector, "status": status,
            "q": queued, "sk": skipped, "er": errors,
            "started": s2, "completed": completed, "dur": duration_ms,
            "meta": __import__("json").dumps(request_meta or {}),
            "err": error_summary,
        })
        await session.commit()
    except Exception as exc:
        import logging
        logging.getLogger(__name__).debug("sync run record failed: %s", exc)


@router.get("/runs")
async def list_runs(session: AsyncSession = Depends(get_session), limit: int = 50):
    """List recent connector sync runs."""
    from sqlalchemy import text
    rows = (await session.execute(text("""
        SELECT id, collection_id, connector, status, queued, skipped, errors,
               started_at, completed_at, duration_ms, error_summary
        FROM connector_sync_runs
        ORDER BY started_at DESC LIMIT :lim
    """), {"lim": limit})).fetchall()
    return [
        {
            "id": str(r[0]),
            "collection_id": str(r[1]) if r[1] else None,
            "connector": r[2],
            "status": r[3],
            "queued": r[4],
            "skipped": r[5],
            "errors": r[6],
            "started_at": r[7].isoformat() if r[7] else None,
            "completed_at": r[8].isoformat() if r[8] else None,
            "duration_ms": r[9],
            "error_summary": r[10],
        }
        for r in rows
    ]


# ====== Azure Blob Storage connector ======

class AzureBlobSyncRequest(BaseModel):
    collection_id: str
    connection_string: str = Field(..., description="Azure storage account connection string")
    container_name: str
    prefix: str = Field("", description="Blob name prefix filter")
    max_blobs: int = Field(200, ge=1, le=5000)
    skip_existing: bool = True


class AzureBlobSyncResponse(BaseModel):
    status: str
    collection_id: str
    queued: int
    skipped: int
    errors: list[str]


@router.post("/azure-blob/sync", response_model=AzureBlobSyncResponse, status_code=status.HTTP_202_ACCEPTED)
async def sync_azure_blob(
    req: AzureBlobSyncRequest,
    background: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
) -> AzureBlobSyncResponse:
    """List blobs in an Azure Blob container + queue each for indexing."""
    try:
        from azure.storage.blob.aio import ContainerClient  # type: ignore
    except ImportError:
        raise HTTPException(500, "azure-storage-blob not installed — pip install azure-storage-blob aiohttp")

    col = await session.get(DBCollection, uuid.UUID(req.collection_id))
    if not col:
        raise HTTPException(404, "Collection not found")

    queued = 0
    skipped = 0
    errors: list[str] = []

    async with ContainerClient.from_connection_string(req.connection_string, req.container_name) as cc:
        async for blob in cc.list_blobs(name_starts_with=req.prefix or None):
            if queued + skipped >= req.max_blobs:
                break
            name = blob.name
            size = blob.size or 0
            if size > 10 * 1024 * 1024:
                skipped += 1
                continue

            if req.skip_existing:
                existing = await session.execute(
                    select(DBDocument).where(
                        DBDocument.collection_id == uuid.UUID(req.collection_id),
                        DBDocument.name == name,
                    )
                )
                if existing.first() is not None:
                    skipped += 1
                    continue

            try:
                dl = await cc.download_blob(name)
                body = await dl.readall()
                doc_id = str(uuid.uuid4())
                doc = DBDocument(
                    id=uuid.UUID(doc_id),
                    collection_id=uuid.UUID(req.collection_id),
                    name=name,
                    status="processing",
                    metadata_={"source": "azure-blob", "container": req.container_name, "blob": name, "size": size},
                )
                session.add(doc)
                await session.commit()
                background.add_task(_index_bytes_task, doc_id, req.collection_id, name, body)
                queued += 1
            except Exception as exc:
                errors.append(f"{name}: {exc}")

    await _record_run(session, connector="azure-blob", collection_id=req.collection_id,
                      status="accepted", queued=queued, skipped=skipped, errors=len(errors))
    return AzureBlobSyncResponse(
        status="accepted", collection_id=req.collection_id, queued=queued, skipped=skipped, errors=errors[:20])


# ====== Google Cloud Storage connector ======

class GcsSyncRequest(BaseModel):
    collection_id: str
    project_id: str = Field(..., description="GCP project ID")
    bucket_name: str
    prefix: str = Field("", description="Object name prefix filter")
    service_account_json: Optional[str] = Field(None, description="GCP SA key JSON contents (base64)")
    max_objects: int = Field(200, ge=1, le=5000)
    skip_existing: bool = True


class GcsSyncResponse(BaseModel):
    status: str
    collection_id: str
    queued: int
    skipped: int
    errors: list[str]


@router.post("/gcs/sync", response_model=GcsSyncResponse, status_code=status.HTTP_202_ACCEPTED)
async def sync_gcs(
    req: GcsSyncRequest,
    background: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
) -> GcsSyncResponse:
    """List objects in a GCS bucket + queue each for indexing."""
    try:
        import httpx
    except ImportError:
        raise HTTPException(500, "httpx not installed")

    col = await session.get(DBCollection, uuid.UUID(req.collection_id))
    if not col:
        raise HTTPException(404, "Collection not found")

    queued = 0
    skipped = 0
    errors: list[str] = []

    # Use GCS JSON API (no client lib needed — just httpx + OAuth2)
    import os
    token = os.getenv("GOOGLE_ACCESS_TOKEN", "")
    if not token and req.service_account_json:
        errors.append("SA key exchange not implemented in heuristic version; set GOOGLE_ACCESS_TOKEN env")
        return GcsSyncResponse(status="error", collection_id=req.collection_id, queued=0, skipped=0, errors=errors)

    headers = {"Authorization": f"Bearer {token}"} if token else {}
    base = f"https://storage.googleapis.com/storage/v1/b/{req.bucket_name}/o"

    async with httpx.AsyncClient(timeout=60.0, headers=headers) as client:
        params = {"prefix": req.prefix, "maxResults": min(500, req.max_objects)}
        page_token = None
        while queued + skipped < req.max_objects:
            if page_token:
                params["pageToken"] = page_token
            try:
                resp = await client.get(base, params=params)
                resp.raise_for_status()
                payload = resp.json()
            except Exception as exc:
                errors.append(f"list: {exc}")
                break

            items = payload.get("items", [])
            if not items:
                break

            for item in items:
                if queued + skipped >= req.max_objects:
                    break
                name = item.get("name", "")
                size = int(item.get("size", 0))
                if name.endswith("/") or size > 10 * 1024 * 1024:
                    skipped += 1
                    continue

                if req.skip_existing:
                    existing = await session.execute(
                        select(DBDocument).where(
                            DBDocument.collection_id == uuid.UUID(req.collection_id),
                            DBDocument.name == name,
                        )
                    )
                    if existing.first() is not None:
                        skipped += 1
                        continue

                try:
                    dl_url = item.get("mediaLink") or f"{base}/{name}?alt=media"
                    dr = await client.get(dl_url)
                    dr.raise_for_status()
                    body = dr.content
                    doc_id = str(uuid.uuid4())
                    doc = DBDocument(
                        id=uuid.UUID(doc_id),
                        collection_id=uuid.UUID(req.collection_id),
                        name=name,
                        status="processing",
                        metadata_={"source": "gcs", "bucket": req.bucket_name, "object": name, "size": size},
                    )
                    session.add(doc)
                    await session.commit()
                    background.add_task(_index_bytes_task, doc_id, req.collection_id, name, body)
                    queued += 1
                except Exception as exc:
                    errors.append(f"{name}: {exc}")

            page_token = payload.get("nextPageToken")
            if not page_token:
                break

    await _record_run(session, connector="gcs", collection_id=req.collection_id,
                      status="accepted", queued=queued, skipped=skipped, errors=len(errors))
    return GcsSyncResponse(
        status="accepted", collection_id=req.collection_id, queued=queued, skipped=skipped, errors=errors[:20])
