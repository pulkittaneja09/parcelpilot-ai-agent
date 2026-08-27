/**
 * The only module that talks to the FastAPI backend.
 *
 * Base URL resolution
 * -------------------
 * By default we send requests to relative paths ("/api/...", "/health") and let
 * the Vite dev-server proxy forward them to FastAPI. Same-origin requests need
 * no CORS preflight at all, which keeps local development friction-free.
 *
 * Set VITE_API_DIRECT=true to bypass the proxy and hit VITE_API_BASE_URL
 * straight from the browser. The backend registers CORSMiddleware with an
 * allowlist that covers the Vite dev and preview origins, so that mode works
 * locally too; for a deployment, add the real frontend origin to the backend's
 * CORS_ALLOW_ORIGINS environment variable.
 */
import {
  ApiError,
  type AnswerResponse,
  type ChatRequest,
  type ChatResponse,
  type FastApiErrorBody,
  type HealthResponse,
  type Mode,
  type QuestionRequest,
} from "../types/api";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const USE_DIRECT = import.meta.env.VITE_API_DIRECT === "true";

/** Where requests actually go. Empty string = relative = through the proxy. */
const ORIGIN = USE_DIRECT ? (API_BASE_URL ?? "").replace(/\/+$/, "") : "";

/** The backend URL to display in the UI, regardless of proxy mode. */
export const DISPLAY_BASE_URL = (API_BASE_URL ?? "http://127.0.0.1:8001").replace(
  /\/+$/,
  "",
);

/** True when calls are tunnelled through the Vite proxy rather than sent direct. */
export const IS_PROXIED = !USE_DIRECT;

/** Health checks should fail fast; AI calls need room for Claude + retrieval. */
const HEALTH_TIMEOUT_MS = 5_000;
const ANSWER_TIMEOUT_MS = 90_000;

/**
 * Pull a human-readable message out of a FastAPI error response.
 *
 * Handles HTTPException (`detail` string), validation errors (`detail` array),
 * and unhandled server errors — which FastAPI returns as the plain text
 * "Internal Server Error" rather than JSON.
 *
 * The body is read once as text and parsed manually, because calling
 * `response.json()` on a non-JSON body consumes the stream and leaves no way
 * to recover the original text.
 */
async function extractErrorMessage(
  response: Response,
): Promise<string | undefined> {
  let raw: string;

  try {
    raw = await response.text();
  } catch {
    return undefined;
  }

  if (!raw.trim()) return undefined;

  try {
    const body = JSON.parse(raw) as FastApiErrorBody;

    if (typeof body.detail === "string" && body.detail.trim()) {
      return body.detail.trim();
    }

    if (Array.isArray(body.detail)) {
      const messages = body.detail
        .map((item) => item?.msg)
        .filter((msg): msg is string => typeof msg === "string" && !!msg.trim());

      if (messages.length) return messages.join("; ");
    }

    return undefined;
  } catch {
    // Plain-text or HTML body. Keep it, but don't dump a whole error page
    // into the UI.
    const text = raw.trim();
    if (text.startsWith("<")) return undefined;

    return text.length > 300 ? `${text.slice(0, 300)}…` : text;
  }
}

/** Turn any thrown value into a typed ApiError with a useful message. */
function toApiError(error: unknown, timeoutMs: number): ApiError {
  if (error instanceof ApiError) return error;

  if (error instanceof DOMException && error.name === "AbortError") {
    return new ApiError(
      `The request timed out after ${Math.round(timeoutMs / 1000)}s. The AI agent may still be processing — retrieval plus Claude can take a while on a cold start.`,
      { isNetworkError: true },
    );
  }

  // fetch() rejects with TypeError when the server is unreachable.
  return new ApiError(
    `Could not reach the backend at ${DISPLAY_BASE_URL}. Confirm the FastAPI server is running (uvicorn app.main:app --reload).`,
    { isNetworkError: true },
  );
}

/** Shared fetch wrapper: timeout, JSON parsing, and typed errors. */
async function request<T>(
  path: string,
  init: RequestInit & { timeoutMs: number },
): Promise<T> {
  const { timeoutMs, ...requestInit } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${ORIGIN}${path}`, {
      ...requestInit,
      signal: controller.signal,
      headers: { Accept: "application/json", ...requestInit.headers },
    });

    if (!response.ok) {
      const detail = await extractErrorMessage(response);

      throw new ApiError(
        detail ?? `Request failed with HTTP ${response.status}.`,
        { status: response.status },
      );
    }

    return (await response.json()) as T;
  } catch (error) {
    throw toApiError(error, timeoutMs);
  } finally {
    clearTimeout(timer);
  }
}

/** `GET /health` — powers the sidebar status indicator. */
export function checkHealth(): Promise<HealthResponse> {
  return request<HealthResponse>("/health", {
    method: "GET",
    timeoutMs: HEALTH_TIMEOUT_MS,
    cache: "no-store",
  });
}

/**
 * Header carrying the mocked caller identity.
 *
 * The backend resolves this user's role and permitted accounts server-side, so
 * the account a record belongs to is never taken from the client. Sending a
 * different ticket id cannot widen access.
 */
const USER_HEADER = "X-User-ID";

/** Default demo user. Support agent scoped to a subset of accounts. */
export const DEFAULT_USER_ID = "support_agent_1";

/** Identity headers for a request, defaulting to the demo support agent. */
function userHeaders(userId?: string): Record<string, string> {
  return { [USER_HEADER]: userId?.trim() || DEFAULT_USER_ID };
}

/** `POST /api/tickets/{ticketId}/answer` */
export function answerTicket(
  ticketId: string,
  query: string,
  userId?: string,
): Promise<AnswerResponse> {
  const body: QuestionRequest = { query };

  return request<AnswerResponse>(
    `/api/tickets/${encodeURIComponent(ticketId)}/answer`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...userHeaders(userId),
      },
      body: JSON.stringify(body),
      timeoutMs: ANSWER_TIMEOUT_MS,
    },
  );
}

/** `POST /api/orders/{orderId}/answer` */
export function answerOrder(
  orderId: string,
  query: string,
  userId?: string,
): Promise<AnswerResponse> {
  const body: QuestionRequest = { query };

  return request<AnswerResponse>(
    `/api/orders/${encodeURIComponent(orderId)}/answer`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...userHeaders(userId),
      },
      body: JSON.stringify(body),
      timeoutMs: ANSWER_TIMEOUT_MS,
    },
  );
}

/**
 * Dispatch to the right single-turn endpoint for the active mode.
 *
 * Kept alongside `sendChatMessage` because both single-turn endpoints are still
 * part of the backend contract; the UI uses the conversational endpoint.
 */
export function askAi(
  mode: Mode,
  recordId: string,
  query: string,
  userId?: string,
): Promise<AnswerResponse> {
  return mode === "ticket"
    ? answerTicket(recordId, query, userId)
    : answerOrder(recordId, query, userId);
}

/**
 * `POST /api/chat` — one turn of a conversation.
 *
 * Pass `session_id` from the previous response to continue a conversation; omit
 * it to start a new one and use the id that comes back for every follow-up.
 *
 * `userId` is sent as X-User-ID. The backend resolves that user's role and
 * account scope itself and refuses records outside it with a 403.
 */
export function sendChatMessage(
  payload: ChatRequest,
  userId?: string,
): Promise<ChatResponse> {
  return request<ChatResponse>("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...userHeaders(userId),
    },
    body: JSON.stringify(payload),
    timeoutMs: ANSWER_TIMEOUT_MS,
  });
}
