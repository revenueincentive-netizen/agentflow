"""Auth endpoints: register, login, refresh, me, invite, members."""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.core.security import create_access_token, create_refresh_token, decode_token, hash_password, verify_password
from app.core.config import settings
from app.models import Tenant, User

router = APIRouter(prefix="/auth", tags=["auth"])


# ─── Schemas ─────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    company_name: str
    email: EmailStr
    password: str
    full_name: str | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: str
    email: str
    full_name: str | None
    role: str
    tenant_id: str


class InviteRequest(BaseModel):
    email: EmailStr
    role: str = "member"   # member | admin


class AcceptInviteRequest(BaseModel):
    token: str
    password: str
    full_name: str | None = None


class MemberOut(BaseModel):
    id: str
    email: str
    full_name: str | None
    role: str
    is_active: bool
    created_at: str


# ─── Routes ──────────────────────────────────────────────────────────────────

@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, db: Annotated[AsyncSession, Depends(get_db)]):
    """Create a new tenant + owner account."""
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")

    slug = body.company_name.lower().replace(" ", "-")[:100]
    tenant = Tenant(name=body.company_name, slug=slug)
    db.add(tenant)
    await db.flush()

    user = User(
        tenant_id=tenant.id,
        email=body.email,
        hashed_password=hash_password(body.password),
        full_name=body.full_name,
        role="owner",
    )
    db.add(user)
    await db.flush()

    return TokenResponse(
        access_token=create_access_token(str(user.id), {"tenant_id": str(tenant.id), "role": user.role}),
        refresh_token=create_refresh_token(str(user.id)),
    )


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: Annotated[AsyncSession, Depends(get_db)]):
    result = await db.execute(select(User).where(User.email == body.email, User.is_active == True))
    user = result.scalar_one_or_none()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    user.last_login = datetime.now(UTC)
    return TokenResponse(
        access_token=create_access_token(str(user.id), {"tenant_id": str(user.tenant_id), "role": user.role}),
        refresh_token=create_refresh_token(str(user.id)),
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(refresh_token: str, db: Annotated[AsyncSession, Depends(get_db)]):
    try:
        payload = decode_token(refresh_token)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Not a refresh token")

    from uuid import UUID
    user_id = UUID(payload["sub"])
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return TokenResponse(
        access_token=create_access_token(str(user.id), {"tenant_id": str(user.tenant_id), "role": user.role}),
        refresh_token=create_refresh_token(str(user.id)),
    )


@router.get("/me", response_model=UserOut)
async def me(user: Annotated[User, Depends(get_current_user)]):
    return UserOut(
        id=str(user.id),
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        tenant_id=str(user.tenant_id),
    )


# ─── Team / Invite ────────────────────────────────────────────────────────────

@router.post("/invite")
async def invite_member(
    body: InviteRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Generate a 7-day invite token for a new team member (owner/admin only)."""
    if user.role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Only owners and admins can invite members")
    if body.role not in ("member", "admin"):
        raise HTTPException(status_code=400, detail="Role must be 'member' or 'admin'")

    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="This email is already registered")

    from jose import jwt as _jwt
    payload = {
        "sub": str(user.id),
        "tenant_id": str(user.tenant_id),
        "invite_email": str(body.email),
        "role": body.role,
        "exp": datetime.now(UTC) + timedelta(days=7),
        "type": "invite",
    }
    token = _jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return {"invite_token": token}


@router.post("/accept-invite", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def accept_invite(body: AcceptInviteRequest, db: Annotated[AsyncSession, Depends(get_db)]):
    """Accept an invite token, set a password, and join the tenant."""
    try:
        payload = decode_token(body.token)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid or expired invite link")

    if payload.get("type") != "invite":
        raise HTTPException(status_code=400, detail="Invalid invite token")

    email = payload.get("invite_email")
    tenant_id = payload.get("tenant_id")
    role = payload.get("role", "member")

    if not email or not tenant_id:
        raise HTTPException(status_code=400, detail="Malformed invite token")

    existing = await db.execute(select(User).where(User.email == email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="This email is already registered")

    new_user = User(
        tenant_id=uuid.UUID(tenant_id),
        email=email,
        hashed_password=hash_password(body.password),
        full_name=body.full_name,
        role=role,
    )
    db.add(new_user)
    await db.flush()

    return TokenResponse(
        access_token=create_access_token(str(new_user.id), {"tenant_id": tenant_id, "role": new_user.role}),
        refresh_token=create_refresh_token(str(new_user.id)),
    )


@router.get("/members", response_model=list[MemberOut])
async def list_members(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """List all users in the current tenant (owner/admin only)."""
    if user.role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Only owners and admins can view team members")
    result = await db.execute(
        select(User).where(User.tenant_id == user.tenant_id).order_by(User.created_at)
    )
    return [
        MemberOut(
            id=str(m.id),
            email=m.email,
            full_name=m.full_name,
            role=m.role,
            is_active=m.is_active,
            created_at=m.created_at.isoformat(),
        )
        for m in result.scalars().all()
    ]


@router.delete("/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    member_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Deactivate a team member (owner/admin only, cannot remove self)."""
    if user.role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="Only owners and admins can remove members")
    if member_id == user.id:
        raise HTTPException(status_code=400, detail="You cannot remove yourself")
    result = await db.execute(
        select(User).where(User.id == member_id, User.tenant_id == user.tenant_id)
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    member.is_active = False
    await db.commit()
