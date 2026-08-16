"""Agent CRUD + chat endpoints."""

import uuid
from typing import Annotated, AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from langchain_core.messages import HumanMessage
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.core.security import decrypt_secret
from app.models import Agent, Connector, Conversation, LLMConfig, User
from app.agents.graph import build_agent_graph
from app.agents.tools import make_rag_search_tool, make_rest_api_tool, make_sql_tool, make_sharepoint_tool
from app.agents.crm_tools import make_salesforce_tools, make_hubspot_tools
from app.agents.sales_templates import SALES_TEMPLATES, TEMPLATES_BY_ID

router = APIRouter(prefix="/agents", tags=["agents"])


# ─── Schemas ─────────────────────────────────────────────────────────────────

class AgentCreate(BaseModel):
    name: str
    description: str | None = None
    system_prompt: str = "You are a helpful AI assistant."
    llm_config_id: str | None = None
    connector_ids: list[str] = []
    template_id: str | None = None  # if set, pre-fills prompt & settings from template
    settings: dict = {}


class AgentOut(BaseModel):
    id: str
    name: str
    description: str | None
    system_prompt: str
    connector_ids: list[str]
    settings: dict
    is_active: bool
    is_public: bool


class AgentUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    system_prompt: str | None = None
    connector_ids: list[str] | None = None
    llm_config_id: str | None = None


class ChatRequest(BaseModel):
    message: str
    conversation_id: str | None = None
    stream: bool = True


# ─── Helpers ─────────────────────────────────────────────────────────────────

async def _resolve_tools(connector_ids: list[str], tenant_id: str, db: AsyncSession) -> list:
    """Load connector records and build the matching tool list."""
    if not connector_ids:
        return []

    ids = [uuid.UUID(c) for c in connector_ids]
    result = await db.execute(
        select(Connector).where(Connector.id.in_(ids), Connector.tenant_id == uuid.UUID(tenant_id), Connector.is_active == True)
    )
    connectors = result.scalars().all()
    tools = []

    for conn in connectors:
        cfg = conn.config
        match conn.connector_type:
            case "file":
                tools.append(make_rag_search_tool(tenant_id, str(conn.id)))
            case "sql":
                tools.append(make_sql_tool(cfg["connection_string"], cfg.get("allowed_tables", [])))
            case "rest_api":
                tools.append(make_rest_api_tool(cfg["base_url"], cfg.get("headers", {}), conn.description or ""))
            case "sharepoint":
                tools.append(
                    make_sharepoint_tool(
                        cfg["tenant_azure_id"], cfg["client_id"],
                        decrypt_secret(cfg["encrypted_client_secret"]), cfg["site_url"],
                    )
                )
            case "crm":
                crm_type = cfg.get("crm_type", "salesforce")
                if crm_type == "salesforce":
                    tools.extend(make_salesforce_tools(cfg["instance_url"], cfg["encrypted_access_token"]))
                elif crm_type == "hubspot":
                    tools.extend(make_hubspot_tools(cfg["encrypted_api_key"]))

    return tools


# ─── Routes ──────────────────────────────────────────────────────────────────

@router.get("/templates")
async def list_templates(_: Annotated[User, Depends(get_current_user)]):
    """Return all pre-built sales agent templates."""
    return SALES_TEMPLATES


