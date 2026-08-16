"""
Custom LangChain BaseChatModel using Google's new google-genai SDK (v2.x).

Replaces langchain-google-genai which targets the deprecated
GenerativeLanguage API (models/...). The new google-genai SDK uses the
Interactions API, which works for all accounts including new users.

NOTE: New Gemini API accounts require "thought_signature" to be passed back
with every function response. This wrapper captures and preserves it.
"""
from __future__ import annotations

import base64
import uuid
from typing import Any, List, Optional

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from pydantic import PrivateAttr

try:
    from google import genai
    from google.genai import types as genai_types
except ImportError as exc:  # pragma: no cover
    raise ImportError("Install google-genai: pip install google-genai>=2.0.0") from exc


# ─── Message conversion ──────────────────────────────────────────────────────

def _messages_to_genai(messages: List[BaseMessage]):
    """Convert LangChain messages → (system_instruction, contents).

    Preserves thought_signatures stored in AIMessage.additional_kwargs so
    the model's function-call roundtrip validation succeeds.
    """
    system_instruction: Optional[str] = None
    contents: list = []
    # Maps tool_call_id → thought_signature bytes for the current AI turn
    pending_sigs: dict[str, bytes] = {}

    for msg in messages:
        if isinstance(msg, SystemMessage):
            system_instruction = str(msg.content)

        elif isinstance(msg, HumanMessage):
            contents.append(
                genai_types.Content(
                    role="user",
                    parts=[genai_types.Part(text=str(msg.content))],
                )
            )

        elif isinstance(msg, AIMessage):
            # Extract thought_signatures stored during the last _response_to_ai_message call
            raw_sigs: dict = msg.additional_kwargs.get("thought_signatures", {})
            pending_sigs = {k: base64.b64decode(v) for k, v in raw_sigs.items()}

            parts = []
            if msg.content:
                parts.append(genai_types.Part(text=str(msg.content)))
            for tc in msg.tool_calls or []:
                call_id = tc["id"]
                ts = pending_sigs.get(call_id)
                part_kwargs: dict[str, Any] = {
                    "function_call": genai_types.FunctionCall(
                        id=call_id,
                        name=tc["name"],
                        args=tc.get("args") or {},
                    )
                }
                if ts:
                    part_kwargs["thought_signature"] = ts
                parts.append(genai_types.Part(**part_kwargs))
            if parts:
                contents.append(genai_types.Content(role="model", parts=parts))

        elif isinstance(msg, ToolMessage):
            fn_name = getattr(msg, "name", None) or msg.tool_call_id
            ts = pending_sigs.get(msg.tool_call_id)
            part_kwargs = {
                "function_response": genai_types.FunctionResponse(
                    id=msg.tool_call_id,
                    name=fn_name,
                    response={"result": str(msg.content)},
                )
            }
            if ts:
                part_kwargs["thought_signature"] = ts
            contents.append(
                genai_types.Content(role="user", parts=[genai_types.Part(**part_kwargs)])
            )

    return system_instruction, contents


# ─── Schema conversion ────────────────────────────────────────────────────────

def _json_schema_to_genai(schema: dict) -> "genai_types.Schema":
    """Recursively convert a JSON Schema dict to google-genai Schema."""
    _type_map = {
        "string": "STRING",
        "integer": "INTEGER",
        "number": "NUMBER",
        "boolean": "BOOLEAN",
        "array": "ARRAY",
        "object": "OBJECT",
    }
    genai_type = _type_map.get(schema.get("type", "string"), "STRING")
    kwargs: dict[str, Any] = {"type": genai_type}

    if schema.get("description"):
        kwargs["description"] = schema["description"]
    if schema.get("properties"):
        kwargs["properties"] = {
            k: _json_schema_to_genai(v) for k, v in schema["properties"].items()
        }
    if schema.get("required"):
        kwargs["required"] = schema["required"]
    if schema.get("items"):
        kwargs["items"] = _json_schema_to_genai(schema["items"])

    return genai_types.Schema(**kwargs)


def _tool_to_function_declaration(tool: Any) -> "genai_types.FunctionDeclaration":
    """Convert a LangChain tool to a FunctionDeclaration."""
    schema: dict = {}
    if hasattr(tool, "args_schema") and tool.args_schema is not None:
        try:
            schema = tool.args_schema.model_json_schema()
        except Exception:
            pass

    return genai_types.FunctionDeclaration(
        name=tool.name,
        description=getattr(tool, "description", "") or "",
        parameters=_json_schema_to_genai(schema) if schema else None,
    )


