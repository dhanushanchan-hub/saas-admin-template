import { Check, Copy, Download } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

// Copy or download a mission's build pack, to hand it to Claude Code.
export function BuildPackActions({
  pack,
  fileName,
}: {
  pack: string;
  fileName: string;
}) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const copy = async () => {
    setError(null);
    try {
      await navigator.clipboard.writeText(pack);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("This browser blocked copying. Download the build pack instead.");
    }
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([pack], { type: "text/markdown" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={copy}>
          {copied ? <Check /> : <Copy />}
          {copied ? "Copied" : "Copy build pack"}
        </Button>
        <Button type="button" variant="outline" onClick={download}>
          <Download /> Download .md
        </Button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
