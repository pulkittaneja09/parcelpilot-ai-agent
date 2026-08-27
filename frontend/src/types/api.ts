/**
 * Shared types for the ParcelPilot backend contract.
 *
 * These mirror the Pydantic models in `app/main.py` and `app/models/chat.py`:
 *   QuestionRequest { query: str }
 *   AnswerResponse  { id: str, answer: str }
 *   ChatRequest     { session_id?: str, entity_type, entity_id, message }
 *   ChatResponse    { session_id, entity_type, entity_id, answer }
 */

/** The two analysis surfaces the backend exposes. */
export type Mode = "ticket" | "order";

/** POST body for both single-turn answer endpoints. */
export interface QuestionRequest {
  query: string;
}

/** Success payload from `/api/tickets/{id}/answer` and `/api/orders/{id}/answer`. */
export interface AnswerResponse {
  /** Echoes the ticket or order id from the path, e.g. "TKT-501". */
  id: string;
  /** Claude's markdown-ish answer text. */
  answer: string;
}

/* --------------------------------------------------------------------- chat */

/** POST body for `/api/chat`. Omit `session_id` to start a conversation. */
export interface ChatRequest {
  session_id?: string;
  entity_type: Mode;
  entity_id: string;
  message: string;
}

/** One tool the backend actually invoked while answering a turn. */
export interface ToolUse {
  name: string;
  label: string;
  icon: string;
  detail: string;
}

/** Success payload from `/api/chat`. */
export interface ChatResponse {
  /** Generated on the first turn; send it back with every follow-up. */
  session_id: string;
  entity_type: Mode;
  entity_id: string;
  answer: string;
  /** Tools invoked for this turn, in call order. */
  tools_used?: ToolUse[];
  /** Present when a state-changing action is awaiting confirmation. */
  pending_action?: Record<string, unknown> | null;
  /** Present on the turn where a state-changing action executed. */
  action_result?: Record<string, unknown> | null;
}

export type ChatRole = "user" | "assistant";

/** One rendered turn of the transcript. `id` only exists to key React lists. */
export interface ChatTurn {
  id: string;
  role: ChatRole;
  content: string;
  /** Round-trip time, set on assistant turns. */
  elapsedMs?: number;
  /** Tools the backend reported for this turn, shown under the reply. */
  tools?: ToolUse[];
}

/** A failure attached to the newest user turn, with the text needed to retry. */
export interface ChatFailure {
  message: string;
  status?: number;
  /** The user message that failed, so "Try again" can resend it verbatim. */
  retryMessage: string;
}

/** An active conversation, bound to the record it was started for. */
export interface Conversation {
  mode: Mode;
  entityId: string;
  /** Null until the backend has replied to the first turn. */
  sessionId: string | null;
  turns: ChatTurn[];
}

/** Payload from `GET /health`. */
export interface HealthResponse {
  status: string;
  service: string;
  provider?: string;
  model?: string;
}

/** FastAPI's error shape. `detail` is a string for HTTPException, an array for 422. */
export interface FastApiErrorBody {
  detail?: string | Array<{ msg?: string; loc?: unknown[]; type?: string }>;
}

/** Connection state for the sidebar indicator. */
export type BackendStatus = "checking" | "online" | "offline";

/**
 * Normalised error thrown by every function in `services/api.ts`.
 * Carrying the HTTP status lets the UI distinguish "unknown ticket" (404)
 * from "backend is down" (no status).
 */
export class ApiError extends Error {
  readonly status?: number;
  /** True when the request never reached the server (offline, wrong port, CORS). */
  readonly isNetworkError: boolean;

  constructor(
    message: string,
    options: { status?: number; isNetworkError?: boolean } = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.status = options.status;
    this.isNetworkError = options.isNetworkError ?? false;
  }
}

/** A one-click example that fills the form. */
export interface ExampleQuery {
  mode: Mode;
  /** Ticket or order id — must exist in the seeded SQLite database. */
  id: string;
  /** Short label shown on the chip. */
  label: string;
  /** The question sent to the AI. */
  query: string;
  /** Account the record belongs to, shown as context on the card. */
  account: string;
  /** Owning account id — sent as X-Account-ID so the request is authorised. */
  accountId: string;
}
