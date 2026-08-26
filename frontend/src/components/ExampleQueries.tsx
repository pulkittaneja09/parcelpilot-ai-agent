import { ArrowRight, Lightbulb } from "lucide-react";
import { examplesForMode } from "../data/examples";
import type { ExampleQuery, Mode } from "../types/api";

interface ExampleQueriesProps {
  mode: Mode;
  /** Currently loaded id, so the matching example can be highlighted. */
  activeId?: string;
  activeQuery?: string;
  disabled?: boolean;
  onSelect: (example: ExampleQuery) => void;
}

export default function ExampleQueries({
  mode,
  activeId,
  activeQuery,
  disabled = false,
  onSelect,
}: ExampleQueriesProps) {
  const examples = examplesForMode(mode);

  return (
    <section className="panel p-5">
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 place-items-center rounded-lg border border-warn-400/25 bg-warn-400/10">
          <Lightbulb className="size-4 text-warn-400" />
        </span>
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-fg">
            Example Queries
          </h2>
          <p className="text-[11.5px] text-fg-dim">
            Click to start a conversation. All records are seeded.
          </p>
        </div>
      </div>

      <ul className="mt-4 space-y-2.5">
        {examples.map((example) => {
          const isActive =
            example.id === activeId && example.query === activeQuery;

          return (
            <li key={`${example.id}-${example.label}`}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onSelect(example)}
                className={[
                  "group w-full rounded-xl border p-3.5 text-left transition-all duration-200",
                  "disabled:cursor-not-allowed disabled:opacity-60",
                  isActive
                    ? "border-brand-500/35 bg-brand-500/[0.08]"
                    : "border-edge bg-base-900/40 hover:border-edge-bright hover:bg-base-800/60",
                ].join(" ")}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={[
                      "id-chip shrink-0 transition-colors",
                      isActive ? "text-brand-300" : "text-fg-muted",
                    ].join(" ")}
                  >
                    {example.id}
                  </span>

                  <span className="truncate text-[11px] font-medium tracking-wide text-fg-faint uppercase">
                    {example.label}
                  </span>

                  <ArrowRight
                    className={[
                      "ml-auto size-3.5 shrink-0 transition-all",
                      isActive
                        ? "text-brand-400"
                        : "text-fg-faint opacity-0 group-hover:translate-x-0.5 group-hover:opacity-100",
                    ].join(" ")}
                  />
                </div>

                <p
                  className={[
                    "mt-2 text-[13px] leading-snug transition-colors",
                    isActive
                      ? "text-fg-muted"
                      : "text-fg-dim group-hover:text-fg-muted",
                  ].join(" ")}
                >
                  {example.query}
                </p>

                <p className="mt-1.5 text-[11px] text-fg-faint">
                  {example.account}
                </p>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
