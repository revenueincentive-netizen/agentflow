"""
LangGraph agent graph builder.

For each (tenant, agent) pair, compiles a ReAct-style graph:
  user message → llm_call → [tool_calls?] → tools → llm_call → ... → END
"""

from typing import Literal

from langchain_core.messages import AIMessage, SystemMessage
from langgraph.graph import END, START, StateGraph
from langgraph.prebuilt import ToolNode

from app.agents.state import AgentState
from app.llm.factory import build_llm


def build_agent_graph(
    *,
    provider: str,
    model: str,
    encrypted_api_key: str,
    extra: dict,
    system_prompt: str,
    tools: list,
):
    """
    Compile and return a LangGraph agent graph.

    Args:
        provider / model / encrypted_api_key / extra: LLM config
        system_prompt: agent persona / instructions
        tools: list of LangChain tool functions
    """
    llm = build_llm(provider, model, encrypted_api_key, extra)
    llm_with_tools = llm.bind_tools(tools) if tools else llm

    # ─── Nodes ───────────────────────────────────────────────────────────────

    async def call_llm(state: AgentState) -> dict:
        """Send messages to the LLM and get a response."""
        messages = [SystemMessage(content=system_prompt)] + state["messages"]
        response = await llm_with_tools.ainvoke(messages)
        return {"messages": [response]}

    tool_node = ToolNode(tools) if tools else None

    # ─── Router ──────────────────────────────────────────────────────────────

    def should_use_tools(state: AgentState) -> Literal["tools", "__end__"]:
        last = state["messages"][-1]
        if isinstance(last, AIMessage) and last.tool_calls:
            return "tools"
        return "__end__"

    # ─── Graph ───────────────────────────────────────────────────────────────

    graph = StateGraph(AgentState)
    graph.add_node("llm", call_llm)

    if tool_node:
        graph.add_node("tools", tool_node)
        graph.add_edge(START, "llm")
        graph.add_conditional_edges("llm", should_use_tools, {"tools": "tools", "__end__": END})
        graph.add_edge("tools", "llm")
    else:
        graph.add_edge(START, "llm")
        graph.add_edge("llm", END)

    return graph.compile()
