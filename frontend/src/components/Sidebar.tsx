import { Activity, Boxes, Database, Sparkles, X } from "lucide-react";
import { BackendStatusPill } from "./ApiStatus";
import type { BackendStatus } from "../types/api";

export type View = "assistant" | "status";

interface SidebarProps {
  view: View;
  onViewChange: (view: View) => void;
  status: BackendStatus;
  latencyMs: number | null;
  onRefreshHealth: () => void;
  /** Mobile drawer state — the sidebar is always visible from `lg` up. */
  isOpen: boolean;
  onClose: () => void;
}

const NAV_ITEMS: Array<{ view: View; label: string; icon: typeof Sparkles }> = [
  { view: "assistant", label: "Support Assistant", icon: Sparkles },
  { view: "status", label: "API Status", icon: Activity },
];

/** Small read-only list describing the backend stack. */
const STACK = [
  { label: "Claude 3.5 Sonnet", detail: "Reasoning" },
  { label: "ChromaDB", detail: "Retrieval" },
  { label: "SQLite", detail: "Operations" },
];

export default function Sidebar({
  view,
  onViewChange,
  status,
  latencyMs,
  onRefreshHealth,
  isOpen,
  onClose,
}: SidebarProps) {
  return (
    <>
      {/* Mobile backdrop */}
      <div
        onClick={onClose}
        aria-hidden={!isOpen}
        className={[
          "fixed inset-0 z-30 bg-base-950/80 backdrop-blur-sm transition-opacity duration-300 lg:hidden",
          isOpen ? "opacity-100" : "pointer-events-none opacity-0",
        ].join(" ")}
      />

      <aside
        className={[
          "fixed inset-y-0 left-0 z-40 flex w-[17.5rem] flex-col border-r border-edge bg-base-900/95 backdrop-blur-xl transition-transform duration-300 ease-out lg:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        {/* Brand */}
        <div className="flex items-center gap-3 border-b border-edge px-5 py-5">
          <span className="relative grid size-10 shrink-0 place-items-center rounded-xl border border-brand-500/30 bg-gradient-to-br from-brand-500/25 via-brand-600/10 to-aqua-500/20">
            <span className="absolute inset-0 rounded-xl bg-brand-500/10 blur-md" />
            <Boxes className="relative size-5 text-brand-300" />
          </span>

          <div className="min-w-0">
            <p className="truncate text-[15px] leading-tight font-semibold tracking-tight text-fg">
              ParcelPilot
            </p>
            <p className="truncate text-[11.5px] leading-tight font-medium tracking-wide text-brand-400/90">
              AI Support Copilot
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="ml-auto rounded-lg p-1.5 text-fg-dim transition-colors hover:bg-base-750 hover:text-fg lg:hidden"
          >
            <X className="size-4.5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <p className="px-2 pb-2 text-[10.5px] font-semibold tracking-[0.14em] text-fg-faint uppercase">
            Workspace
          </p>

          <ul className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const isActive = view === item.view;
              const Icon = item.icon;

              return (
                <li key={item.view}>
                  <button
                    type="button"
                    onClick={() => {
                      onViewChange(item.view);
                      onClose();
                    }}
                    aria-current={isActive ? "page" : undefined}
                    className={[
                      "group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
                      isActive
                        ? "border border-brand-500/25 bg-brand-500/10 text-fg"
                        : "border border-transparent text-fg-dim hover:bg-base-800/70 hover:text-fg-muted",
                    ].join(" ")}
                  >
                    {/* Active rail */}
                    {isActive && (
                      <span className="absolute top-1/2 -left-px h-5 w-0.5 -translate-y-1/2 rounded-full bg-brand-400" />
                    )}
                    <Icon
                      className={[
                        "size-4.5 shrink-0 transition-colors",
                        isActive
                          ? "text-brand-300"
                          : "text-fg-faint group-hover:text-fg-dim",
                      ].join(" ")}
                    />
                    {item.label}
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Stack summary */}
          <p className="px-2 pt-6 pb-2 text-[10.5px] font-semibold tracking-[0.14em] text-fg-faint uppercase">
            Engine
          </p>

          <ul className="space-y-1.5 px-1">
            {STACK.map((entry) => (
              <li
                key={entry.label}
                className="flex items-center gap-2.5 rounded-lg px-2 py-1.5"
              >
                <Database className="size-3.5 shrink-0 text-fg-faint" />
                <span className="text-[13px] text-fg-muted">{entry.label}</span>
                <span className="ml-auto text-[10.5px] tracking-wide text-fg-faint uppercase">
                  {entry.detail}
                </span>
              </li>
            ))}
          </ul>
        </nav>

        {/* Health */}
        <div className="border-t border-edge p-3">
          <BackendStatusPill
            status={status}
            latencyMs={latencyMs}
            onRefresh={onRefreshHealth}
          />
        </div>
      </aside>
    </>
  );
}
