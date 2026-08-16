"""
LLM Provider Factory

Given a tenant's LLMConfig record, returns a LangChain chat model
ready for use in LangGraph nodes. API keys are decrypted at call time.

Supported providers:
  openai          — OpenAI API (GPT-4o, GPT-4o-mini, …)
  azure_openai    — Azure OpenAI (your Azure deployment)
  anthropic       — Anthropic Claude
  google          — Google Gemini
  azure_foundry   — Azure AI Foundry (Phi-4, Llama, Mistral via Microsoft hosting)
  ollama          — Local models via Ollama (Phi-4, Llama, Mistral — free, runs on your machine)
"""

from langchain_anthropic import ChatAnthropic
from langchain_openai import AzureChatOpenAI, ChatOpenAI
from app.llm.gemini_interactions import ChatGeminiInteractions

try:
    from langchain_ollama import ChatOllama
except ImportError:
    try:
        from langchain_community.chat_models.ollama import ChatOllama  # type: ignore
    except ImportError:
        ChatOllama = None  # type: ignore

from app.core.security import decrypt_secret


def build_llm(provider: str, model: str, encrypted_api_key: str, extra: dict):
    """
    Factory that returns the appropriate LangChain chat model.

    Args:
        provider: one of openai | azure_openai | anthropic | google | azure_foundry | ollama
        model: model name / deployment name
        encrypted_api_key: Fernet-encrypted API key stored in DB (empty string for ollama)
        extra: provider-specific config
    """
    api_key = decrypt_secret(encrypted_api_key) if encrypted_api_key else ""

    match provider:
        case "openai":
            return ChatOpenAI(
                model=model,
                api_key=api_key,
                temperature=extra.get("temperature", 0.2),
                max_tokens=extra.get("max_tokens", 4096),
            )

        case "azure_openai":
            return AzureChatOpenAI(
                azure_deployment=model,
                azure_endpoint=extra["azure_endpoint"],
                api_version=extra.get("api_version", "2024-02-01"),
                api_key=api_key,
                temperature=extra.get("temperature", 0.2),
                max_tokens=extra.get("max_tokens", 4096),
            )

        case "anthropic":
            return ChatAnthropic(
                model=model,
                api_key=api_key,
                temperature=extra.get("temperature", 0.2),
                max_tokens=extra.get("max_tokens", 4096),
            )

        case "google":
            return ChatGeminiInteractions(
                model=model,
                api_key=api_key,
                temperature=extra.get("temperature", 0.2),
                max_output_tokens=extra.get("max_tokens", 4096),
            )

        case "azure_foundry":
            # Azure AI Foundry — OpenAI-compatible endpoint hosting
            # Phi-4, Llama 3.1, Mistral, etc. all via your Azure subscription.
            # extra: { "azure_endpoint": "https://<project>.services.ai.azure.com/models" }
            return ChatOpenAI(
                model=model,
                api_key=api_key,
                base_url=extra["azure_endpoint"],
                temperature=extra.get("temperature", 0.2),
                max_tokens=extra.get("max_tokens", 4096),
            )

        case "ollama":
            if ChatOllama is None:
                raise ValueError("Ollama not available: install langchain-ollama")
            return ChatOllama(
                model=model,
                base_url=extra.get("base_url", "http://localhost:11434"),
                temperature=extra.get("temperature", 0.2),
                num_predict=extra.get("max_tokens", 4096),
            )

        case _:
            raise ValueError(f"Unsupported LLM provider: {provider!r}")
