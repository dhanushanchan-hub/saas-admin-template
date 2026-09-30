import { Hammer } from "lucide-react";
import { useState } from "react";

import { Select } from "@/components/agents/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { agentTeamApi } from "@/lib/agents/client";
import { BUILD_KINDS, buildDirective, type BuildKind } from "@/lib/agents/studio";
import { cn } from "@/lib/utils";

export function BuildRequestForm({
  apiToken,
  entities,
  team,
  disabled,
}: {
  apiToken: string;
  entities: { id: string; name: string; depth: number }[];
  team: { name: string; title: string }[];
  disabled?: boolean;
}) {
  const [kind, setKind] = useState<BuildKind>("website");
  const [brief, setBrief] = useState("");
  const [entityId, setEntityId] = useState("");
  const [priority, setPriority] = useState("normal");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = BUILD_KINDS.find((option) => option.value === kind)!;

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const entity = entities.find((option) => option.id === entityId);
      const { mission } = await agentTeamApi(apiToken).createMission({
        directive: buildDirective({ kind, brief, entityName: entity?.name ?? null, team }),
        entity_id: entityId || null,
        priority,
      });
      window.location.href = `/admin/missions/${mission.id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium leading-none">What should the studio build?</legend>
        <div className="grid gap-2 pt-2 sm:grid-cols-2 lg:grid-cols-5">
          {BUILD_KINDS.map((option) => (
            <label
              key={option.value}
              className={cn(
                "flex cursor-pointer flex-col gap-1 rounded-lg border p-3 text-left transition-colors hover:bg-muted has-[:focus-visible]:ring-1 has-[:focus-visible]:ring-ring",
                kind === option.value && "border-primary bg-muted",
              )}
            >
              <input
                type="radio"
                name="kind"
                value={option.value}
                checked={kind === option.value}
                onChange={() => setKind(option.value)}
                className="sr-only"
              />
              <span className="text-sm font-medium">{option.label}</span>
              <span className="text-xs text-muted-foreground">{option.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-2">
        <Label htmlFor="brief">Describe it</Label>
        <Textarea
          id="brief"
          rows={5}
          placeholder="Who it's for, what it must do, what it must connect to, and any deadline or budget. The studio scopes the first version and asks you about anything missing."
          value={brief}
          onChange={(event) => setBrief(event.target.value)}
          required
          minLength={10}
        />
        <button
          type="button"
          className="rounded-full border px-3 py-1 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={() => setBrief(selected.example)}
        >
          Example: {selected.example}
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="build-entity">For</Label>
          <Select id="build-entity" value={entityId} onChange={(event) => setEntityId(event.target.value)}>
            <option value="">Whole group</option>
            {entities.map((entity) => (
              <option key={entity.id} value={entity.id}>
                {"  ".repeat(entity.depth)}
                {entity.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="build-priority">Priority</Label>
          <Select id="build-priority" value={priority} onChange={(event) => setPriority(event.target.value)}>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </Select>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button type="submit" disabled={disabled || submitting || brief.trim().length < 10}>
        <Hammer />
        {submitting ? "Sending to the studio..." : "Send to the Build Studio"}
      </Button>
    </form>
  );
}
