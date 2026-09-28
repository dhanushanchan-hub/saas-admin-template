import { cn } from "@/lib/utils";

const groups = [
  [
    { href: "/admin/hermes", label: "Hermes" },
    { href: "/admin/command", label: "Command Center" },
    { href: "/admin/missions", label: "Missions" },
    { href: "/admin/agents", label: "Agents" },
    { href: "/admin/knowledge", label: "Knowledge" },
    { href: "/admin/routines", label: "Routines" },
    { href: "/admin/entities", label: "Group Structure" },
  ],
  [
    { href: "/admin", label: "Admin" },
    { href: "/admin/customers", label: "Customers" },
    { href: "/admin/subscriptions", label: "Subscriptions" },
  ],
];

const isCurrent = (currentPath: string, href: string) =>
  currentPath === href ||
  (href !== "/admin" && currentPath.startsWith(`${href}/`));

export function Header({
  currentPath,
  brand = "SaaS Admin Template",
}: {
  currentPath: string;
  brand?: string;
}) {
  return (
    <nav className="mx-6 flex min-h-16 flex-wrap items-center gap-x-6 gap-y-2 py-4">
      <a href="/" className="text-sm font-bold leading-none text-foreground">
        {brand}
      </a>
      {groups.map((links, index) => (
        <div
          key={index}
          className={cn(
            "flex flex-wrap items-center gap-x-4 gap-y-2",
            index > 0 && "sm:border-l sm:pl-6",
          )}
        >
          {links.map((link) => (
            <a
              key={link.href}
              className={cn(
                "text-sm font-medium leading-none",
                isCurrent(currentPath, link.href)
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              href={link.href}
              aria-current={isCurrent(currentPath, link.href) ? "page" : undefined}
            >
              {link.label}
            </a>
          ))}
        </div>
      ))}
      <form method="post" action="/api/auth/logout" className="ml-auto">
        <button
          type="submit"
          className="text-sm font-medium leading-none text-muted-foreground hover:text-foreground"
        >
          Sign out
        </button>
      </form>
    </nav>
  );
}
