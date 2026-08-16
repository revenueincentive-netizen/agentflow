# AgentFlow Platform

A multi-tenant SaaS platform that lets any company plug in their own LLM and data sources to deploy AI agents — without sharing data with other tenants.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Company A                            │
│  LLM: Azure OpenAI GPT-4o  |  Data: SQL + SharePoint   │
│  Agents: Sales Bot, Support Bot, Report Bot             │
└─────────────────────────────────────────────────────────┘
                        │
┌───────────────── AgentFlow Platform ────────────────────┐
│                                                         │
│  React Frontend  ←→  FastAPI Backend  ←→  LangGraph     │
│                       │                   (per-tenant   │
│                  PostgreSQL (metadata)     agent graph)  │
│                  Qdrant  (RAG vectors)                   │
│                  Redis   (sessions)                      │
└─────────────────────────────────────────────────────────┘
                        │
┌─────────────────────────────────────────────────────────┐
│                    Company B                            │
│  LLM: OpenAI GPT-4o-mini  |  Data: REST API + Files    │
│  Agents: Customer Q&A Bot                               │
└─────────────────────────────────────────────────────────┘
```

### Stack
| Layer | Technology |
|---|---|
| Backend API | FastAPI (Python 3.12) |
| Agent orchestration | LangGraph (ReAct, stateful) |
| LLM providers | OpenAI, Azure OpenAI, Anthropic, Google |
| Database | PostgreSQL (multi-tenant, row-level isolation) |
| Vector store (RAG) | Qdrant |
| Cache / sessions | Redis |
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS |
| Containerisation | Docker Compose |

---

## Quick start (local)

### Prerequisites
- Docker Desktop
- Node.js 20+ (for local frontend dev without Docker)
- Python 3.12+ (for local backend dev without Docker)

### 1. Clone and configure

```bash
cp backend/.env.example backend/.env
# Edit backend/.env — set SECRET_KEY and ENCRYPTION_KEY
```

### 2. Start everything with Docker

```bash
docker compose up --build
```

| Service | URL |
|---|---|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:8000 |
| API Docs | http://localhost:8000/docs (dev mode only) |
| Qdrant UI | http://localhost:6333/dashboard |

### 3. Register your first company

Open http://localhost:5173/login, click **Create account**, and fill in your company name + email.

---

## Project structure

```
platform/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app, lifespan, CORS
│   │   ├── core/
│   │   │   ├── config.py        # Settings (pydantic-settings)
│   │   │   ├── database.py      # SQLAlchemy async engine
│   │   │   └── security.py      # JWT, bcrypt, Fernet encryption
│   │   ├── models/              # SQLAlchemy ORM models
│   │   │   ├── tenant.py        # Tenant (company)
│   │   │   ├── user.py          # User (belongs to tenant)
│   │   │   ├── agent.py         # Agent + LLMConfig
│   │   │   └── connector.py     # Connector + Conversation
│   │   ├── api/v1/
│   │   │   ├── auth.py          # Register, login, refresh, /me
│   │   │   ├── agents.py        # Agent CRUD + streaming chat
│   │   │   ├── connectors.py    # Connector CRUD + file upload
│   │   │   └── llm_config.py    # LLM provider config CRUD
│   │   ├── agents/
│   │   │   ├── graph.py         # LangGraph ReAct graph builder
│   │   │   ├── state.py         # AgentState TypedDict
│   │   │   └── tools.py         # File/SQL/REST/SharePoint tools
│   │   └── llm/
│   │       └── factory.py       # LLM provider factory
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── App.tsx              # Router + auth guard
    │   ├── store/authStore.ts   # Zustand auth state
    │   ├── api/client.ts        # Axios + token refresh interceptor
    │   ├── types/index.ts       # TypeScript interfaces
    │   ├── components/
    │   │   ├── Layout.tsx       # Shell with sidebar
    │   │   ├── Sidebar.tsx      # Navigation
    │   │   └── ChatWindow.tsx   # Streaming chat UI
    │   └── pages/
    │       ├── Login.tsx        # Sign in / register
    │       ├── Dashboard.tsx    # Overview stats
    │       ├── Agents.tsx       # Agent management + chat
    │       ├── Connectors.tsx   # Connector management + upload
    │       └── Settings.tsx     # LLM provider config
    ├── package.json
    └── vite.config.ts
```

---

## How multi-tenancy works

- Every database table has a `tenant_id` column — queries always filter by it.
- LLM API keys are **encrypted at rest** with Fernet symmetric encryption before storage and decrypted only at agent runtime (never returned via API).
- Each tenant's RAG documents are stored in a **separate Qdrant collection** (`tenant_{id}_connector_{connector_id}`).
- JWT tokens carry `tenant_id` in their payload so the backend always knows which tenant to scope to.

---

## Adding a new LLM provider

1. Add the LangChain package to `requirements.txt`.
2. Add a `case` branch to `backend/app/llm/factory.py`.
3. Add the provider option to `frontend/src/pages/Settings.tsx`.

## Adding a new connector type

1. Add a `make_<type>_tool()` function in `backend/app/agents/tools.py`.
2. Wire it in `backend/app/api/v1/agents.py → _resolve_tools()`.
3. Add the type to the `TYPES` list in `frontend/src/pages/Connectors.tsx`.

---

## Production checklist

- [ ] Replace `SECRET_KEY` and `ENCRYPTION_KEY` with strong random values
- [ ] Use Alembic for database migrations instead of `create_all`
- [ ] Replace local file storage with Azure Blob / AWS S3
- [ ] Add a background task worker (Celery or ARQ) for RAG indexing
- [ ] Enable HTTPS and set `ENVIRONMENT=production`
- [ ] Set `TrustedHostMiddleware` allowed hosts in `main.py`
- [ ] Add rate limiting middleware (slowapi)
- [ ] Set up monitoring (Sentry, Prometheus)
