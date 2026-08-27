import { useCallback, useEffect, useRef, useState } from "react";
import Sidebar, { type View } from "./components/Sidebar";
import Header from "./components/Header";
import ModeSelector from "./components/ModeSelector";
import ConversationBar from "./components/ConversationBar";
import ChatPanel from "./components/ChatPanel";
import ChatComposer from "./components/ChatComposer";
import ExampleQueries from "./components/ExampleQueries";
import SourcePrecedence from "./components/SourcePrecedence";
import { ApiStatusPanel } from "./components/ApiStatus";
import { checkHealth, sendChatMessage, DEFAULT_USER_ID } from "./services/api";
import { DEFAULTS } from "./data/examples";
import {
  ApiError,
  type BackendStatus,
  type ChatFailure,
  type ChatTurn,
  type Conversation,
  type ExampleQuery,
  type HealthResponse,
  type Mode,
} from "./types/api";

/** How often to re-poll /health in the background. */
const HEALTH_POLL_MS = 30_000;

let turnCounter = 0;

/** Stable React keys for transcript entries. */
function makeTurn(
  role: ChatTurn["role"],
  content: string,
  elapsedMs?: number,
  tools?: ChatTurn["tools"],
) {
  turnCounter += 1;
  return { id: `t${turnCounter}`, role, content, elapsedMs, tools };
}

/** Ambient glows and grid behind the workspace. */
function BackgroundDecor() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
    >
      <div className="animate-drift absolute -top-52 left-1/5 size-[40rem] rounded-full bg-brand-600/12 blur-[130px]" />
      <div
        className="animate-drift absolute top-1/3 -right-40 size-[34rem] rounded-full bg-aqua-500/8 blur-[140px]"
        style={{ animationDelay: "-9s" }}
      />
      <div className="absolute -bottom-40 left-1/3 size-[30rem] rounded-full bg-brand-700/8 blur-[130px]" />
      <div className="grid-backdrop absolute inset-0" />
    </div>
  );
}

