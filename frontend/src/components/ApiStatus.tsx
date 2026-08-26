import { Activity, ArrowUpRight, RefreshCw, ServerCog } from "lucide-react";
import { DISPLAY_BASE_URL, IS_PROXIED } from "../services/api";
import type { BackendStatus, HealthResponse } from "../types/api";

/* ------------------------------------------------------------------- shared */

const DOT_STYLES: Record<BackendStatus, string> = {
  online: "bg-ok-400",
  offline: "bg-bad-400",
  checking: "bg-warn-400",
};

const LABELS: Record<BackendStatus, string> = {
  online: "Connected",
  offline: "Unavailable",
  checking: "Checking…",
};

/** Animated status dot — pulses a halo while online, blinks while checking. */
function StatusDot({ status }: { status: BackendStatus }) {
  return (
    <span className="relative flex size-2.5 shrink-0">
      {status === "online" && (
        <span className="absolute inset-0 animate-halo rounded-full bg-ok-400" />
      )}
      <span
        className={[
          "relative size-2.5 rounded-full",
          DOT_STYLES[status],
          status === "checking" ? "animate-blink" : "",
        ].join(" ")}
      />
    </span>
  );
}

/* --------------------------------------------------------- sidebar footer */

interface PillProps {
  status: BackendStatus;
  latencyMs: number | null;
  onRefresh: () => void;
}

/** Compact indicator pinned to the bottom of the sidebar. */
export function BackendStatusPill({ status, latencyMs, onRefresh }: PillProps) {
  return (
    <div className="rounded-xl border border-edge bg-base-900/70 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold tracking-[0.12em] text-fg-faint uppercase">
          Backend Status
        </span>
        <button
          type="button"
          onClick={onRefresh}
          title="Re-check /health"
          aria-label="Re-check backend health"
          className="rounded-md p-1 text-fg-faint transition-colors hover:bg-base-750 hover:text-fg-muted"
        >
          <RefreshCw
            className={`size-3.5 ${status === "checking" ? "animate-spin" : ""}`}
          />
        </button>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <StatusDot status={status} />
        <span
          className={[
            "text-sm font-medium",
            status === "online"
              ? "text-ok-300"
              : status === "offline"
                ? "text-bad-300"
                : "text-warn-400",
          ].join(" ")}
        >
          {LABELS[status]}
        </span>
        {status === "online" && latencyMs !== null && (
          <span className="ml-auto font-mono text-[11px] text-fg-faint">
            {latencyMs} ms
          </span>
        )}
      </div>

      <p className="mt-1.5 truncate font-mono text-[10.5px] text-fg-faint">
        {DISPLAY_BASE_URL}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------- status view */

interface PanelProps {
  status: BackendStatus;
  health: HealthResponse | null;
  latencyMs: number | null;
  lastCheckedAt: Date | null;
  error: string | null;
  onRefresh: () => void;
}

const ENDPOINTS = [
  { method: "GET", path: "/health", description: "Service health check" },
  { method: "GET", path: "/", description: "API root" },
  {
    method: "POST",
    path: "/api/tickets/{ticket_id}/answer",
    description: "AI answer for a support ticket",
  },
  {
    method: "POST",
    path: "/api/orders/{order_id}/answer",
    description: "AI answer for an order",
  },
];

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-edge bg-base-800/50 px-4 py-3">
      <dt className="text-[11px] font-semibold tracking-[0.1em] text-fg-faint uppercase">
        {label}
      </dt>
      <dd className="mt-1 truncate font-mono text-sm text-fg">{value}</dd>
    </div>
  );
}

