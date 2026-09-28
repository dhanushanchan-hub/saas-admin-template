import { GraduationCap, Trash2 } from "lucide-react";
import { useState } from "react";

import { Select } from "@/components/agents/select";
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

type Option = { value: string; label: string };

export function AddKnowledgeButton({
  apiToken,
  departments,
  entities,
  agents,
}: {
  apiToken: string;
  departments: Option[];
  entities: Option[];
  agents: Option[];
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [scope, setScope] = useState("global");
  const [scopeRef, setScopeRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targets: Record<string, Option[]> = {
    department: departments,
    entity: entities,
    agent: agents,
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await agentTeamApi(apiToken).createKnowledge({
        title,
        content,
        scope,
        scope_ref: scope === "global" ? null : scopeRef,
      });
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <GraduationCap className="mr-2 h-4 w-4" /> Train the team
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>Train the team</DialogTitle>
          <DialogDescription>
            Everything you add here goes into the context of every agent it
            applies to, on every mission.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="knowledge-title">Title</Label>
            <Input
              id="knowledge-title"
              placeholder="e.g. Company overview, Brand voice, Tech stack"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="knowledge-content">What the team should know</Label>
            <Textarea
              id="knowledge-content"
              rows={10}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              required
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="knowledge-scope">Who needs it</Label>
              <Select
                id="knowledge-scope"
                value={scope}
                onChange={(event) => {
                  setScope(event.target.value);
                  setScopeRef("");
                }}
              >
                <option value="global">Every agent</option>
                <option value="department">One department</option>
                <option value="entity">Missions for one entity</option>
                <option value="agent">One agent</option>
              </Select>
            </div>
            {scope !== "global" && (
              <div className="space-y-2">
                <Label htmlFor="knowledge-ref">Which one</Label>
                <Select
                  id="knowledge-ref"
                  value={scopeRef}
                  onChange={(event) => setScopeRef(event.target.value)}
                  required
                >
                  <option value="" disabled>
                    Choose...
                  </option>
                  {targets[scope].map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </div>
            )}
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy}>
            Save to knowledge base
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteKnowledgeButton({
  apiToken,
  id,
}: {
  apiToken: string;
  id: number;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Delete entry"
      disabled={busy}
      onClick={async () => {
        if (!window.confirm("Remove this entry from the team's knowledge?")) return;
        setBusy(true);
        try {
          await agentTeamApi(apiToken).deleteKnowledge(id);
          window.location.reload();
        } catch (err) {
          window.alert(err instanceof Error ? err.message : String(err));
          setBusy(false);
        }
      }}
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}
