"""LLM provider configuration endpoints (per-tenant)."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_role
from app.core.database import get_db
from app.core.security import encrypt_secret
from app.models import LLMConfig, User

router = APIRouter(prefix="/llm-configs", tags=["llm-configs"])


class LLMConfigCreate(BaseModel):
    name: str
    provider: str  # openai | azure_openai | anthropic | google
    model: str
    api_key: str  # plaintext — encrypted before storage
    extra: dict = {}
    is_default: bool = False


class LLMConfigOut(BaseModel):
    id: str
    name: str
    provider: str
    model: str
    extra: dict
    is_default: bool


@router.get("/", response_model=list[LLMConfigOut])
async def list_configs(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(select(LLMConfig).where(LLMConfig.tenant_id == user.tenant_id))
    return [
        LLMConfigOut(id=str(c.id), name=c.name, provider=c.provider, model=c.model, extra=c.extra, is_default=c.is_default)
        for c in result.scalars().all()
    ]


@router.post("/", response_model=LLMConfigOut, status_code=status.HTTP_201_CREATED)
async def create_config(
    body: LLMConfigCreate,
    user: Annotated[User, Depends(require_role("owner", "admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    if body.is_default:
        # Unset any existing default for this tenant
        existing = await db.execute(select(LLMConfig).where(LLMConfig.tenant_id == user.tenant_id, LLMConfig.is_default == True))
        for cfg in existing.scalars().all():
            cfg.is_default = False

    config = LLMConfig(
        tenant_id=user.tenant_id,
        name=body.name,
        provider=body.provider,
        model=body.model,
        encrypted_api_key=encrypt_secret(body.api_key),
        extra=body.extra,
        is_default=body.is_default,
    )
    db.add(config)
    await db.flush()
    return LLMConfigOut(id=str(config.id), name=config.name, provider=config.provider,
                        model=config.model, extra=config.extra, is_default=config.is_default)


@router.delete("/{config_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_config(
    config_id: uuid.UUID,
    user: Annotated[User, Depends(require_role("owner", "admin"))],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(select(LLMConfig).where(LLMConfig.id == config_id, LLMConfig.tenant_id == user.tenant_id))
    cfg = result.scalar_one_or_none()
    if not cfg:
        raise HTTPException(status_code=404, detail="Config not found")
    await db.delete(cfg)
