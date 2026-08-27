# ParcelPilot AI Support Copilot — Frontend

A dark, modern operations dashboard for the ParcelPilot AI Support Copilot. Support
agents pick a ticket or order, ask a question in natural language, and get an
answer that the backend agent has grounded in real operational records plus the
company's policies, SOPs, and signed customer agreements.

Every answer shown in the UI comes from the FastAPI backend. There are no mocked
or hard-coded AI responses anywhere in this codebase.

## Stack

| Layer | Technology |
|---|---|
| Framework | React 19 + TypeScript |
| Build tool | Vite 6 |
| Styling | Tailwind CSS v4 (CSS-first `@theme` tokens) |
| Icons | Lucide React |
| Markdown | Custom renderer (no dependencies) |

## Prerequisites

- **Node.js 20.19+** (or 22.12+)
- The **ParcelPilot backend running** on `http://127.0.0.1:8000`

Start the backend first, from the repository root:

```bash
uvicorn app.main:app --reload
```

## Setup

```bash
# 1. From the repository root
cd frontend

# 2. Install dependencies
npm install

# 3. Start the dev server
npm run dev
```

Open **http://localhost:5173**.

The sidebar shows a green **Connected** indicator once `GET /health` succeeds. If
it shows red, the backend is not running or is on a different port.

### Environment variables

A working `.env` is included. The app also runs with **no `.env` at all**, since
every value falls back to the local default.

```ini
# frontend/.env
VITE_API_BASE_URL=http://127.0.0.1:8000
VITE_API_DIRECT=false
```

| Variable | Purpose |
|---|---|
| `VITE_API_BASE_URL` | Backend location. Used as the dev-proxy target and as the base URL for production builds. |
| `VITE_API_DIRECT` | `false` (default) routes calls through the Vite proxy. `true` calls FastAPI directly from the browser and **requires CORS on the backend**. |

If your backend runs on a different port, change `VITE_API_BASE_URL` and restart
the dev server (Vite reads `.env` at startup).

## CORS — important

The frontend runs on port **5173** and the backend on **8000**. Those are
different origins, so a browser would normally block the requests unless FastAPI
sends CORS headers. The current backend does **not** register `CORSMiddleware`.

**This project solves that without touching the backend.** `vite.config.ts`
proxies `/api` and `/health` to `VITE_API_BASE_URL`:

```ts
server: {
  proxy: {
    "/api":    { target, changeOrigin: true },
    "/health": { target, changeOrigin: true },
  },
}
```

`src/services/api.ts` therefore requests **relative** paths (`/health`,
`/api/tickets/TKT-501/answer`). The browser sees same-origin requests to
`localhost:5173`, the Vite dev server forwards them to FastAPI server-side, and
CORS never comes into play. No backend changes are needed.

### If you deploy, or set `VITE_API_DIRECT=true`

The Vite proxy only exists in development. A deployed build that calls the API
directly across origins **does** need CORS. At that point add this to
`app/main.py` yourself:

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # your frontend origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

Alternatively, serve the built `dist/` folder behind the same origin as the API
(or a reverse proxy), which again avoids CORS entirely.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Dev server with hot reload and the API proxy |
| `npm run build` | Typecheck (`tsc -b`) and build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | Types only, no build |

> `npm run preview` has **no proxy**. To test a production build against a
> local backend, set `VITE_API_DIRECT=true` and add the CORS middleware above.

## Project structure

