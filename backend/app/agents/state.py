"""
Agent state definition for LangGraph.
Each key is carried through the graph and updated by nodes.
"""

from typing import Annotated, Any
from typing_extensions import TypedDict
from langgraph.graph.message import add_messages


class AgentState(TypedDict):
    # Full conversation history (LangGraph manages append-only via add_messages)
    messages: Annotated[list, add_messages]
    # Tenant / agent context passed once at graph entry
    tenant_id: str
    agent_id: str
    # Tools available to this agent (injected at compile time)
    tool_names: list[str]
    # Retrieved context chunks from RAG
    retrieved_context: list[dict[str, Any]]
    # Metadata the agent can write (e.g. citations, confidence)
    metadata: dict[str, Any]
