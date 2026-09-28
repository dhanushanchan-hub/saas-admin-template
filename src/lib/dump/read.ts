// Reads text out of whatever the Founder drops in. Plain-text files are
// decoded directly. Documents and images go through Workers AI's Markdown
// conversion and voice notes through Whisper, both on Cloudflare's GPUs.

export type DumpKind =
  | "note"
  | "text"
  | "document"
  | "image"
  | "audio"
  | "video"
  | "other";

export type Reading =
  | { status: "ready"; text: string; detail: string | null }
  | { status: "stored" | "failed"; text: null; detail: string };

// Larger files are stored but not read, to stay inside Worker memory.
export const MAX_READ_BYTES = 25 * 1024 * 1024;
export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
export const MAX_TEXT_CHARS = 2_000_000;

const TEXT = new Set([
  "txt", "md", "markdown", "csv", "tsv", "json", "jsonl", "ndjson", "log",
  "yaml", "yml", "ini", "toml", "sql", "srt", "vtt",
]);
const DOCUMENT = new Set([
  "pdf", "doc", "docx", "xls", "xlsx", "xlsm", "xlsb", "ods", "odt", "numbers",
  "html", "htm", "xml",
]);
const IMAGE = new Set(["jpg", "jpeg", "png", "webp", "gif", "bmp", "svg", "heic"]);
const AUDIO = new Set(["mp3", "m4a", "wav", "ogg", "oga", "opus", "aac", "flac", "amr", "weba"]);
const VIDEO = new Set(["mp4", "mov", "m4v", "avi", "mkv", "webm", "3gp"]);

const megabytes = (bytes: number) => `${Math.round(bytes / (1024 * 1024))} MB`;

const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export const classify = (name: string, mimeType: string): DumpKind => {
  const extension = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  if (mimeType.startsWith("audio/") || AUDIO.has(extension)) return "audio";
  if (VIDEO.has(extension) || mimeType.startsWith("video/")) return "video";
  if (TEXT.has(extension)) return "text";
  if (DOCUMENT.has(extension)) return "document";
  if (IMAGE.has(extension) || mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("text/")) return "text";
  return "other";
};

const toBase64 = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
};

export const finishReading = (raw: string): Reading => {
  const text = raw.trim();
  if (!text) return { status: "stored", text: null, detail: "No readable text found." };
  if (text.length <= MAX_TEXT_CHARS) return { status: "ready", text, detail: null };
  return {
    status: "ready",
    text: text.slice(0, MAX_TEXT_CHARS),
    detail: `Only the first ${MAX_TEXT_CHARS.toLocaleString("en-US")} characters are searchable.`,
  };
};

export async function readFile(
  ai: Ai | undefined,
  file: { name: string; kind: DumpKind; size: number; load: () => Promise<ArrayBuffer> },
): Promise<Reading> {
  if (file.kind === "video") {
    return { status: "stored", text: null, detail: "Videos are stored. Reading video isn't supported yet." };
  }
  if (file.size > MAX_READ_BYTES) {
    return {
      status: "stored",
      text: null,
      detail: `Files over ${megabytes(MAX_READ_BYTES)} are stored but not read.`,
    };
  }
  if (file.kind === "text") {
    return finishReading(new TextDecoder().decode(await file.load()));
  }
  if (!ai) {
    return {
      status: "stored",
      text: null,
      detail: "Workers AI isn't connected, so only plain-text files can be read.",
    };
  }

  try {
    if (file.kind === "audio") {
      if (file.size > MAX_AUDIO_BYTES) {
        return {
          status: "stored",
          text: null,
          detail: `Voice notes over ${megabytes(MAX_AUDIO_BYTES)} are stored but not transcribed.`,
        };
      }
      const result = await ai.run("@cf/openai/whisper-large-v3-turbo", {
        audio: toBase64(await file.load()),
      });
      return finishReading(result.text ?? "");
    }

    const result = await ai.toMarkdown({
      name: file.name,
      blob: new Blob([await file.load()]),
    });
    if (result.format === "error") {
      return { status: "stored", text: null, detail: `Can't read this format yet: ${result.error}` };
    }
    return finishReading(result.data);
  } catch (error) {
    return { status: "failed", text: null, detail: `Reading failed: ${message(error)}` };
  }
}
