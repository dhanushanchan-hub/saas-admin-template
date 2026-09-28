import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function MissingModelKeyCard() {
  return (
    <Card className="border-amber-500">
      <CardHeader>
        <CardTitle>Connect the agent team to Claude</CardTitle>
        <CardDescription>
          The agents can't work until an Anthropic API key is configured.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        <p>
          For local development, add <code>ANTHROPIC_API_KEY</code> to{" "}
          <code>.dev.vars</code>. In production, run{" "}
          <code>npx wrangler secret put ANTHROPIC_API_KEY</code>.
        </p>
      </CardContent>
    </Card>
  );
}
