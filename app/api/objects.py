import mimetypes
from typing import Optional
from fastapi import APIRouter, HTTPException, Query, Request, Response, status
from fastapi.responses import StreamingResponse

from app.config import settings
from app.core.consistency import QuorumNotSatisfiedError, consistency_manager
from app.core.integrity import integrity_manager
from app.core.lock_manager import lock_manager
from app.core.partition import SplitBrainFencingError
from app.core.replication import replication_manager
from app.models.schemas import (
    ObjectDeleteResponse,
    ObjectHistoryResponse,
    ObjectIntegrityReport,
    ObjectListResponse,
    ObjectMetadata,
    ObjectUploadResponse,
)

router = APIRouter(tags=["Objects"])


@router.get("/objects", response_model=ObjectListResponse)
async def list_objects():
    """List all objects currently tracked in the Vault cluster."""
    objects = replication_manager.list_all_objects()
    return ObjectListResponse(count=len(objects), objects=objects)


@router.get("/admin/quorum/validate")
async def validate_quorum_config(
    write_quorum: int = Query(2, ge=1),
    read_quorum: int = Query(2, ge=1),
    replication_factor: int = Query(3, ge=1),
):
    """Validate whether write_quorum and read_quorum satisfy strict quorum consistency W + R > N."""
    try:
        return consistency_manager.validate_quorum(
            write_quorum=write_quorum,
            read_quorum=read_quorum,
            replication_factor=replication_factor,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/objects/{object_name:path}/versions", response_model=ObjectHistoryResponse)
async def get_object_versions(object_name: str):
    """Retrieve full version history for a specific object."""
    history = replication_manager.get_object_history(object_name)
    if not history:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Object '{object_name}' not found",
        )
    return history


@router.get("/objects/{object_name:path}/metadata", response_model=ObjectMetadata)
async def get_object_metadata(object_name: str):
    """Retrieve metadata, version, checksum, and replica locations for an object."""
    try:
        meta = replication_manager.get_object_metadata(object_name)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    if not meta:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Object '{object_name}' not found in cluster metadata",
        )
    return meta


@router.get("/objects/{object_name:path}/verify", response_model=ObjectIntegrityReport)
async def verify_object_integrity(object_name: str, version: Optional[int] = Query(None, ge=1)):
    """Perform on-demand SHA-256 integrity verification across all replicas of an object."""
    try:
        report = integrity_manager.verify_object_integrity(object_name, version=version)
        return report
    except FileNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.head("/objects/{object_name:path}")
async def head_object(object_name: str):
    """Fast check for object existence, size, version, and checksum headers."""
    try:
        meta = replication_manager.get_object_metadata(object_name)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    if not meta:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Object '{object_name}' not found",
        )

    content_type, _ = mimetypes.guess_type(object_name)
    headers = {
        "Content-Length": str(meta.size),
        "Content-Type": content_type or "application/octet-stream",
        "Last-Modified": meta.modified_at.strftime("%a, %d %b %Y %H:%M:%S GMT"),
        "ETag": f'"{meta.checksum}"' if meta.checksum else "",
        "X-Vault-Version": str(meta.version),
        "X-Vault-Checksum": meta.checksum or "",
        "X-Vault-Replicas": ",".join(meta.replicas),
        "X-Vault-Replication-Factor": str(meta.replication_factor),
    }
    return Response(status_code=status.HTTP_200_OK, headers=headers)


