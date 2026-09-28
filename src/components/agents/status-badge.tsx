import { cn } from "@/lib/utils";

const styles: Record<string, string> = {
  queued: "bg-muted text-muted-foreground",
  pending: "bg-muted text-muted-foreground",
  planning: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  executing: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  running: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  synthesizing: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300",
  completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  failed: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  critical: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  high: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  paused: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  skipped: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
};

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium capitalize",
        styles[status] ?? "border text-foreground",
        className,
      )}
    >
      {status}
    </span>
  );
}
