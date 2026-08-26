import { FileSignature, History, PackageOpen, ShieldCheck } from "lucide-react";

/**
 * Visual reference for the precedence rules the agent applies when sources
 * disagree. Mirrors the SOURCE PRECEDENCE block in the backend prompt.
 */
const LEVELS = [
  {
    rank: 1,
    label: "Signed agreement",
    detail: "Customer-specific contract terms",
    icon: FileSignature,
    accent: "text-brand-300 border-brand-500/30 bg-brand-500/10",
  },
  {
    rank: 2,
    label: "Policy or SOP",
    detail: "Current company policy",
    icon: ShieldCheck,
    accent: "text-aqua-300 border-aqua-500/30 bg-aqua-500/10",
  },
  {
    rank: 3,
    label: "Product docs",
    detail: "Current operations guide",
    icon: PackageOpen,
    accent: "text-fg-muted border-edge-bright bg-base-750",
  },
  {
    rank: 4,
    label: "Historical notes",
    detail: "Past tickets and resolutions",
    icon: History,
    accent: "text-fg-dim border-edge bg-base-800",
  },
];

export default function SourcePrecedence() {
  return (
    <section className="panel p-5">
      <h2 className="text-sm font-semibold tracking-tight text-fg">
        Source Precedence
      </h2>
      <p className="mt-1 text-[11.5px] leading-relaxed text-fg-dim">
        When sources conflict, the higher rank wins. Deprecated documents are
        never used.
      </p>

      <ol className="mt-4 space-y-2">
        {LEVELS.map((level, index) => {
          const Icon = level.icon;

          return (
            <li key={level.rank} className="relative">
              {/* Connector between rungs */}
              {index < LEVELS.length - 1 && (
                <span className="absolute top-9 left-[15px] h-3.5 w-px bg-edge" />
              )}

              <div className="flex items-center gap-3">
                <span
                  className={`grid size-8 shrink-0 place-items-center rounded-lg border ${level.accent}`}
                >
                  <Icon className="size-3.5" />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="flex items-baseline gap-1.5 text-[13px] font-medium text-fg-muted">
                    <span className="font-mono text-[10.5px] text-fg-faint">
                      {level.rank}
                    </span>
                    {level.label}
                  </p>
                  <p className="truncate text-[11px] text-fg-faint">
                    {level.detail}
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