/** Full "API Status" page reachable from the sidebar nav. */
export function ApiStatusPanel({
  status,
  health,
  latencyMs,
  lastCheckedAt,
  error,
  onRefresh,
}: PanelProps) {
  return (
    <div className="animate-fade-up space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-fg sm:text-3xl">
          API Status
        </h1>
        <p className="mt-1.5 text-sm text-fg-dim">
          Live connectivity to the ParcelPilot FastAPI service.
        </p>
      </div>

      {/* Health summary */}
      <section className="panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-edge bg-base-800/40 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-lg border border-edge bg-base-750">
              <ServerCog className="size-4.5 text-brand-400" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-fg">Health check</h2>
              <p className="font-mono text-xs text-fg-dim">GET /health</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="flex items-center gap-2 rounded-full border border-edge bg-base-900/60 px-3 py-1.5">
              <StatusDot status={status} />
              <span className="text-xs font-medium text-fg-muted">
                {LABELS[status]}
              </span>
            </span>
            <button
              type="button"
              onClick={onRefresh}
              disabled={status === "checking"}
              className="flex items-center gap-2 rounded-lg border border-edge bg-base-750 px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:border-edge-bright hover:text-fg disabled:opacity-50"
            >
              <RefreshCw
                className={`size-3.5 ${status === "checking" ? "animate-spin" : ""}`}
              />
              Refresh
            </button>
          </div>
        </div>

        <dl className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Status" value={health?.status ?? "—"} />
          <Field label="Service" value={health?.service ?? "—"} />
          <Field
            label="Latency"
            value={latencyMs !== null ? `${latencyMs} ms` : "—"}
          />
          <Field
            label="Last checked"
            value={lastCheckedAt ? lastCheckedAt.toLocaleTimeString() : "—"}
          />
        </dl>

        {error && (
          <div className="mx-5 mb-5 rounded-xl border border-bad-500/30 bg-bad-500/[0.07] px-4 py-3 text-sm text-bad-300">
            {error}
          </div>
        )}
      </section>

      {/* Connection mode */}
      <section className="panel p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Activity className="size-4 text-aqua-400" />
          Connection
        </h2>

        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-edge/70 pb-3">
            <dt className="text-fg-dim">Backend URL</dt>
            <dd className="font-mono text-xs text-fg">{DISPLAY_BASE_URL}</dd>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-edge/70 pb-3">
            <dt className="text-fg-dim">Request routing</dt>
            <dd className="text-xs font-medium text-fg">
              {IS_PROXIED ? "Vite dev proxy (same-origin)" : "Direct browser fetch"}
            </dd>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <dt className="text-fg-dim">CORS required</dt>
            <dd
              className={`text-xs font-medium ${IS_PROXIED ? "text-ok-300" : "text-warn-400"}`}
            >
              {IS_PROXIED ? "No — proxied through Vite" : "Yes — on the backend"}
            </dd>
          </div>
        </dl>

        <p className="mt-4 rounded-lg border border-edge bg-base-900/50 px-3.5 py-2.5 text-xs leading-relaxed text-fg-dim">
          Requests are sent to relative paths and forwarded by the Vite dev
          server, so the browser treats them as same-origin and the FastAPI app
          needs no CORS configuration.
        </p>
      </section>

      {/* Endpoint reference */}
      <section className="panel overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-edge bg-base-800/40 px-5 py-4">
          <h2 className="text-sm font-semibold text-fg">Endpoints</h2>
          <a
            href={`${DISPLAY_BASE_URL}/docs`}
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center gap-1 text-xs font-medium text-brand-400 transition-colors hover:text-brand-300"
          >
            OpenAPI docs
            <ArrowUpRight className="size-3.5" />
          </a>
        </div>

        <ul className="divide-y divide-edge/70">
          {ENDPOINTS.map((endpoint) => (
            <li
              key={`${endpoint.method}-${endpoint.path}`}
              className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-5 py-3.5 transition-colors hover:bg-base-800/30"
            >
              <span
                className={[
                  "rounded-md border px-2 py-0.5 font-mono text-[10.5px] font-semibold",
                  endpoint.method === "GET"
                    ? "border-aqua-500/30 bg-aqua-500/10 text-aqua-300"
                    : "border-brand-500/30 bg-brand-500/10 text-brand-300",
                ].join(" ")}
              >
                {endpoint.method}
              </span>
              <code className="font-mono text-[13px] text-fg">{endpoint.path}</code>
              <span className="ml-auto text-xs text-fg-dim">
                {endpoint.description}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