@router.get("/objects/{object_name:path}")
async def download_object(
    object_name: str,
    request: Request,
    version: Optional[int] = Query(None, ge=1),
    read_quorum: Optional[int] = Query(None, ge=1),
):
    """Download an object's contents (latest or specific version) via streaming response enforcing read quorum."""
    rq = read_quorum
    if rq is None and "x-vault-read-quorum" in request.headers:
        try:
            rq = int(request.headers["x-vault-read-quorum"])
        except ValueError:
            pass

    async with lock_manager.read_lock(object_name):
        try:
            source_node, stream, quorum_achieved = await replication_manager.read_object_chunks(
                object_name, version=version, read_quorum=rq, chunk_size=settings.CHUNK_SIZE
            )
            meta = replication_manager.get_object_metadata(object_name)
            content_type, _ = mimetypes.guess_type(object_name)

            headers = {
                "Content-Disposition": f'attachment; filename="{object_name}"',
                "Content-Length": str(meta.size) if (meta and version is None) else "",
                "X-Vault-Served-By": source_node,
                "X-Vault-Version": str(version if version is not None else (meta.version if meta else 1)),
                "X-Vault-Checksum": meta.checksum or "" if (meta and version is None) else "",
                "X-Vault-Read-Quorum-Achieved": quorum_achieved,
            }

            return StreamingResponse(
                stream,
                media_type=content_type or "application/octet-stream",
                headers=headers,
            )
        except QuorumNotSatisfiedError as e:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=str(e),
            )
        except FileNotFoundError:
            ver_str = f" (version {version})" if version else ""
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Object '{object_name}'{ver_str} not found on any replica node",
            )
        except ValueError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.put("/objects/{object_name:path}", response_model=ObjectUploadResponse, status_code=status.HTTP_201_CREATED)
@router.post("/objects/{object_name:path}", response_model=ObjectUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_object(
    object_name: str,
    request: Request,
    response: Response,
    replication_factor: Optional[int] = Query(None, ge=1, le=10),
    write_quorum: Optional[int] = Query(None, ge=1),
):
    """Upload an object, create a new version, compute SHA-256, and replicate to nodes with write quorum."""
    rf = replication_factor
    if rf is None and "x-vault-replication-factor" in request.headers:
        try:
            rf = int(request.headers["x-vault-replication-factor"])
        except ValueError:
            pass

    wq = write_quorum
    if wq is None and "x-vault-write-quorum" in request.headers:
        try:
            wq = int(request.headers["x-vault-write-quorum"])
        except ValueError:
            pass

    content_type = request.headers.get("content-type", "")

    # Acquire exclusive write lock per object key
    async with lock_manager.write_lock(object_name):
        try:
            if "multipart/form-data" in content_type:
                form = await request.form()
                file = form.get("file")
                if not file:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Form upload missing 'file' field",
                    )
                content = await file.read()
                upload_content_type = file.content_type
            else:
                content = await request.body()
                upload_content_type = content_type or None

            record = replication_manager.replicate_write(
                object_name=object_name,
                data=content,
                replication_factor=rf,
                write_quorum=wq,
                content_type=upload_content_type,
            )

            response.headers["X-Vault-Write-Quorum-Achieved"] = record.get("write_quorum_achieved", "")

            return ObjectUploadResponse(
                object_id=record["object_id"],
                object_name=object_name,
                version=record["version"],
                size=record["size"],
                checksum=record["checksum"],
                status="stored",
                message=f"Successfully stored version {record['version']} on {len(record['replicas'])} node(s)",
                replicas=record["replicas"],
                replication_factor=record["replication_factor"],
            )
        except (QuorumNotSatisfiedError, SplitBrainFencingError) as e:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=str(e),
            )
        except ValueError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
        except RuntimeError as e:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to store and replicate object: {str(e)}",
            )


@router.delete("/objects/{object_name:path}", response_model=ObjectDeleteResponse)
async def delete_object(object_name: str):
    """Delete an object, its versions, and metadata across the cluster."""
    async with lock_manager.write_lock(object_name):
        try:
            deleted_from = replication_manager.delete_replicas(object_name)
            if not deleted_from:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Object '{object_name}' not found",
                )
            return ObjectDeleteResponse(
                object_name=object_name,
                status="deleted",
                message=f"Object '{object_name}' and its versions deleted from {len(deleted_from)} node(s)",
                deleted_from_nodes=deleted_from,
            )
        except ValueError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