# ─── Response conversion ──────────────────────────────────────────────────────

def _response_to_ai_message(response: Any) -> AIMessage:
    """Convert a google-genai GenerateContentResponse to LangChain AIMessage.

    Stores thought_signatures in additional_kwargs so they can be passed back
    in the next function-response turn (required by new Gemini API accounts).
    """
    candidate = response.candidates[0]
    text_parts: list[str] = []
    tool_calls: list[dict] = []
    thought_signatures: dict[str, str] = {}  # call_id → base64-encoded bytes

    for part in candidate.content.parts:
        if hasattr(part, "text") and part.text:
            text_parts.append(part.text)
        fc = getattr(part, "function_call", None)
        if fc is not None:
            # Use the model's own call id if present, else generate one
            call_id = getattr(fc, "id", None) or f"call_{fc.name}_{uuid.uuid4().hex[:8]}"
            tool_calls.append(
                {
                    "id": call_id,
                    "name": fc.name,
                    "args": dict(fc.args) if fc.args else {},
                    "type": "tool_call",
                }
            )
            # Capture thought_signature from the Part (required for function response)
            ts: Optional[bytes] = getattr(part, "thought_signature", None)
            if ts:
                thought_signatures[call_id] = base64.b64encode(ts).decode()

    content = "".join(text_parts)
    additional_kwargs: dict[str, Any] = {}
    if thought_signatures:
        additional_kwargs["thought_signatures"] = thought_signatures

    if tool_calls:
        return AIMessage(content=content, tool_calls=tool_calls, additional_kwargs=additional_kwargs)
    return AIMessage(content=content)


# ─── Chat model ───────────────────────────────────────────────────────────────

class ChatGeminiInteractions(BaseChatModel):
    """LangChain-compatible chat model backed by Google's google-genai SDK (Interactions API)."""

    model: str = "gemini-2.5-flash"
    api_key: str = ""
    temperature: float = 0.2
    max_output_tokens: int = 4096

    _bound_tools: List[Any] = PrivateAttr(default_factory=list)

    @property
    def _llm_type(self) -> str:
        return "gemini-interactions"

    # ── Tool binding ──────────────────────────────────────────────────────────

    def bind_tools(self, tools: List[Any], **kwargs) -> "ChatGeminiInteractions":
        """Return a new instance with tools bound (does NOT mutate self)."""
        clone = ChatGeminiInteractions(
            model=self.model,
            api_key=self.api_key,
            temperature=self.temperature,
            max_output_tokens=self.max_output_tokens,
        )
        clone._bound_tools = list(tools)
        return clone

    # ── Config builder ────────────────────────────────────────────────────────

    def _build_config(self, system_instruction: Optional[str]) -> "genai_types.GenerateContentConfig":
        kwargs: dict[str, Any] = {
            "temperature": self.temperature,
            "max_output_tokens": self.max_output_tokens,
        }
        if system_instruction:
            kwargs["system_instruction"] = system_instruction
        if self._bound_tools:
            declarations = [_tool_to_function_declaration(t) for t in self._bound_tools]
            kwargs["tools"] = [genai_types.Tool(function_declarations=declarations)]
        return genai_types.GenerateContentConfig(**kwargs)

    # ── Client factory ────────────────────────────────────────────────────────

    def _make_client(self) -> "genai.Client":
        return genai.Client(api_key=self.api_key)

    # ── Sync generation (required by BaseChatModel) ───────────────────────────

    def _generate(
        self,
        messages: List[BaseMessage],
        stop: Optional[List[str]] = None,
        run_manager: Any = None,
        **kwargs: Any,
    ) -> ChatResult:
        client = self._make_client()
        system_instruction, contents = _messages_to_genai(messages)
        config = self._build_config(system_instruction)
        response = client.models.generate_content(
            model=self.model,
            contents=contents,
            config=config,
        )
        return ChatResult(generations=[ChatGeneration(message=_response_to_ai_message(response))])

    # ── Async generation ──────────────────────────────────────────────────────

    async def _agenerate(
        self,
        messages: List[BaseMessage],
        stop: Optional[List[str]] = None,
        run_manager: Any = None,
        **kwargs: Any,
    ) -> ChatResult:
        client = self._make_client()
        system_instruction, contents = _messages_to_genai(messages)
        config = self._build_config(system_instruction)
        response = await client.aio.models.generate_content(
            model=self.model,
            contents=contents,
            config=config,
        )
        return ChatResult(generations=[ChatGeneration(message=_response_to_ai_message(response))])
