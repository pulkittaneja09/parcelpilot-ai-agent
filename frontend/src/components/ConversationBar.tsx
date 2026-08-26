import { Hash, MessageSquarePlus } from "lucide-react";
import type { Mode } from "../types/api";

interface ConversationBarProps {
  mode: Mode;
  recordId: string;
  /** Session id returned by the backend, once the first turn has completed. */
  sessionId: string | null;
  turnCount: number;
  isLoading: boolean;
  error?: string | null;
  onRecordIdChange: (value: string) => void;
  onNewConversation: () => void;
}

const COPY: Record<Mode, { label: string; placeholder: string }> = {
  ticket: { label: "Ticket ID", placeholder: "TKT-501" },
  order: { label: "Order ID", placeholder: "ORD-1001" },
};

export default function ConversationBar({
  mode,
  recordId,
  sessionId,
  turnCount,
  isLoading,
  error,
  onRecordIdChange,
  onNewConversation,
}: ConversationBarProps) {
  const copy = COPY[mode];
  const hasConversation = turnCount > 0;

  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-3 border-b border-edge bg-base-800/40 px-4 py-3.5 sm:px-5">
      <div className="min-w-[10rem] flex-1">
        <label
          htmlFor="record-id"
          className="mb-1.5 flex items-center gap-1.5 text-[11.5px] font-medium text-fg-dim"
        >
          <Hash className="size-3 text-fg-faint" />
          {copy.label}
        </label>

        <input
          id="record-id"
          name="record-id"
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={recordId}
          disabled={isLoading}
          placeholder={copy.placeholder}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "record-id-error" : undefined}
          onChange={(event) => onRecordIdChange(event.target.value.toUpperCase())}
          className={[
            "w-full rounded-lg border bg-base-900/70 px-3 py-2 font-mono text-[13px] tracking-wide text-fg transition-all",
            "focus:outline-none focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60",
            error
              ? "border-bad-500/50 focus:border-bad-400 focus:ring-2 focus:ring-bad-500/20"
              : "border-edge hover:border-edge-bright focus:border-brand-500/70 focus:ring-2 focus:ring-brand-500/20",
          ].join(" ")}
        />
      </div>

      {/* Session state — proof the frontend is threading the id back. */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[11.5px] font-medium text-fg-dim">Session</span>
        <span
          className="id-chip max-w-[11rem] truncate text-fg-muted"
          title={sessionId ?? "No session yet"}
        >
          {sessionId ? `${sessionId.slice(0, 8)}…` : "new"}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[11.5px] font-medium text-fg-dim">Turns</span>
        <span className="id-chip text-fg-muted tabular-nums">{turnCount}</span>
      </div>

      <button
        type="button"
        onClick={onNewConversation}
        disabled={isLoading || !hasConversation}
        className="inline-flex items-center gap-2 rounded-lg border border-edge bg-base-750 px-3 py-2 text-xs font-medium text-fg-muted transition-colors hover:border-edge-bright hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
      >
        <MessageSquarePlus className="size-3.5" />
        New Conversation
      </button>

      {error && (
        <p
          id="record-id-error"
          className="animate-fade-in w-full text-xs text-bad-300"
        >
          {error}
        </p>
      )}
    </div>
  );
}
