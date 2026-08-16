"""Data connector CRUD + file upload endpoint."""

import os
import shutil
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.core.security import encrypt_secret
from app.models import Connector, User

router = APIRouter(prefix="/connectors", tags=["connectors"])


class ConnectorCreate(BaseModel):
    name: str
    connector_type: str  # file | sql | sharepoint | powerbi | crm | rest_api
    description: str | None = None
    config: dict = {}  # caller must encrypt sensitive values before sending


class ConnectorOut(BaseModel):
    id: str
    name: str
    connector_type: str
    description: str | None
    is_active: bool
    rag_status: str


@router.get("/", response_model=list[ConnectorOut])
async def list_connectors(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(select(Connector).where(Connector.tenant_id == user.tenant_id))
    return [
        ConnectorOut(id=str(c.id), name=c.name, connector_type=c.connector_type,
                     description=c.description, is_active=c.is_active, rag_status=c.rag_status)
        for c in result.scalars().all()
    ]


@router.post("/", response_model=ConnectorOut, status_code=status.HTTP_201_CREATED)
async def create_connector(
    body: ConnectorCreate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    # Encrypt sensitive fields based on connector type
    config = dict(body.config)
    if body.connector_type == "sql" and "password" in config:
        config["password"] = encrypt_secret(config["password"])
    if body.connector_type == "sharepoint" and "client_secret" in config:
        config["encrypted_client_secret"] = encrypt_secret(config.pop("client_secret"))

    connector = Connector(
        tenant_id=user.tenant_id,
        name=body.name,
        connector_type=body.connector_type,
        description=body.description,
        config=config,
    )
    db.add(connector)
    await db.flush()
    return ConnectorOut(id=str(connector.id), name=connector.name, connector_type=connector.connector_type,
                        description=connector.description, is_active=True, rag_status="not_indexed")


@router.post("/{connector_id}/upload", status_code=status.HTTP_202_ACCEPTED)
async def upload_file(
    connector_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    file: UploadFile = File(...),
):
    """Upload a file to a file-type connector and trigger RAG indexing."""
    result = await db.execute(
        select(Connector).where(
            Connector.id == connector_id,
            Connector.tenant_id == user.tenant_id,
            Connector.connector_type == "file",
        )
    )
    connector = result.scalar_one_or_none()
    if not connector:
        raise HTTPException(status_code=404, detail="File connector not found")

    # Validate file size
    max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
    content = await file.read()
    if len(content) > max_bytes:
        raise HTTPException(status_code=413, detail=f"File exceeds {settings.MAX_UPLOAD_SIZE_MB} MB limit")

    # Save to disk (in production replace with object storage e.g. Azure Blob / S3)
    upload_dir = os.path.join(settings.UPLOAD_DIR, str(user.tenant_id), str(connector_id))
    os.makedirs(upload_dir, exist_ok=True)
    file_path = os.path.join(upload_dir, file.filename or "upload")
    with open(file_path, "wb") as f:
        f.write(content)

    connector.rag_status = "indexing"
    # In production: enqueue a background task (Celery / ARQ) to run RAG ingestion
    # For now return 202 Accepted
    return {"message": "File received. Indexing started.", "file": file.filename}


@router.delete("/{connector_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_connector(
    connector_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(select(Connector).where(Connector.id == connector_id, Connector.tenant_id == user.tenant_id))
    connector = result.scalar_one_or_none()
    if not connector:
        raise HTTPException(status_code=404, detail="Connector not found")
    await db.delete(connector)
