"""
Data connector tools that agents can call as LangChain tools.
Each tool is a @tool-decorated function. The agent graph binds
whichever tools are enabled for the agent's connectors.
"""

import json
from typing import Any

import httpx
import sqlalchemy
from langchain_core.tools import tool

try:
    from qdrant_client import QdrantClient
    _QDRANT_AVAILABLE = True
except ImportError:
    _QDRANT_AVAILABLE = False

from app.core.config import settings


# ─── File / RAG search ───────────────────────────────────────────────────────

def make_rag_search_tool(tenant_id: str, connector_id: str):
    """Returns a closure-based tool that searches the tenant's RAG collection."""

    if not _QDRANT_AVAILABLE:
        @tool
        def rag_search(query: str) -> str:
            """Search uploaded company documents."""
            return "RAG search unavailable: Qdrant not configured."
        return rag_search

    collection_name = f"tenant_{tenant_id}_connector_{connector_id}"
    client = QdrantClient(url=settings.QDRANT_URL, api_key=settings.QDRANT_API_KEY)

    @tool
    def rag_search(query: str) -> str:
        """Search uploaded company documents for relevant information. Use for questions about internal files, PDFs, and reports."""
        from langchain_openai import OpenAIEmbeddings  # lazy import

        embeddings = OpenAIEmbeddings()
        vector = embeddings.embed_query(query)
        results = client.search(
            collection_name=collection_name,
            query_vector=vector,
            limit=5,
            with_payload=True,
        )
        if not results:
            return "No relevant documents found."
        chunks = [r.payload.get("text", "") for r in results]
        return "\n\n---\n\n".join(chunks)

    rag_search.__name__ = f"rag_search_{connector_id[:8]}"
    return rag_search


# ─── SQL connector ───────────────────────────────────────────────────────────

def make_sql_tool(connection_string: str, allowed_tables: list[str]):
    """Returns a tool that runs read-only SQL queries on the tenant's database."""

    @tool
    def sql_query(query: str) -> str:
        """Run a read-only SQL SELECT query on the company database. Only SELECT statements are allowed."""
        query_stripped = query.strip().upper()
        if not query_stripped.startswith("SELECT"):
            return "Error: Only SELECT queries are permitted."
        try:
            engine = sqlalchemy.create_engine(connection_string)
            with engine.connect() as conn:
                result = conn.execute(sqlalchemy.text(query))
                rows = [dict(r._mapping) for r in result]
            return json.dumps(rows[:200], default=str)  # cap at 200 rows
        except Exception as e:
            return f"Query error: {e}"

    return sql_query


# ─── REST API connector ──────────────────────────────────────────────────────

def make_rest_api_tool(base_url: str, headers: dict[str, str], description: str):
    """Returns a tool that calls a company REST API endpoint."""

    @tool
    def call_rest_api(path: str, params: str = "{}") -> str:
        """Call the company REST API. Provide path (e.g. /orders) and optional JSON params."""
        try:
            parsed_params = json.loads(params)
        except json.JSONDecodeError:
            return "Error: params must be valid JSON."
        try:
            with httpx.Client(timeout=15) as client:
                response = client.get(f"{base_url.rstrip('/')}/{path.lstrip('/')}", params=parsed_params, headers=headers)
                response.raise_for_status()
                return response.text[:4000]  # truncate large responses
        except httpx.HTTPError as e:
            return f"API error: {e}"

    # Customise the docstring with connector-specific description
    call_rest_api.__doc__ = description or call_rest_api.__doc__
    return call_rest_api


# ─── SharePoint connector ────────────────────────────────────────────────────

def make_sharepoint_tool(tenant_azure_id: str, client_id: str, client_secret: str, site_url: str):
    """Returns a tool that searches SharePoint document libraries."""

    @tool
    def sharepoint_search(query: str) -> str:
        """Search SharePoint for documents and files matching the query."""
        token_url = f"https://login.microsoftonline.com/{tenant_azure_id}/oauth2/v2.0/token"
        try:
            with httpx.Client(timeout=20) as client:
                token_resp = client.post(
                    token_url,
                    data={
                        "grant_type": "client_credentials",
                        "client_id": client_id,
                        "client_secret": client_secret,
                        "scope": "https://graph.microsoft.com/.default",
                    },
                )
                token_resp.raise_for_status()
                access_token = token_resp.json()["access_token"]

                search_resp = client.post(
                    "https://graph.microsoft.com/v1.0/search/query",
                    headers={"Authorization": f"Bearer {access_token}"},
                    json={
                        "requests": [
                            {
                                "entityTypes": ["driveItem"],
                                "query": {"queryString": query},
                                "from": 0,
                                "size": 5,
                            }
                        ]
                    },
                )
                search_resp.raise_for_status()
                hits = (
                    search_resp.json()
                    .get("value", [{}])[0]
                    .get("hitsContainers", [{}])[0]
                    .get("hits", [])
                )
                results = [
                    {"name": h.get("resource", {}).get("name"), "url": h.get("resource", {}).get("webUrl")}
                    for h in hits
                ]
                return json.dumps(results) if results else "No SharePoint documents found."
        except Exception as e:
            return f"SharePoint search error: {e}"

    return sharepoint_search
