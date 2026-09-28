import { Send } from "lucide-react";
import { useState } from "react";

import { Select } from "@/components/agents/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { agentTeamApi } from "@/lib/agents/client";

const examples = [
  "Give me a 90-day plan to launch our next product line, with owners and budget.",
  "Review our technology stack and security posture and give me the top 10 fixes in priority order.",
  "Build a consolidated monthly finance and compliance calendar for every entity in the group.",
  "Design our hiring plan for the next two quarters across all entities.",
];

export function DirectiveForm({
  apiToken,
  entities,
  disabled,
}: {
  apiToken: string;
  entities: { id: string; name: string; depth: number }[];
  disabled?: boolean;
}) {
  const [directive, setDirective] = useState("");
  const [title, setTitle] = useState("");
  const [entityId, setEntityId] = useState("");
  const [priority, setPriority] = useState("normal");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { mission } = await agentTeamApi(apiToken).createMission({
        directive,
        title: title || undefined,
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
      <div className="space-y-2">
        <Label htmlFor="directive">What do you need done?</Label>
        <Textarea
          id="directive"
          rows={5}
          placeholder="Tell Hermes the outcome you want. It plans the work, briefs the right executives and returns one brief."
          value={directive}
          onChange={(event) => setDirective(event.target.value)}
          required
          minLength={5}
        />
        <div className="flex flex-wrap gap-2">
          {examples.map((example) => (
            <button
              key={example}
              type="button"
              className="rounded-full border px-3 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => setDirective(example)}
            >
              {example}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="title">Title (optional)</Label>
          <Input
            id="title"
            placeholder="Hermes will name it"
            value={title}
            maxLength={120}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="entity">Entity</Label>
          <Select
            id="entity"
            value={entityId}
            onChange={(event) => setEntityId(event.target.value)}
          >
            <option value="">Whole group</option>
            {entities.map((entity) => (
              <option key={entity.id} value={entity.id}>
                {"\u00a0\u00a0".repeat(entity.depth)}
                {entity.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="priority">Priority</Label>
          <Select
            id="priority"
            value={priority}
            onChange={(event) => setPriority(event.target.value)}
          >
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </Select>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button type="submit" disabled={disabled || submitting || directive.trim().length < 5}>
        <Send className="mr-2 h-4 w-4" />
        {submitting ? "Briefing Hermes..." : "Send to Hermes"}
      </Button>
    </form>
  );
}
