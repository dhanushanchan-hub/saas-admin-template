import type { Agent } from "./types";

// The Build Studio: the agents who build the group's websites, apps and
// software (migrations/0008_add_build_studio.sql).
export const STUDIO_DEPARTMENT = "Build Studio";

// Build requests from /admin/studio start with this, so they're listed as
// builds before Hermes has assigned anyone.
export const BUILD_REQUEST_PREFIX = "Build Studio request:";

export const BUILD_KINDS = [
  {
    value: "website",
    label: "Website",
    hint: "Brand site, landing page, content site or online store",
    example:
      "A brand website with our story, the product range, a distributor enquiry form and a store locator, in English and Hindi.",
  },
  {
    value: "web-app",
    label: "Web app",
    hint: "A product people sign in to and use in the browser",
    example:
      "The Master ID web app: one account per user, phone OTP sign-in, and a profile that links every TIVA service they use.",
  },
  {
    value: "mobile-app",
    label: "Mobile app",
    hint: "Android and iOS, or an installable web app first",
    example:
      "The TIVA app for Android and iOS: sign in with Master ID, see your profile and services, and find verified businesses near you on a map.",
  },
  {
    value: "software",
    label: "Software or API",
    hint: "Backend, admin tool, integration or internal system",
    example:
      "An API that settles partner payouts daily and posts them to ERPNext, with an admin screen to review exceptions.",
  },
  {
    value: "automation",
    label: "Automation",
    hint: "A workflow that runs by itself, such as n8n",
    example:
      "An n8n workflow that sends every new website enquiry to WhatsApp and adds it to our customer list.",
  },
] as const;

export type BuildKind = (typeof BUILD_KINDS)[number]["value"];

export const isStudioAgent = (agent: Pick<Agent, "department">) =>
  agent.department === STUDIO_DEPARTMENT;

// The directive for a build request. It names the studio's current team so
// Hermes routes the work to them.
export const buildDirective = ({
  kind,
  brief,
  entityName,
  team,
}: {
  kind: BuildKind;
  brief: string;
  entityName: string | null;
  team: Pick<Agent, "name" | "title">[];
}) => {
  const label = BUILD_KINDS.find((option) => option.value === kind)?.label ?? "Build";
  const members = team.map((agent) => `${agent.name}, ${agent.title}`).join("; ");
  return `${BUILD_REQUEST_PREFIX} build a ${label.toLowerCase()} for ${entityName ?? "the group"}.

What the Founder wants:
${brief.trim()}

Route this to the Build Studio${members ? ` (${members})` : ""}, and bring in other executives only where the build needs them. Scope the first version, design it, write the code and the tests, and deliver a complete build pack that Claude Code can execute end to end, to the Build Studio's standard. Nothing is deployed, published or submitted to an app store without the Founder's approval.`;
};
