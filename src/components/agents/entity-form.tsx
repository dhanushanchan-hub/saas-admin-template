import { Building2 } from "lucide-react";
import { useState } from "react";

import { Select } from "@/components/agents/select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { agentTeamApi } from "@/lib/agents/client";

export function AddEntityButton({
  apiToken,
  parents,
}: {
  apiToken: string;
  parents: { id: string; name: string; depth: number }[];
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("subholding");
  const [parentId, setParentId] = useState(parents[0]?.id ?? "");
  const [category, setCategory] = useState("");
  const [region, setRegion] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await agentTeamApi(apiToken).createEntity({
        name,
        kind,
        parent_id: parentId || null,
        category: category || undefined,
        region: region || undefined,
        jurisdiction: jurisdiction || undefined,
        description: description || undefined,
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
          <Building2 className="mr-2 h-4 w-4" /> Add entity
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Add entity</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="entity-name">Name</Label>
            <Input
              id="entity-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              minLength={2}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="entity-parent">Parent</Label>
              <Select
                id="entity-parent"
                value={parentId}
                onChange={(event) => setParentId(event.target.value)}
              >
                <option value="">None (top level)</option>
                {parents.map((parent) => (
                  <option key={parent.id} value={parent.id}>
                    {"\u00a0\u00a0".repeat(parent.depth)}
                    {parent.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="entity-kind">Type</Label>
              <Select
                id="entity-kind"
                value={kind}
                onChange={(event) => setKind(event.target.value)}
              >
                <option value="holding">Holding company</option>
                <option value="subholding">Category holding company</option>
                <option value="subsidiary">Operating company</option>
                <option value="brand">Brand</option>
                <option value="venture">Venture</option>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="entity-category">Category</Label>
              <Input
                id="entity-category"
                placeholder="e.g. Retail, Fintech, Services"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="entity-region">Region</Label>
              <Input
                id="entity-region"
                placeholder="e.g. Pan-India, Global"
                value={region}
                onChange={(event) => setRegion(event.target.value)}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="entity-jurisdiction">Jurisdiction</Label>
              <Input
                id="entity-jurisdiction"
                placeholder="e.g. Delaware, USA"
                value={jurisdiction}
                onChange={(event) => setJurisdiction(event.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="entity-description">What it does</Label>
            <Textarea
              id="entity-description"
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy}>
            Add entity
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
