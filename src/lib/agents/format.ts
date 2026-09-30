import { parseDbTime, type EntityKind, type Routine } from "./types";

const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const formatTime = (value: string | Date | null) => {
  const date = value instanceof Date ? value : parseDbTime(value);
  if (!date) return "—";
  return `${date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  })} UTC`;
};

export const describeSchedule = (routine: Routine) => {
  const hour = `${String(routine.hour_utc).padStart(2, "0")}:00 UTC`;
  if (routine.cadence === "hourly") return "Every hour";
  if (routine.cadence === "daily") return `Every day at ${hour}`;
  return `Every ${weekdays[routine.weekday]} at ${hour}`;
};

// How long until a future time: "in 40 min", "in 5 h", "in 3 days".
export const formatUntil = (date: Date, now: Date) => {
  const minutes = Math.max(1, Math.round((date.getTime() - now.getTime()) / (60 * 1000)));
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `in ${hours} h`;
  return `in ${Math.round(hours / 24)} days`;
};

export const ENTITY_KIND_LABELS: Record<EntityKind, string> = {
  holding: "Holding company",
  subholding: "Category holding",
  subsidiary: "Operating company",
  brand: "Brand",
  venture: "Venture",
};
