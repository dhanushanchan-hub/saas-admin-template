import { RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { agentTeamApi } from "@/lib/agents/client";
import type { StatusSnapshot } from "@/lib/agents/health";

const chip: Record<string, string> = {
  live: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  connected: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  configure: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  external: "bg-muted text-muted-foreground",
};

const dot: Record<string, string> = {
  live: "bg-emerald-500",
  connected: "bg-emerald-500",
  configure: "bg-amber-500",
  external: "bg-muted-foreground/40",
};

const REFRESH_MS = 20000;

const clock = (iso: string | null) =>
  iso ? new Date(iso.replace(" ", "T") + (iso.includes("Z") ? "" : "Z")).toLocaleString() : "—";

export function JunctionMonitor({
  apiToken,
  initial,
}: {
  apiToken: string;
  initial: StatusSnapshot;
}) {
  const [snapshot, setSnapshot] = useState(initial);
  const [checkedAt, setCheckedAt] = useState<Date>(new Date());
  const [refreshing, setRefreshing] = useState(false);
  const [auto, setAuto] = useState(true);
  const timer = useRef<number | null>(null);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const next = await agentTeamApi(apiToken).status();
      if (next?.groups) {
        setSnapshot(next);
        setCheckedAt(new Date());
      }
    } catch {
      // Keep the last snapshot; the next tick tries again.
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!auto) return;
    timer.current = window.setInterval(refresh, REFRESH_MS);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);

  const { summary, metrics } = snapshot;
  const tiles = [
    { label: "Connectors active", value: `${summary.active}/${summary.total}` },
    { label: "Missions in flight", value: metrics.missions_in_flight },
    { label: "Briefs (24h)", value: metrics.briefs_24h },
    { label: "Cloud runs", value: metrics.cloud_runs },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className={`inline-block h-2 w-2 rounded-full ${auto ? "animate-pulse bg-emerald-500" : "bg-muted-foreground/40"}`} />
          {auto ? "Live" : "Paused"} · checked {checkedAt.toLocaleTimeString()}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
            Auto-refresh
          </label>
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1 rounded-md border px-3 py-1 text-xs font-medium hover:bg-muted"
          >
            <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-lg border p-4">
            <div className="text-2xl font-bold">{tile.value}</div>
            <div className="text-xs text-muted-foreground">{tile.label}</div>
          </div>
        ))}
      </div>

      {snapshot.groups.map((group) => (
        <section key={group.id} className="space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">{group.title}</h2>
            <span className="text-xs text-muted-foreground">
              {group.active}/{group.total} active
            </span>
          </div>
          <p className="max-w-3xl text-sm text-muted-foreground">{group.description}</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.connectors.map((connector) => (
              <a
                key={connector.id}
                href={connector.href}
                target={connector.external ? "_blank" : undefined}
                rel={connector.external ? "noreferrer" : undefined}
                className="flex flex-col gap-1 rounded-lg border p-4 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 font-medium">
                    <span className={`inline-block h-2 w-2 rounded-full ${dot[connector.status]}`} />
                    {connector.name}
                  </span>
                  <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${chip[connector.status]}`}>
                    {connector.label}
                  </span>
                </div>
                <span className="text-sm text-muted-foreground">{connector.detail}</span>
              </a>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