```
frontend/
├── public/
│   └── favicon.svg
├── src/
│   ├── components/
│   │   ├── Sidebar.tsx           — brand, nav, backend status
│   │   ├── Header.tsx            — page title and precedence note
│   │   ├── ModeSelector.tsx      — Ticket / Order mode cards
│   │   ├── QuestionForm.tsx      — ID input, question, Ask AI
│   │   ├── AnswerCard.tsx        — idle / loading / error / answer states
│   │   ├── ExampleQueries.tsx    — one-click prefilled queries
│   │   ├── SourcePrecedence.tsx  — the four-level precedence ladder
│   │   ├── ApiStatus.tsx         — status pill + API Status page
│   │   └── Markdown.tsx          — dependency-free markdown renderer
│   ├── data/
│   │   └── examples.ts           — example queries and form defaults
│   ├── services/
│   │   └── api.ts                — the only module that calls the backend
│   ├── types/
│   │   └── api.ts                — request/response types mirroring Pydantic
│   ├── App.tsx                   — layout, state, health polling
│   ├── main.tsx
│   └── index.css                 — Tailwind theme tokens and keyframes
├── .env
├── vite.config.ts                — React, Tailwind, and the API proxy
└── tsconfig.*.json
```

## API integration

`src/services/api.ts` exposes exactly three calls, matching the backend:

```ts
checkHealth()                        // GET  /health
answerTicket(ticketId, query)        // POST /api/tickets/{ticket_id}/answer
answerOrder(orderId, query)          // POST /api/orders/{order_id}/answer
```

Both answer calls send `{ "query": "..." }` and expect `{ "id", "answer" }`.

Handled for you:

- **Timeouts** — 5s for health, 90s for AI calls (retrieval + Claude is slow on a
  cold start)
- **FastAPI error shapes** — `detail` as a string (`HTTPException`), as an array
  (422 validation), and plain-text 500 bodies
- **Unreachable backend** — a clear message naming the URL it tried
- **Stale responses** — a slow earlier request can never overwrite a newer answer

## Features

- **Ticket and Order modes**, each keeping its own draft ID and question, so
  switching tabs does not lose your input
- **Validation before sending** — empty ID, empty or too-short question, and
  mode/ID mismatches (`ORD-…` entered in Ticket mode) are caught client-side
- **Loading state** showing the backend's real pipeline stages, an indeterminate
  progress bar, and a skeleton of the answer
- **Markdown rendering** of the AI answer — headings, bold, italic, inline code,
  nested bullet and numbered lists, blockquotes, rules, and tables. Output is
  built as React elements, never injected as HTML
- **Copy Answer** button, request ID, and round-trip time on every answer
- **Example queries** for eight real seeded records, covering SLA lookups,
  known issues, contract-specific terms, and source-precedence conflicts
- **API Status page** with live health, latency, connection mode, and an endpoint
  reference
- **Backend health polling** every 30 seconds, with manual refresh
- **Responsive** from 375px up — the sidebar becomes a drawer with backdrop,
  Escape to close, and scroll lock
- Accessible focus rings, `aria-live` on the answer region, `role="alert"` on
  errors, and `prefers-reduced-motion` support

## Example queries

All eight reference records that exist in the seeded SQLite database, so each
returns a real answer rather than an error.

| Mode | ID | Tests |
|---|---|---|
| Ticket | `TKT-501` | P1 severity and SLA under an enterprise agreement |
| Ticket | `TKT-502` | Known-issue matching and workaround |
| Ticket | `TKT-505` | Security-incident severity |
| Ticket | `TKT-450` | Agreement outranking a historical resolution |
| Order | `ORD-1001` | Contract cancellation terms |
| Order | `ORD-2001` | Fee window under standard SOP |
| Order | `ORD-2002` | Service credit on carrier fault |
| Order | `ORD-3001` | Standard policy, no custom agreement |

## Note on unknown IDs

Asking about an ID that is not in the database returns **HTTP 500**, not 404.
This is backend behaviour and was left untouched: `get_ticket_context()` returns
`None` for a missing record, then `answer_ticket()` subscripts it and raises
`TypeError` — which the endpoint's `except ValueError` does not catch.

The UI handles this gracefully: a 500 on an answer endpoint shows the error plus
a hint that the ID probably does not exist and to check the analysis mode.

If you ever want a true 404, the backend fix is a guard in
`app/agent/support_agent.py`:

```python
context = get_ticket_context(ticket_id)

if context is None:
    raise ValueError(f"Ticket {ticket_id} was not found")
```

The frontend needs no changes for that — it already renders 404s with the right
message.
