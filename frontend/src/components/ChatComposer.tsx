import { useEffect, useRef, type FormEvent, type KeyboardEvent } from "react";
import { CornerDownLeft, Loader2, Send } from "lucide-react";
import type { Mode } from "../types/api";

interface ChatComposerProps {
  mode: Mode;
  value: string;
  isLoading: boolean;
  /** Shown under the field when the record ID changed mid-conversation. */
  notice?: string | null;
  error?: string | null;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

/** Matches the backend's `message` max_length. */
const MAX_MESSAGE_LENGTH = 4000;

const PLACEHOLDER: Record<Mode, string> = {
  ticket: "Ask about severity, SLA, escalation, or what to tell the customer…",
  order: "Ask about cancellation fees, service credits, or shipment state…",
};

export default function ChatComposer({
  mode,
  value,
  isLoading,
  notice,
  error,
  onChange,
  onSubmit,
}: ChatComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Grow with the content up to a few lines, then scroll internally.
  useEffect(() => {
    const field = textareaRef.current;
    if (!field) return;

    field.style.height = "auto";
    field.style.height = `${Math.min(field.scrollHeight, 176)}px`;
  }, [value]);

  // Return focus to the field once a reply lands, ready for the follow-up.
  useEffect(() => {
    if (!isLoading) textareaRef.current?.focus();
  }, [isLoading]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };

  // Enter sends; Shift+Enter (and Ctrl/Cmd+Enter) insert a newline or send.
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter") return;

    if (event.shiftKey) return;

    event.preventDefault();
    onSubmit();
  };

  const isEmpty = value.trim().length === 0;

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="border-t border-edge bg-base-900/40 px-4 py-4 sm:px-5"
    >
      <div
        className={[
          "flex items-end gap-2.5 rounded-2xl border bg-base-900/70 p-2 transition-all",
          error
            ? "border-bad-500/50"
            : "border-edge focus-within:border-brand-500/70 focus-within:ring-2 focus-within:ring-brand-500/20",
        ].join(" ")}
      >
        <textarea
          ref={textareaRef}
          id="chat-message"
          name="chat-message"
          rows={1}
          value={value}
          disabled={isLoading}
          maxLength={MAX_MESSAGE_LENGTH}
          placeholder={PLACEHOLDER[mode]}
          aria-label="Message"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "chat-message-error" : undefined}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          className="max-h-44 flex-1 resize-none bg-transparent px-2.5 py-2 text-[14.5px] leading-relaxed text-fg outline-none placeholder:text-fg-faint disabled:cursor-not-allowed disabled:opacity-60"
        />

        <button
          type="submit"
          disabled={isLoading || isEmpty}
          aria-label="Send message"
          className={[
            "group inline-flex size-10 shrink-0 items-center justify-center rounded-xl text-white transition-all duration-200",
            "bg-gradient-to-br from-brand-500 to-brand-600",
            "shadow-[0_1px_0_0_rgba(255,255,255,0.12)_inset,0_8px_22px_-10px_rgba(79,124,255,0.9)]",
            "hover:from-brand-400 hover:to-brand-500 active:scale-[0.97]",
            "disabled:cursor-not-allowed disabled:from-base-700 disabled:to-base-700 disabled:text-fg-dim disabled:shadow-none",
          ].join(" ")}
        >
          {isLoading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4 transition-transform group-hover:translate-x-0.5" />
          )}
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
        {error ? (
          <p id="chat-message-error" className="text-xs text-bad-300">
            {error}
          </p>
        ) : notice ? (
          <p className="text-[11.5px] text-warn-400">{notice}</p>
        ) : (
          <p className="flex items-center gap-1.5 text-[11.5px] text-fg-faint">
            <kbd className="flex items-center gap-1 rounded-md border border-edge bg-base-800 px-1.5 py-0.5 font-mono text-[10px] text-fg-dim">
              <CornerDownLeft className="size-2.5" />
              Enter
            </kbd>
            to send ·
            <kbd className="rounded-md border border-edge bg-base-800 px-1.5 py-0.5 font-mono text-[10px] text-fg-dim">
              Shift
            </kbd>
            +
            <kbd className="rounded-md border border-edge bg-base-800 px-1.5 py-0.5 font-mono text-[10px] text-fg-dim">
              Enter
            </kbd>
            for a new line
          </p>
        )}

        <span
          className={[
            "ml-auto font-mono text-[11px] tabular-nums",
            value.length > MAX_MESSAGE_LENGTH * 0.9
              ? "text-warn-400"
              : "text-fg-faint",
          ].join(" ")}
        >
          {value.length}/{MAX_MESSAGE_LENGTH}
        </span>
      </div>
    </form>
  );
}