@router.get("/", response_model=list[AgentOut])
async def list_agents(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(select(Agent).where(Agent.tenant_id == user.tenant_id))
    return [
        AgentOut(id=str(a.id), name=a.name, description=a.description, system_prompt=a.system_prompt,
                 connector_ids=[str(c) for c in a.connector_ids], settings=a.settings,
                 is_active=a.is_active, is_public=a.is_public)
        for a in result.scalars().all()
    ]


@router.post("/", response_model=AgentOut, status_code=status.HTTP_201_CREATED)
async def create_agent(
    body: AgentCreate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    # If a template is selected, merge template defaults with any overrides
    system_prompt = body.system_prompt
    settings = body.settings
    description = body.description

    if body.template_id:
        tmpl = TEMPLATES_BY_ID.get(body.template_id)
        if not tmpl:
            raise HTTPException(status_code=400, detail=f"Unknown template: {body.template_id}")
        system_prompt = body.system_prompt if body.system_prompt != "You are a helpful AI assistant." else tmpl["system_prompt"]
        settings = {**tmpl["settings"], **body.settings}
        description = description or tmpl["description"]

    agent = Agent(
        tenant_id=user.tenant_id,
        llm_config_id=uuid.UUID(body.llm_config_id) if body.llm_config_id else None,
        name=body.name,
        description=description,
        system_prompt=system_prompt,
        connector_ids=body.connector_ids,
        settings=settings,
    )
    db.add(agent)
    await db.flush()
    return AgentOut(id=str(agent.id), name=agent.name, description=agent.description,
                    system_prompt=agent.system_prompt, connector_ids=body.connector_ids,
                    settings=agent.settings, is_active=True, is_public=False)


@router.delete("/{agent_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_agent(
    agent_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(select(Agent).where(Agent.id == agent_id, Agent.tenant_id == user.tenant_id))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    await db.delete(agent)


@router.patch("/{agent_id}", response_model=AgentOut)
async def update_agent(
    agent_id: uuid.UUID,
    body: AgentUpdate,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    result = await db.execute(select(Agent).where(Agent.id == agent_id, Agent.tenant_id == user.tenant_id))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    if body.name is not None:
        agent.name = body.name
    if body.description is not None:
        agent.description = body.description
    if body.system_prompt is not None:
        agent.system_prompt = body.system_prompt
    if body.connector_ids is not None:
        agent.connector_ids = body.connector_ids
    if body.llm_config_id is not None:
        agent.llm_config_id = uuid.UUID(body.llm_config_id)
    await db.commit()
    await db.refresh(agent)
    return AgentOut(id=str(agent.id), name=agent.name, description=agent.description,
                    system_prompt=agent.system_prompt, connector_ids=[str(c) for c in agent.connector_ids],
                    settings=agent.settings, is_active=agent.is_active, is_public=agent.is_public)


async def chat(
    agent_id: uuid.UUID,
    body: ChatRequest,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Send a message to an agent. Supports streaming via SSE."""
    result = await db.execute(
        select(Agent).where(Agent.id == agent_id, Agent.tenant_id == user.tenant_id, Agent.is_active == True)
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    # Load LLM config
    if agent.llm_config_id:
        llm_result = await db.execute(select(LLMConfig).where(LLMConfig.id == agent.llm_config_id))
        llm_cfg = llm_result.scalar_one_or_none()
    else:
        llm_result = await db.execute(
            select(LLMConfig).where(LLMConfig.tenant_id == user.tenant_id, LLMConfig.is_default == True)
        )
        llm_cfg = llm_result.scalar_one_or_none()

    if not llm_cfg:
        raise HTTPException(status_code=400, detail="No LLM configured. Add an LLM provider in Settings.")

    # Resolve tools for this agent
    tools = await _resolve_tools(agent.connector_ids, str(user.tenant_id), db)

    # Load or create conversation
    conv_id = uuid.UUID(body.conversation_id) if body.conversation_id else None
    if conv_id:
        conv_result = await db.execute(select(Conversation).where(Conversation.id == conv_id, Conversation.tenant_id == user.tenant_id))
        conversation = conv_result.scalar_one_or_none()
    else:
        conversation = Conversation(tenant_id=user.tenant_id, agent_id=agent_id, user_id=user.id, messages=[])
        db.add(conversation)
        await db.flush()

    prior_messages = conversation.messages or []

    # Build graph
    compiled_graph = build_agent_graph(
        provider=llm_cfg.provider,
        model=llm_cfg.model,
        encrypted_api_key=llm_cfg.encrypted_api_key,
        extra={**llm_cfg.extra, **agent.settings},
        system_prompt=agent.system_prompt,
        tools=tools,
    )

    langchain_messages = [
        HumanMessage(content=m["content"]) if m["role"] == "user"
        else type("AI", (), {"content": m["content"], "type": "ai"})()
        for m in prior_messages
    ] + [HumanMessage(content=body.message)]

    state = {
        "messages": langchain_messages,
        "tenant_id": str(user.tenant_id),
        "agent_id": str(agent_id),
        "tool_names": [t.name for t in tools],
        "retrieved_context": [],
        "metadata": {},
    }

    if body.stream:
        async def event_stream() -> AsyncGenerator[str, None]:
            async for chunk in compiled_graph.astream(state, stream_mode="messages"):
                if chunk and hasattr(chunk[0], "content") and chunk[0].content:
                    yield f"data: {chunk[0].content}\n\n"
            # Persist conversation after streaming
            new_messages = prior_messages + [
                {"role": "user", "content": body.message},
                {"role": "assistant", "content": "[streamed]"},
            ]
            conversation.messages = new_messages
            await db.commit()
            yield "data: [DONE]\n\n"

        return StreamingResponse(event_stream(), media_type="text/event-stream")

    # Non-streaming
    result_state = await compiled_graph.ainvoke(state)
    ai_response = result_state["messages"][-1].content
    conversation.messages = prior_messages + [
        {"role": "user", "content": body.message},
        {"role": "assistant", "content": ai_response},
    ]
    return {"conversation_id": str(conversation.id), "response": ai_response}
