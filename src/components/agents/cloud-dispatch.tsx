import { ExternalLink, RefreshCw, Send } from "lucide-react";
import { useState } from "react";

import { Select } from "@/components/agents/select";
import { StatusBadge } from "@/components/agents/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { agentTeamApi } from "@/lib/agents/client";
import type { CloudRun } from "@/lib/agents/types";

type PlatformMeta = {
  id: string;
  label: string;
  apiDriven: boolean;
};

const TERMINAL = new Set(["completed", "failed", "stopped"]);

const formatWhen = (value: string) =>
  new Date(value.replace(" ", "T") + "Z").toLocaleString();

function RunRow({
  run,
  apiToken,
}: {
  run: CloudRun;
  apiToken: string;
}) {
  const [current, setCurrent] = useState(run);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const { run: updated } = await agentTeamApi(apiToken).getCloudRun(current.id);
      if (updated) setCurrent(updated);
    } catch {
      // Leave the row as-is; the Founder can try again.
    } finally {
      setRefreshing(false);
    }
  };

  const canRefresh = current.platform === "manus" && !!current.external_id;

  return (
    <div className="flex flex-col gap-1 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{current.title}</span>
        <StatusBadge status={current.status} />
      </div>
      <p className="text-xs text-muted-foreground">
        {current.platform}
        {current.profile ? ` · ${current.profile}` : ""} · {formatWhen(current.created_at)}
      </p>
      {current.detail && (
        <p className="text-xs text-muted-foreground">{current.detail}</p>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-3">
        {current.external_url && (
          <a
            className="inline-flex items-center gap-1 text-xs font-medium underline"
            href={current.external_url}
            target="_blank"
            rel="noreferrer"
          >
            Open on {current.platform === "manus" ? "Manus" : current.platform}
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
        {canRefresh && !TERMINAL.has(current.status) && (
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Checking…" : "Check status"}
          </button>
        )}
      </div>
    </div>
  );
}

export function CloudDispatch({
  apiToken,
  platforms,
  manusProfiles,
  manusConfigured,
  runs,
}: {
  apiToken: string;
  platforms: PlatformMeta[];
  manusProfiles: string[];
  manusConfigured: boolean;
  runs: CloudRun[];
}) {
  const [platform, setPlatform] = useState(
    manusConfigured ? "manus" : platforms[0]?.id ?? "manus",
  );
  const [prompt, setPrompt] = useState("");
  const [title, setTitle] = useState("");
  const [profile, setProfile] = useState(manusProfiles[0] ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<CloudRun[]>(runs);

  const selected = platforms.find((entry) => entry.id === platform);
  const manusSelected = platform === "manus";
  const disabledManus = manusSelected && !manusConfigured;

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { run } = await agentTeamApi(apiToken).dispatchCloudRun({
        platform,
        prompt,
        title: title || undefined,
        profile: manusSelected ? profile || undefined : undefined,
        origin: "founder",
      });
      setRecent((current) => [run, ...current].slice(0, 25));
      setPrompt("");
      setTitle("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="platform">Platform</Label>
            <Select
              id="platform"
              value={platform}
              onChange={(event) => setPlatform(event.target.value)}
            >
              {platforms.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                  {entry.apiDriven ? "" : " (handoff)"}
                </option>
              ))}
            </Select>
          </div>
          {manusSelected && manusProfiles.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="profile">Manus profile</Label>
              <Select
                id="profile"
                value={profile}
                onChange={(event) => setProfile(event.target.value)}
              >
                {manusProfiles.map((entry) => (
                  <option key={entry} value={entry}>
                    {entry}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="prompt">The task</Label>
          <Textarea
            id="prompt"
            rows={5}
            placeholder={
              manusSelected
                ? "Describe the task for Manus. It runs in Manus's cloud and reports back here."
                : `Describe the task. It's logged as a handoff to ${selected?.label ?? "the platform"}, which you run on its own surface.`
            }
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            required
            minLength={3}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="title">Title (optional)</Label>
          <Input
            id="title"
            placeholder="A short name for this run"
            value={title}
            maxLength={120}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>

        {disabledManus && (
          <p className="text-sm text-amber-600">
            Manus isn't connected yet. Set the <code>MANUS_API_KEY</code> secret to
            send tasks to Manus. You can still hand tasks to the other platforms.
          </p>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}

        <Button
          type="submit"
          disabled={submitting || disabledManus || prompt.trim().length < 3}
        >
          <Send className="mr-2 h-4 w-4" />
          {submitting
            ? "Sending…"
            : manusSelected
              ? "Send to Manus"
              : `Log handoff to ${selected?.label ?? "platform"}`}
        </Button>
      </form>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Recent runs</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No cloud runs yet. Send a task above to get started.
          </p>
        ) : (
          <div className="grid gap-3">
            {recent.map((run) => (
              <RunRow key={run.id} run={run} apiToken={apiToken} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
