import { Layers, Menu, Sparkles } from "lucide-react";

interface HeaderProps {
  onOpenSidebar: () => void;
}

export default function Header({ onOpenSidebar }: HeaderProps) {
  return (
    <header className="animate-fade-up">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onOpenSidebar}
          aria-label="Open navigation"
          className="mt-0.5 rounded-lg border border-edge bg-base-850 p-2 text-fg-muted transition-colors hover:border-edge-bright hover:text-fg lg:hidden"
        >
          <Menu className="size-4.5" />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="text-2xl font-semibold tracking-tight text-fg sm:text-[28px]">
              Support Operations Copilot
            </h1>

            <span className="flex items-center gap-1.5 rounded-full border border-brand-500/25 bg-brand-500/10 px-2.5 py-1 text-[11px] font-medium text-brand-300">
              <Sparkles className="size-3" />
              Claude 3.5 Sonnet
            </span>
          </div>

          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-fg-dim">
            Multi-turn conversations grounded in operational context and company
            policies — ask a follow-up and the copilot keeps the thread.
          </p>

          <p className="mt-3 flex items-center gap-2 text-xs text-fg-faint">
            <Layers className="size-3.5 shrink-0" />
            Answers follow source precedence: signed agreements outrank current
            policy, which outranks product docs and historical notes.
          </p>
        </div>
      </div>
    </header>
  );
}
