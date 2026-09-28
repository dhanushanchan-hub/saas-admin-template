import { Pause, Pencil, Play } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { agentTeamApi } from "@/lib/agents/client";

type EditableAgent = {
  id: string;
  name: string;
  status: "active" | "paused";
  mission: string;
  charter: string;
  model: string | null;
};

export function AgentControls({
  apiToken,
  agent,
  canPause,
}: {
  apiToken: string;
  agent: EditableAgent;
  canPause: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [mission, setMission] = useState(agent.mission);
  const [charter, setCharter] = useState(agent.charter);
  const [model, setModel] = useState(agent.model ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = async (changes: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await agentTeamApi(apiToken).updateAgent(agent.id, changes);
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        {canPause && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              update({ status: agent.status === "active" ? "paused" : "active" })
            }
          >
            {agent.status === "active" ? (
              <>
                <Pause className="mr-2 h-4 w-4" /> Pause
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" /> Activate
              </>
            )}
          </Button>
        )}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Pencil className="mr-2 h-4 w-4" /> Train {agent.name}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[640px]">
            <DialogHeader>
              <DialogTitle>Train {agent.name}</DialogTitle>
              <DialogDescription>
                The charter is {agent.name}'s standing brief: how it thinks,
                what excellent work looks like, and what it owns.
              </DialogDescription>
            </DialogHeader>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                update({ mission, charter, model: model.trim() || null });
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="mission">Mission</Label>
                <Textarea
                  id="mission"
                  rows={2}
                  value={mission}
                  onChange={(event) => setMission(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="charter">Charter</Label>
                <Textarea
                  id="charter"
                  rows={10}
                  value={charter}
                  onChange={(event) => setCharter(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="model">Model override (optional)</Label>
                <Input
                  id="model"
                  placeholder="Uses AGENT_MODEL when empty"
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button type="submit" className="w-full" disabled={busy}>
                Save
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      {!open && error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
