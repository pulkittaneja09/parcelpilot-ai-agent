import { Check, PackageSearch, TicketCheck } from "lucide-react";
import type { Mode } from "../types/api";

interface ModeSelectorProps {
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  disabled?: boolean;
}

const MODES: Array<{
  mode: Mode;
  title: string;
  description: string;
  endpoint: string;
  icon: typeof TicketCheck;
}> = [
  {
    mode: "ticket",
    title: "Ticket Analysis",
    description: "Severity, SLA response times, and escalation guidance.",
    endpoint: 'POST /api/chat · entity_type: "ticket"',
    icon: TicketCheck,
  },
  {
    mode: "order",
    title: "Order Analysis",
    description: "Cancellation fees, service credits, and shipment state.",
    endpoint: 'POST /api/chat · entity_type: "order"',
    icon: PackageSearch,
  },
];

export default function ModeSelector({
  mode,
  onModeChange,
  disabled = false,
}: ModeSelectorProps) {
  return (
    <div
      role="tablist"
      aria-label="Analysis mode"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4"
    >
      {MODES.map((option) => {
        const isActive = mode === option.mode;
        const Icon = option.icon;

        return (
          <button
            key={option.mode}
            type="button"
            role="tab"
            aria-selected={isActive}
            disabled={disabled}
            onClick={() => onModeChange(option.mode)}
            className={[
              "group relative overflow-hidden rounded-2xl border p-4 text-left transition-all duration-200 sm:p-5",
              "disabled:cursor-not-allowed disabled:opacity-60",
              isActive
                ? "border-brand-500/40 bg-gradient-to-br from-brand-500/[0.13] via-base-850 to-base-850 shadow-[0_0_0_1px_rgba(79,124,255,0.12),0_14px_40px_-18px_rgba(79,124,255,0.5)]"
                : "border-edge bg-base-850/60 hover:border-edge-bright hover:bg-base-800/70",
            ].join(" ")}
          >
            {/* Top edge highlight on the active card */}
            {isActive && (
              <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-400/70 to-transparent" />
            )}

            <div className="flex items-start gap-3.5">
              <span
                className={[
                  "grid size-10 shrink-0 place-items-center rounded-xl border transition-colors",
                  isActive
                    ? "border-brand-500/30 bg-brand-500/15 text-brand-300"
                    : "border-edge bg-base-750 text-fg-dim group-hover:text-fg-muted",
                ].join(" ")}
              >
                <Icon className="size-5" />
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2
                    className={[
                      "text-[15px] font-semibold tracking-tight transition-colors",
                      isActive ? "text-fg" : "text-fg-muted",
                    ].join(" ")}
                  >
                    {option.title}
                  </h2>

                  {isActive && (
                    <span className="animate-scale-in grid size-4 place-items-center rounded-full bg-brand-500">
                      <Check className="size-2.5 text-white" strokeWidth={3} />
                    </span>
                  )}
                </div>

                <p className="mt-1 text-[13px] leading-relaxed text-fg-dim">
                  {option.description}
                </p>

                <code
                  className={[
                    "mt-2.5 block truncate font-mono text-[11px] transition-colors",
                    isActive ? "text-brand-400/90" : "text-fg-faint",
                  ].join(" ")}
                >
                  {option.endpoint}
                </code>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