export default function App() {
  const [view, setView] = useState<View>("assistant");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Record ID drafts are kept per mode so switching tabs preserves each one.
  const [mode, setMode] = useState<Mode>("ticket");
  const [recordIds, setRecordIds] = useState<Record<Mode, string>>(() => ({
    ticket: DEFAULTS.ticket.id,
    order: DEFAULTS.order.id,
  }));

  // Mocked caller identity, sent as X-User-ID. The backend resolves this user's
  // role and permitted accounts itself, so switching users changes what is
  // visible while typing another ticket id does not.
  const [userId, setUserId] = useState(DEFAULT_USER_ID);

  // Conversation state. `conversation` is bound to the record it was started
  // for; the ID input above is a draft until the next message is sent.
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [failure, setFailure] = useState<ChatFailure | null>(null);
  const [recordIdError, setRecordIdError] = useState<string | null>(null);
  const [messageError, setMessageError] = useState<string | null>(null);

  // Health state
  const [backendStatus, setBackendStatus] = useState<BackendStatus>("checking");
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthLatency, setHealthLatency] = useState<number | null>(null);
  const [healthCheckedAt, setHealthCheckedAt] = useState<Date | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);

  /** Guards against a slow earlier response landing after a newer one. */
  const requestSeq = useRef(0);

  const recordId = recordIds[mode];
  const turns = conversation?.turns ?? [];

  /* --------------------------------------------------------------- health */

  const runHealthCheck = useCallback(async () => {
    setBackendStatus("checking");
    const startedAt = performance.now();

    try {
      const result = await checkHealth();

      setHealth(result);
      setHealthLatency(Math.round(performance.now() - startedAt));
      setBackendStatus("online");
      setHealthError(null);
    } catch (error) {
      setHealth(null);
      setHealthLatency(null);
      setBackendStatus("offline");
      setHealthError(
        error instanceof ApiError ? error.message : "Health check failed.",
      );
    } finally {
      setHealthCheckedAt(new Date());
    }
  }, []);

  useEffect(() => {
    void runHealthCheck();
    const timer = setInterval(() => void runHealthCheck(), HEALTH_POLL_MS);
    return () => clearInterval(timer);
  }, [runHealthCheck]);

  /* ------------------------------------------------- mobile drawer plumbing */

  // Escape closes the drawer.
  useEffect(() => {
    if (!isSidebarOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsSidebarOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isSidebarOpen]);

  // Prevent the page behind the drawer from scrolling.
  useEffect(() => {
    const { style } = document.body;
    const previous = style.overflow;
    style.overflow = isSidebarOpen ? "hidden" : previous;

    return () => {
      style.overflow = previous;
    };
  }, [isSidebarOpen]);

  /* ----------------------------------------------------------- interactions */

  const startNewConversation = () => {
    requestSeq.current += 1; // abandon any in-flight reply
    setConversation(null);
    setFailure(null);
    setRecordIdError(null);
    setMessageError(null);
    setIsLoading(false);
  };

  const handleModeChange = (nextMode: Mode) => {
    if (nextMode === mode) return;

    setMode(nextMode);
    // A conversation belongs to one record type, so switching starts over.
    startNewConversation();
  };

  const handleSelectExample = (example: ExampleQuery) => {
    setMode(example.mode);
    setRecordIds((current) => ({ ...current, [example.mode]: example.id }));
    setInput(example.query);
    startNewConversation();
  };

  const handleRecordIdChange = (value: string) => {
    setRecordIds((current) => ({ ...current, [mode]: value }));
    setRecordIdError(null);
  };

  /** Client-side check so we never send a request we know will fail. */
  const validateRecordId = (id: string): string | null => {
    if (!id) {
      return mode === "ticket"
        ? "Enter a ticket ID to start a conversation."
        : "Enter an order ID to start a conversation.";
    }

    if (mode === "ticket" && /^ORD[-_]?\d/i.test(id)) {
      return "That looks like an order ID — switch to Order Analysis first.";
    }

    if (mode === "order" && /^TKT[-_]?\d/i.test(id)) {
      return "That looks like a ticket ID — switch to Ticket Analysis first.";
    }

    return null;
  };

  /**
   * Send one turn.
   *
   * `resend` replays the message of a failed turn, which is already in the
   * transcript and must not be appended twice.
   */
  const send = async (rawMessage: string, options: { resend?: boolean } = {}) => {
    const message = rawMessage.trim();
    const id = recordId.trim();

    const idError = validateRecordId(id);
    setRecordIdError(idError);
    if (idError) return;

    if (!message) {
      setMessageError("Enter a message to send.");
      return;
    }

    setMessageError(null);

    // The conversation is bound to the record it started on. If the ID or mode
    // changed since then, this message opens a new session instead of leaking
    // history across records (which the backend would reject with a 409).
    const isSameRecord =
      conversation !== null &&
      conversation.mode === mode &&
      conversation.entityId === id;

    const base: Conversation = isSameRecord
      ? conversation
      : { mode, entityId: id, sessionId: null, turns: [] };

    const userTurns = options.resend
      ? base.turns
      : [...base.turns, makeTurn("user", message)];

    setConversation({ ...base, turns: userTurns });
    setFailure(null);
    if (!options.resend) setInput("");

    const seq = ++requestSeq.current;
    setIsLoading(true);
    const startedAt = performance.now();

    try {
      const result = await sendChatMessage(
        {
          ...(base.sessionId ? { session_id: base.sessionId } : {}),
          entity_type: mode,
          entity_id: id,
          message,
        },
        userId.trim() || undefined,
      );

      if (requestSeq.current !== seq) return; // superseded or reset

      setConversation({
        mode: result.entity_type,
        entityId: result.entity_id,
        sessionId: result.session_id,
        turns: [
          ...userTurns,
          makeTurn(
            "assistant",
            result.answer,
            Math.round(performance.now() - startedAt),
            result.tools_used,
          ),
        ],
      });

      // A successful call proves the backend is reachable.
      setBackendStatus("online");
      setHealthError(null);
    } catch (error) {
      if (requestSeq.current !== seq) return;

      if (error instanceof ApiError) {
        setFailure({
          message: error.message,
          status: error.status,
          retryMessage: message,
        });
        if (error.isNetworkError) setBackendStatus("offline");
      } else {
        setFailure({
          message: "An unexpected error occurred while contacting the API.",
          retryMessage: message,
        });
      }
    } finally {
      if (requestSeq.current === seq) setIsLoading(false);
    }
  };

  const pendingRecordChange =
    conversation !== null &&
    conversation.turns.length > 0 &&
    conversation.entityId !== recordId.trim() &&
    recordId.trim().length > 0
      ? `Sending will start a new conversation for ${recordId.trim()}.`
      : null;

  /* ------------------------------------------------------------------ view */

  return (
    <div className="relative min-h-screen">
      <BackgroundDecor />

      <Sidebar
        view={view}
        onViewChange={setView}
        status={backendStatus}
        latencyMs={healthLatency}
        onRefreshHealth={() => void runHealthCheck()}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      <div className="relative z-10 lg:pl-[17.5rem]">
        <main className="mx-auto max-w-[86rem] px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
          {view === "assistant" ? (
            <div className="space-y-7">
              <Header onOpenSidebar={() => setIsSidebarOpen(true)} />

              <ModeSelector
                mode={mode}
                onModeChange={handleModeChange}
                disabled={isLoading}
              />

              <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_21rem]">
                {/* Chat workspace */}
                <section className="panel min-w-0 overflow-hidden">
                  <ConversationBar
                    mode={mode}
                    recordId={recordId}
                    userId={userId}
                    sessionId={conversation?.sessionId ?? null}
                    turnCount={turns.length}
                    isLoading={isLoading}
                    error={recordIdError}
                    onRecordIdChange={handleRecordIdChange}
                    onUserIdChange={setUserId}
                    onNewConversation={startNewConversation}
                  />

                  <ChatPanel
                    mode={mode}
                    entityId={turns.length > 0 ? conversation?.entityId ?? null : null}
                    turns={turns}
                    isLoading={isLoading}
                    failure={failure}
                    onRetry={() =>
                      failure &&
                      void send(failure.retryMessage, { resend: true })
                    }
                  />

                  <ChatComposer
                    mode={mode}
                    value={input}
                    isLoading={isLoading}
                    notice={pendingRecordChange}
                    error={messageError}
                    onChange={(value) => {
                      setInput(value);
                      setMessageError(null);
                    }}
                    onSubmit={() => void send(input)}
                  />
                </section>

                {/* Right rail */}
                <aside className="space-y-6 xl:sticky xl:top-10 xl:self-start">
                  <ExampleQueries
                    mode={mode}
                    activeId={conversation?.entityId ?? recordId}
                    activeQuery={input}
                    disabled={isLoading}
                    onSelect={handleSelectExample}
                  />
                  <SourcePrecedence />
                </aside>
              </div>
            </div>
          ) : (
            <ApiStatusPanel
              status={backendStatus}
              health={health}
              latencyMs={healthLatency}
              lastCheckedAt={healthCheckedAt}
              error={healthError}
              onRefresh={() => void runHealthCheck()}
            />
          )}

          <footer className="mt-12 border-t border-edge pt-5">
            <p className="text-center text-[11.5px] text-fg-faint">
              ParcelPilot AI Support Copilot · FastAPI · ChromaDB · Claude 3.5 Sonnet
            </p>
          </footer>
        </main>
      </div>
    </div>
  );
}
