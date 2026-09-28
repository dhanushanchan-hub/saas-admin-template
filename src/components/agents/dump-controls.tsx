import { NotebookPen, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";

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
import { cn } from "@/lib/utils";

// Cloudflare accepts request bodies up to 100 MB on Free and Pro plans.
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

type Upload = {
  name: string;
  state: "waiting" | "uploading" | "ready" | "stored" | "failed" | "error";
  detail?: string | null;
};

const stateLabel: Record<Upload["state"], string> = {
  waiting: "Waiting",
  uploading: "Reading…",
  ready: "Read and searchable",
  stored: "Stored",
  failed: "Stored, reading failed",
  error: "Not uploaded",
};

export function DumpUploader({ apiToken }: { apiToken: string }) {
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [dragging, setDragging] = useState(false);
  const queue = useRef(Promise.resolve());
  const count = useRef(0);
  const input = useRef<HTMLInputElement>(null);

  const update = (index: number, change: Partial<Upload>) =>
    setUploads((current) =>
      current.map((upload, i) => (i === index ? { ...upload, ...change } : upload)),
    );

  // Files upload one at a time, in the order they were dropped.
  const add = (files: File[]) => {
    const start = count.current;
    count.current += files.length;
    setUploads((current) => [
      ...current,
      ...files.map((file) => ({ name: file.name, state: "waiting" as const })),
    ]);
    files.forEach((file, offset) => {
      const index = start + offset;
      queue.current = queue.current.then(async () => {
        if (file.size > MAX_UPLOAD_BYTES) {
          update(index, { state: "error", detail: "Over the 100 MB upload limit." });
          return;
        }
        update(index, { state: "uploading" });
        try {
          const { file: saved } = await agentTeamApi(apiToken).uploadDumpFile(file);
          update(index, { state: saved.status, detail: saved.detail });
        } catch (err) {
          update(index, {
            state: "error",
            detail: err instanceof Error ? err.message : String(err),
          });
        }
      });
    });
  };

  const busy = uploads.some(
    (upload) => upload.state === "waiting" || upload.state === "uploading",
  );
  const done = uploads.filter(
    (upload) => upload.state !== "waiting" && upload.state !== "uploading",
  ).length;

  return (
    <div className="space-y-3">
      <div
        role="button"
        tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") input.current?.click();
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          add(Array.from(event.dataTransfer.files));
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-10 text-center transition-colors",
          dragging ? "border-primary bg-muted" : "border-muted-foreground/30 hover:bg-muted/50",
        )}
      >
        <Upload className="h-8 w-8 text-muted-foreground" />
        <p className="font-medium">Drop files here, or tap to choose</p>
        <p className="text-sm text-muted-foreground">
          Any number at once, up to 100 MB each: PDFs, Word, Excel, screenshots,
          photos, voice notes, chat exports, anything.
        </p>
        <input
          ref={input}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => {
            add(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
        />
      </div>

      {uploads.length > 0 && (
        <div className="space-y-2 rounded-lg border p-4">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm font-medium">
              {done} of {uploads.length} done
            </p>
            {!busy && (
              <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
                Refresh the list
              </Button>
            )}
          </div>
          <ul className="max-h-72 space-y-1 overflow-y-auto text-sm">
            {uploads.map((upload, index) => (
              <li key={index} className="flex flex-wrap justify-between gap-x-4">
                <span className="truncate">{upload.name}</span>
                <span
                  className={cn(
                    "text-muted-foreground",
                    upload.state === "ready" && "text-green-600",
                    (upload.state === "failed" || upload.state === "error") && "text-red-600",
                  )}
                  title={upload.detail ?? undefined}
                >
                  {stateLabel[upload.state]}
                  {upload.detail ? `: ${upload.detail}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function PasteNoteButton({ apiToken }: { apiToken: string }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await agentTeamApi(apiToken).createDumpNote({
        title: title.trim() || undefined,
        content,
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
          <NotebookPen className="mr-2 h-4 w-4" /> Paste text
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>Paste text into the dump</DialogTitle>
          <DialogDescription>
            Ideas, plans, notes, a whole chat transcript. Paste as much as you
            like; Hermes and the team can search all of it.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="dump-title">Title (optional)</Label>
            <Input
              id="dump-title"
              placeholder="e.g. Launch ideas, 28 Sep"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dump-content">Text</Label>
            <Textarea
              id="dump-content"
              rows={14}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              required
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Saving…" : "Save to the dump"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteDumpFileButton({ apiToken, id }: { apiToken: string; id: number }) {
  const [busy, setBusy] = useState(false);

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Delete file"
      disabled={busy}
      onClick={async () => {
        if (!window.confirm("Delete this file and its text from the dump?")) return;
        setBusy(true);
        try {
          await agentTeamApi(apiToken).deleteDumpFile(id);
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
