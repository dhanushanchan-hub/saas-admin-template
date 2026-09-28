import { parseDbTime, type Routine } from "./types";

const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const formatTime = (value: string | null) => {
  const date = parseDbTime(value);
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
