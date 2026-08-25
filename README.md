# ParcelPilot AI Support Copilot

An AI-powered support and operations backend for a B2B logistics platform. It handles natural-language support queries, multi-step agent workflows, document retrieval, structured data lookup, and proactive issue detection — all with customer-level access control.

## Backend Stack

| Layer | Technology |
|---|---|
| API | FastAPI |
| AI Agent | LangGraph + Gemini API |
| Vector Store | ChromaDB |
| Relational Store | SQLite + SQLAlchemy |
| Data Processing | Pandas |
| Config | Pydantic + python-dotenv |

## Setup

```bash
# 1. Create and activate a virtual environment
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Configure environment
cp .env.example .env
# Edit .env and add your GEMINI_API_KEY

# 4. Start the development server
uvicorn app.main:app --reload
```

The API will be available at `http://localhost:8000`.

## Architecture

_To be documented as components are built._

```
app/
├── agent/      — LangGraph agent and workflow definitions
├── tools/      — Agent tools (document retrieval, DB lookup, actions)
├── services/   — Business logic and orchestration
├── database/   — SQLAlchemy models and DB session management
├── models/     — Pydantic request/response schemas
└── config/     — Settings and environment configuration
```

## Features

- [ ] Natural-language support query handling
- [ ] Multi-step agent workflows (LangGraph)
- [ ] Document retrieval from policies, SOPs, and agreements (ChromaDB)
- [ ] Structured data lookup — accounts, orders, support tickets (SQLite)
- [ ] Source reliability and conflict resolution
- [ ] Customer/account-level access control at the tool layer
- [ ] State-changing actions (e.g., escalation creation) with user confirmation
- [ ] Proactive issue detection for recurring issues and SLA risks

## API Documentation

Interactive docs are available at `http://localhost:8000/docs` once the server is running.

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Service health check |

_Additional endpoints will be documented here as they are added._

## Frontend

A React + TypeScript frontend will be added in a later phase. The backend API is designed to be consumed by that frontend as well as other integrations.
