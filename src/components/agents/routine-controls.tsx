import { Play } from "lucide-react";
import { useState } from "react";

import { Select } from "@/components/agents/select";
import { Button } from "@/components/ui/button";
import { agentTeamApi } from "@/lib/agents/client";

const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type EditableRoutine = {
  id: string;
  cadence: "hourly" | "daily" | "weekly";
  hour_utc: number;
  weekday: number;
  enabled: boolean;
};

export function RoutineControls({
  apiToken,
  routine,
}: {
  apiToken: string;
  routine: EditableRoutine;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const api = agentTeamApi(apiToken);

  const act = async (action: () => Promise<{ mission?: { id: number } }>) => {
    setBusy(true);
    setError(null);
    try {
      const result = await action();
      if (result?.mission) {
        window.location.href = `/admin/missions/${result.mission.id}`;
      } else {
        window.location.reload();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  const update = (changes: Partial<EditableRoutine>) =>
    act(() => api.updateRoutine(routine.id, changes));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          aria-label="Cadence"
          className="w-28"
          value={routine.cadence}
          disabled={busy}
          onChange={(event) =>
            update({ cadence: event.target.value as EditableRoutine["cadence"] })
          }
        >
          <option value="hourly">Hourly</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
        </Select>
        {routine.cadence === "weekly" && (
          <Select
            aria-label="Weekday"
            className="w-32"
            value={routine.weekday}
            disabled={busy}
            onChange={(event) => update({ weekday: Number(event.target.value) })}
          >
            {weekdays.map((day, index) => (
              <option key={day} value={index}>
                {day}
              </option>
            ))}
          </Select>
        )}
        {routine.cadence !== "hourly" && (
          <Select
            aria-label="Hour (UTC)"
            className="w-28"
            value={routine.hour_utc}
            disabled={busy}
            onChange={(event) => update({ hour_utc: Number(event.target.value) })}
          >
            {Array.from({ length: 24 }, (_, hour) => (
              <option key={hour} value={hour}>
                {String(hour).padStart(2, "0")}:00 UTC
              </option>
            ))}
          </Select>
        )}
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => update({ enabled: !routine.enabled })}
        >
          {routine.enabled ? "Pause" : "Enable"}
        </Button>
        <Button size="sm" disabled={busy} onClick={() => act(() => api.runRoutine(routine.id))}>
          <Play className="mr-1 h-4 w-4" /> Run now
        </Button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
