import { ArrowUpRight, CircleCheck, CircleSlash, Clock } from "lucide-react";
import { useEffect, useState } from "react";

import {
  PULL_REQUESTS_API,
  PULL_REQUESTS_URL,
  pullRequestUrl,
  toDeliveries,
  type Delivery,
  type DeliveryStatus,
  type PullRequest,
} from "@/lib/deliveries";

const CACHE_KEY = "tiva-deliveries";
const CACHE_MS = 10 * 60 * 1000;

// GitHub's answer is kept for ten minutes, so reloading the dashboard stays
// well inside GitHub's limit for requests without a token.
const readCache = (): PullRequest[] | null => {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null");
    return cached && Date.now() - cached.at < CACHE_MS ? cached.pulls : null;
  } catch {
    return null;
  }
};

const writeCache = (pulls: PullRequest[]) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), pulls }));
  } catch {
    // Storage can be full or blocked; the next visit asks GitHub again.
  }
};

const fetchPulls = async (): Promise<PullRequest[]> => {
  const response = await fetch(PULL_REQUESTS_API, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
  const pulls: PullRequest[] = await response.json();
  return pulls.map(({ number, title, state, created_at, merged_at, head }) => ({
    number,
    title,
    state,
    created_at,
    merged_at,
    head: { ref: head.ref },
  }));
};

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

const groups: {
  status: DeliveryStatus;
  title: string;
  note?: string;
  icon: typeof Clock;
  iconClass: string;
}[] = [
  {
    status: "review",
    title: "Waiting for your review",
    note: "Open each one on GitHub, check it, and merge it to switch it on. The pull request lists any setup step it needs after merging.",
    icon: Clock,
    iconClass: "text-amber-600 dark:text-amber-400",
  },
  {
    status: "live",
    title: "Live in TIVA HQ",
    icon: CircleCheck,
    iconClass: "text-emerald-600 dark:text-emerald-400",
  },
  {
    status: "closed",
    title: "Closed without merging",
    icon: CircleSlash,
    iconClass: "text-muted-foreground",
  },
];

export function DeliveryLog({
  initial,
  snapshotDate,
}: {
  initial: Delivery[];
  snapshotDate: string;
}) {
  const [deliveries, setDeliveries] = useState(initial);
  const [source, setSource] = useState<"checking" | "github" | "snapshot">("checking");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        let pulls = readCache();
        if (!pulls) {
          pulls = await fetchPulls();
          writeCache(pulls);
        }
        if (!cancelled) {
          setDeliveries(toDeliveries(pulls));
          setSource("github");
        }
      } catch {
        if (!cancelled) setSource("snapshot");
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const count = (status: DeliveryStatus) =>
    deliveries.filter((delivery) => delivery.status === status).length;
  const sourceText = {
    checking: "Checking GitHub for the latest...",
    github: "Live from GitHub.",
    snapshot: `GitHub couldn't be reached, so this is the list as of ${formatDate(snapshotDate)}.`,
  }[source];

  return (
    <section id="built" aria-labelledby="built-heading" className="scroll-mt-6 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 id="built-heading" className="text-xl font-bold tracking-tight">
            Built by Claude Code
          </h3>
          <p className="text-sm text-muted-foreground">
            {count("live")} live · {count("review")} waiting for your review. {sourceText}
          </p>
        </div>
        <a
          href={PULL_REQUESTS_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-sm font-medium underline"
        >
          All pull requests <ArrowUpRight className="h-4 w-4" />
        </a>
      </div>

      {groups.map((group) => {
        const items = deliveries
          .filter((delivery) => delivery.status === group.status)
          .sort((a, b) => b.number - a.number);
        if (!items.length) return null;
        return (
          <div key={group.status} className="space-y-2">
            <h4 className="flex items-center gap-2 text-sm font-semibold">
              <group.icon className={`h-4 w-4 ${group.iconClass}`} aria-hidden="true" />
              {group.title} ({items.length})
            </h4>
            {group.note && <p className="text-sm text-muted-foreground">{group.note}</p>}
            <ul className="divide-y rounded-xl border bg-card text-card-foreground shadow">
              {items.map((delivery) => (
                <li key={delivery.number} className="space-y-2 p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <p className="font-medium">
                      <span className="text-muted-foreground">#{delivery.number}</span> {delivery.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {delivery.merged_at
                        ? `Merged ${formatDate(delivery.merged_at)}`
                        : `Opened ${formatDate(delivery.opened_at)}`}
                    </p>
                  </div>
                  {delivery.summary && (
                    <p className="text-sm text-muted-foreground">{delivery.summary}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    {delivery.status === "live" &&
                      delivery.links?.map((link) => (
                        <a key={link.href} href={link.href} className="font-medium underline">
                          Open {link.label}
                        </a>
                      ))}
                    <a
                      href={pullRequestUrl(delivery.number)}
                      target="_blank"
                      rel="noreferrer"
                      className={`inline-flex items-center gap-1 underline ${delivery.status === "review" ? "font-medium" : "text-muted-foreground"}`}
                    >
                      {delivery.status === "review" ? "Review on GitHub" : "Pull request"}
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
