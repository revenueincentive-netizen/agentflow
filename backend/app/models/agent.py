import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, JSON, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Agent(Base):
    """An AI agent definition for a tenant."""

    __tablename__ = "agents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    llm_config_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("llm_configs.id", ondelete="SET NULL")
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    system_prompt: Mapped[str] = mapped_column(
        Text,
        default="You are a helpful AI assistant. Answer questions accurately based on the data available to you.",
    )
    # List of connector IDs this agent can access
    connector_ids: Mapped[list] = mapped_column(JSON, default=list)
    # Agent behaviour settings
    settings: Mapped[dict] = mapped_column(
        JSON,
        default=lambda: {
            "temperature": 0.2,
            "max_tokens": 4096,
            "enable_rag": True,
            "memory_window": 10,
        },
    )
    is_active: Mapped[bool] = mapped_column(default=True)
    is_public: Mapped[bool] = mapped_column(default=False)  # shareable via embed
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    # Relationships
    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="agents")
    llm_config: Mapped["LLMConfig | None"] = relationship("LLMConfig")
    conversations: Mapped[list["Conversation"]] = relationship(
        "Conversation", back_populates="agent", cascade="all, delete-orphan"
    )


class LLMConfig(Base):
    """A tenant-specific LLM provider configuration (API keys encrypted at rest)."""

    __tablename__ = "llm_configs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    provider: Mapped[str] = mapped_column(String(50), nullable=False)  # openai | azure_openai | anthropic | google
    model: Mapped[str] = mapped_column(String(200), nullable=False)
    # Encrypted API key — decrypted only at runtime, never returned via API
    encrypted_api_key: Mapped[str] = mapped_column(Text, nullable=False)
    # Provider-specific extra config (e.g. azure endpoint, deployment name)
    extra: Mapped[dict] = mapped_column(JSON, default=dict)
    is_default: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))

    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="llm_configs")
