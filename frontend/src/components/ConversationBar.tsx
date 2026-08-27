import { Hash, MessageSquarePlus, ShieldCheck } from "lucide-react";
import type { Mode } from "../types/api";

interface ConversationBarProps {
  mode: Mode;
  recordId: string;
  /** Caller identity sent as X-User-ID; the backend resolves role and scope. */
  userId: string;
  /** Session id returned by the backend, once the first turn has completed. */
  sessionId: string | null;
  turnCount: number;
  isLoading: boolean;
  error?: string | null;
  onRecordIdChange: (value: string) => void;
  onUserIdChange: (value: string) => void;
  onNewConversation: () => void;
}

const COPY: Record<Mode, { label: string; placeholder: string }> = {
  ticket: { label: "Ticket ID", placeholder: "TKT-501" },
  order: { label: "Order ID", placeholder: "ORD-1001" },
};

/** The mocked staff directory, mirrored from `app/config/demo_users.py`. */
const DEMO_USERS = [
  { id: "support_agent_1", label: "Support Agent 1 · ACCT-001, ACCT-003" },
  { id: "manager_1", label: "Manager 1 · all accounts" },
  { id: "admin_1", label: "Admin 1 · all accounts" },
];

export default function ConversationBar({
  mode,
  recordId,
  userId,
  sessionId,
  turnCount,
  isLoading,
  error,
  onRecordIdChange,
  onUserIdChange,
  onNewConversation,
}: ConversationBarProps) {
  const copy = COPY[mode];
  const hasConversation = turnCount > 0;

  const fieldClasses = (invalid: boolean) =>
    [
      "w-full rounded-lg border bg-base-900/70 px-3 py-2 font-mono text-[13px] tracking-wide text-fg transition-all",
      "focus:outline-none focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60",
      invalid
        ? "border-bad-500/50 focus:border-bad-400 focus:ring-2 focus:ring-bad-500/20"
        : "border-edge hover:border-edge-bright focus:border-brand-500/70 focus:ring-2 focus:ring-brand-500/20",
    ].join(" ");

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
          className={fieldClasses(Boolean(error))}
        />
      </div>

      {/* Mocked authenticated staff member. The backend resolves this user's
          role and permitted accounts server-side; the ticket id above is never
          treated as proof of authorisation. */}
      <div className="min-w-[11rem] flex-1">
        <label
          htmlFor="demo-user"
          className="mb-1.5 flex items-center gap-1.5 text-[11.5px] font-medium text-fg-dim"
          title="Sent as X-User-ID. Role and account scope are enforced in the backend."
        >
          <ShieldCheck className="size-3 text-fg-faint" />
          Demo User
        </label>

        <select
          id="demo-user"
          name="demo-user"
          value={userId}
          disabled={isLoading}
          onChange={(event) => onUserIdChange(event.target.value)}
          className={fieldClasses(false)}
        >
          {DEMO_USERS.map((user) => (
            <option key={user.id} value={user.id}>
              {user.label}
            </option>
          ))}
        </select>
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
