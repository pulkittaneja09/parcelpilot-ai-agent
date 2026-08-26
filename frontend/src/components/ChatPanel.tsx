import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  BrainCircuit,
  Check,
  Copy,
  MessagesSquare,
  RotateCcw,
  Sparkles,
  Timer,
  User,
} from "lucide-react";
import Markdown from "./Markdown";
import type { ChatFailure, ChatTurn, Mode } from "../types/api";

interface ChatPanelProps {
  mode: Mode;
  /** The record this transcript belongs to, once a conversation has started. */
  entityId: string | null;
  turns: ChatTurn[];
  isLoading: boolean;
  failure: ChatFailure | null;
  onRetry: () => void;
}

const STARTERS: Record<Mode, string[]> = {
  ticket: [
    "What is the severity?",
    "What response time applies?",
    "What should I tell the customer?",
  ],
  order: [
    "Can this shipment be cancelled?",
    "Does a cancellation fee apply?",
    "Is the account entitled to a service credit?",
  ],
};

/* -------------------------------------------------------------- empty state */

function EmptyState({ mode }: { mode: Mode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center sm:py-16">
      <div className="relative">
        <span className="absolute inset-0 rounded-2xl bg-brand-500/20 blur-2xl" />
        <span className="relative grid size-14 place-items-center rounded-2xl border border-brand-500/25 bg-gradient-to-br from-brand-500/20 to-aqua-500/10">
          <MessagesSquare className="size-6 text-brand-300" />
        </span>
      </div>

      <h2 className="mt-5 text-lg font-semibold tracking-tight text-fg">
        Start a conversation
      </h2>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-fg-dim">
        Enter a {mode === "ticket" ? "ticket" : "order"} ID and ask your first
        question. Follow-ups keep the context, so you can just ask "why?" or
        "what should I tell them?".
      </p>

      <ul className="mt-5 space-y-1.5">
        {STARTERS[mode].map((example) => (
          <li key={example} className="text-[13px] text-fg-faint italic">
            “{example}”
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ bubbles */

function UserTurn({ content }: { content: string }) {
  return (
    <div className="animate-fade-up flex justify-end gap-3">
      <div className="max-w-[85%] rounded-2xl rounded-br-md border border-brand-500/25 bg-brand-500/[0.10] px-4 py-2.5">
        <p className="text-[14.5px] leading-relaxed whitespace-pre-wrap text-fg">
          {content}
        </p>
      </div>

      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl border border-edge bg-base-800 text-fg-dim">
        <User className="size-4" />
      </span>
    </div>
  );
}

function AssistantTurn({ turn }: { turn: ChatTurn }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(turn.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (insecure origin or denied permission) — leave the
      // button in its default state rather than claiming success.
    }
  };

  return (
    <div className="animate-fade-up flex gap-3">
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl border border-brand-500/25 bg-gradient-to-br from-brand-500/20 to-aqua-500/10">
        <Sparkles className="size-4 text-brand-300" />
      </span>

      <div className="min-w-0 flex-1 rounded-2xl rounded-tl-md border border-edge bg-base-900/50 px-4 py-3">
        <Markdown content={turn.content} className="text-[14.5px]" />

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-edge/70 pt-2.5">
          <button
            type="button"
            onClick={() => void handleCopy()}
            className={[
              "inline-flex items-center gap-1.5 text-[11.5px] font-medium transition-colors",
              copied ? "text-ok-300" : "text-fg-faint hover:text-fg-muted",
            ].join(" ")}
          >
            {copied ? (
              <>
                <Check className="size-3" strokeWidth={3} />
                Copied
              </>
            ) : (
              <>
                <Copy className="size-3" />
                Copy
              </>
            )}
          </button>

          {turn.elapsedMs !== undefined && (
            <span className="inline-flex items-center gap-1.5 text-[11.5px] text-fg-faint">
              <Timer className="size-3" />
              <span className="font-mono tabular-nums">
                {(turn.elapsedMs / 1000).toFixed(1)}s
              </span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function ThinkingTurn() {
  return (
    <div className="animate-fade-up flex gap-3" aria-busy="true">
      <span className="relative mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl border border-brand-500/30 bg-brand-500/10">
        <span className="animate-halo absolute inset-0 rounded-xl bg-brand-500/30" />
        <BrainCircuit className="relative size-4 text-brand-300" />
      </span>

      <div className="min-w-0 flex-1 rounded-2xl rounded-tl-md border border-edge bg-base-900/50 px-4 py-3">
        <p className="text-[13px] text-fg-muted">
          Loading context, retrieving policies, and composing an answer…
        </p>

        <div className="mt-3 h-0.5 w-full overflow-hidden rounded-full bg-base-750">
          <div className="animate-sweep h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-brand-400 to-transparent" />
        </div>

        <div className="mt-3.5 space-y-2">
          {["w-11/12", "w-4/5", "w-2/3"].map((width, index) => (
            <div
              key={width}
              className={`animate-shimmer h-2.5 rounded-full bg-base-750 ${width}`}
              style={{ animationDelay: `${index * 140}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Extra guidance for the statuses this backend actually returns. */
function hintForStatus(status?: number): string | null {
  if (status === 404) {
    return "That ID was not found in the operational database. Check the format (TKT-501, ORD-1001) and that the record type matches.";
  }

  if (status === 409) {
    return "This session was started for a different record. Click New Conversation to start a fresh one.";
  }

  if (status === 429) {
    return "The Anthropic API rate limit is reached. Wait for the window to reset, check rate limits, or set CLAUDE_MODEL to a model with more headroom.";
  }

  if (status === 422) {
    return "The request was rejected — a non-empty message and a valid record type are required.";
  }

  if (status === 500) {
    return "The backend raised an unexpected error. Check the uvicorn console for a traceback — a missing ANTHROPIC_API_KEY is a common cause.";
  }

  return null;
}

function FailureTurn({
  failure,
  onRetry,
}: {
  failure: ChatFailure;
  onRetry: () => void;
}) {
  const hint = hintForStatus(failure.status);

  return (
    <div className="animate-fade-up flex gap-3" role="alert">
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl border border-bad-500/30 bg-bad-500/10">
        <AlertTriangle className="size-4 text-bad-400" />
      </span>

      <div className="min-w-0 flex-1 rounded-2xl rounded-tl-md border border-bad-500/25 bg-bad-500/[0.06] px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-[13px] font-semibold text-fg">
            Could not get a reply
          </h3>
          {failure.status !== undefined && (
            <span className="rounded-md border border-bad-500/30 bg-bad-500/10 px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-bad-300">
              HTTP {failure.status}
            </span>
          )}
        </div>

        <p className="mt-2 text-[13px] leading-relaxed break-words text-bad-300">
          {failure.message}
        </p>

        {hint && (
          <p className="mt-2 text-xs leading-relaxed text-fg-dim">{hint}</p>
        )}

        <button
          type="button"
          onClick={onRetry}
          className="mt-3 inline-flex items-center gap-2 rounded-lg border border-edge bg-base-750 px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:border-edge-bright hover:text-fg"
        >
          <RotateCcw className="size-3.5" />
          Try again
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- transcript */

export default function ChatPanel({
  mode,
  entityId,
  turns,
  isLoading,
  failure,
  onRetry,
}: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the newest turn in view as the conversation grows.
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
  }, [turns.length, isLoading, failure]);

  const isEmpty = turns.length === 0 && !isLoading && !failure;

  return (
    <div
      ref={scrollRef}
      aria-live="polite"
      aria-atomic="false"
      aria-label="Conversation"
      className="max-h-[min(62vh,40rem)] min-h-[20rem] overflow-y-auto overscroll-contain px-4 py-5 sm:px-5"
    >
      {isEmpty ? (
        <EmptyState mode={mode} />
      ) : (
        <div className="space-y-5">
          {entityId && (
            <p className="text-center text-[11px] tracking-wide text-fg-faint uppercase">
              Conversation about {entityId}
            </p>
          )}

          {turns.map((turn) =>
            turn.role === "user" ? (
              <UserTurn key={turn.id} content={turn.content} />
            ) : (
              <AssistantTurn key={turn.id} turn={turn} />
            ),
          )}

          {isLoading && <ThinkingTurn />}
          {failure && !isLoading && (
            <FailureTurn failure={failure} onRetry={onRetry} />
          )}
        </div>
      )}
    </div>
  );
}
