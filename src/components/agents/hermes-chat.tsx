import { Brain, Mic, MicOff, Rocket, Send, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { agentTeamApi } from "@/lib/agents/client";
import { renderMarkdown } from "@/lib/agents/markdown";

type Message = {
  role: "founder" | "hermes";
  content: string;
  mission_id?: number | null;
  knowledge_id?: number | null;
};

const SPEAK_KEY = "hermes-speak-replies";

const readSetting = (key: string) => {
  try {
    return window.localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
};

const writeSetting = (key: string, value: boolean) => {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Storage can be unavailable (private mode); the toggle still works for this visit.
  }
};

// Plain text for speech: drop Markdown syntax and keep link text.
const toSpeech = (markdown: string) =>
  markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#*_`>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getRecognition = (): any => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  const Recognition = w.SpeechRecognition || w.webkitSpeechRecognition;
  return Recognition ? new Recognition() : null;
};

export function HermesChat({
  apiToken,
  initialMessages,
  disabled,
}: {
  apiToken: string;
  initialMessages: Message[];
  disabled?: boolean;
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [speak, setSpeak] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognition = useRef<any>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setVoiceSupported(Boolean(getRecognition()));
    setSpeak(readSetting(SPEAK_KEY) && "speechSynthesis" in window);
  }, []);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, thinking]);

  const say = (text: string) => {
    if (!speak || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(toSpeech(text)));
  };

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || thinking) return;
    setInput("");
    setError(null);
    setMessages((current) => [...current, { role: "founder", content: message }]);
    setThinking(true);
    try {
      const result = await agentTeamApi(apiToken).chat(message);
      setMessages((current) => [
        ...current,
        {
          role: "hermes",
          content: result.reply,
          mission_id: result.mission?.id ?? null,
          knowledge_id: result.memory?.id ?? null,
        },
      ]);
      say(result.reply);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setThinking(false);
    }
  };

  const toggleListening = () => {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const rec = getRecognition();
    if (!rec) return;
    rec.lang = navigator.language || "en-IN";
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = "";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finalText += result[0].transcript;
        else interim += result[0].transcript;
      }
      setInput((finalText + interim).trim());
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => {
      setListening(false);
      if (finalText.trim()) send(finalText);
    };
    recognition.current = rec;
    window.speechSynthesis?.cancel();
    setListening(true);
    rec.start();
  };

  const toggleSpeak = () => {
    const next = !speak;
    setSpeak(next);
    writeSetting(SPEAK_KEY, next);
    if (!next) window.speechSynthesis?.cancel();
  };

  return (
    <div className="flex h-[calc(100dvh-13rem)] min-h-[420px] flex-col rounded-xl border bg-card shadow">
      <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
        {messages.length === 0 && (
          <div className="mx-auto max-w-md py-10 text-center text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Hermes is listening.</p>
            <p className="mt-2">
              Ask for your brief, put the team to work ("Have the team plan the
              Master ID launch"), or tell Hermes something to remember.
            </p>
          </div>
        )}
        {messages.map((message, index) => (
          <div
            key={index}
            className={message.role === "founder" ? "flex justify-end" : "flex justify-start"}
          >
            <div
              className={
                message.role === "founder"
                  ? "max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-4 py-2 text-sm text-primary-foreground"
                  : "max-w-[85%] rounded-2xl rounded-bl-sm bg-muted px-4 py-3"
              }
            >
              {message.role === "founder" ? (
                message.content
              ) : (
                <>
                  <div
                    className="agent-prose"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
                  />
                  {(message.mission_id || message.knowledge_id) && (
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      {message.mission_id && (
                        <a
                          href={`/admin/missions/${message.mission_id}`}
                          className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-1 hover:bg-muted"
                        >
                          <Rocket className="h-3 w-3" /> Mission #{message.mission_id}
                        </a>
                      )}
                      {message.knowledge_id && (
                        <a
                          href="/admin/knowledge"
                          className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-1 hover:bg-muted"
                        >
                          <Brain className="h-3 w-3" /> Saved to memory
                        </a>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
        {thinking && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm bg-muted px-4 py-3 text-sm text-muted-foreground">
              Hermes is thinking...
            </div>
          </div>
        )}
        <div ref={bottom} />
      </div>

      <form
        className="space-y-2 border-t p-3 sm:p-4"
        onSubmit={(event) => {
          event.preventDefault();
          send(input);
        }}
      >
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex items-end gap-2">
          <Textarea
            rows={2}
            className="min-h-[2.75rem] flex-1 resize-none"
            placeholder={listening ? "Listening..." : "Message Hermes"}
            value={input}
            disabled={disabled}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                send(input);
              }
            }}
          />
          {voiceSupported && (
            <Button
              type="button"
              variant={listening ? "destructive" : "outline"}
              size="icon"
              aria-label={listening ? "Stop listening" : "Speak to Hermes"}
              disabled={disabled || thinking}
              onClick={toggleListening}
            >
              {listening ? <MicOff /> : <Mic />}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={speak ? "Stop reading replies aloud" : "Read replies aloud"}
            aria-pressed={speak}
            onClick={toggleSpeak}
          >
            {speak ? <Volume2 /> : <VolumeX />}
          </Button>
          <Button
            type="submit"
            size="icon"
            aria-label="Send"
            disabled={disabled || thinking || !input.trim()}
          >
            <Send />
          </Button>
        </div>
      </form>
    </div>
  );
}
