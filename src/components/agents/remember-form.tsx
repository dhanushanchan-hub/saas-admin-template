import { Brain } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { agentTeamApi } from "@/lib/agents/client";

// Quick capture into the team's memory: anything the Founder tells Hermes here
// becomes a knowledge entry that every agent sees on every mission.
export function RememberForm({ apiToken }: { apiToken: string }) {
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    const text = content.trim();
    const firstLine = text.split("\n")[0];
    try {
      await agentTeamApi(apiToken).createKnowledge({
        title: firstLine.length > 80 ? `${firstLine.slice(0, 77)}...` : firstLine,
        content: text,
        scope: "global",
      });
      setContent("");
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Textarea
        rows={4}
        placeholder="A goal, a preference, a fact about a company, a person to know... The first line becomes the title."
        value={content}
        onChange={(event) => {
          setContent(event.target.value);
          setSaved(false);
        }}
        required
        minLength={2}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="outline" disabled={busy || content.trim().length < 2}>
          <Brain className="mr-2 h-4 w-4" /> Remember this
        </Button>
        {saved && (
          <span className="text-sm text-muted-foreground">
            Saved. Every agent will know this from the next mission.{" "}
            <a className="underline" href="/admin/knowledge">
              View memory
            </a>
          </span>
        )}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </form>
  );
}
