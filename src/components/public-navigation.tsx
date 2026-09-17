import { NavigationLink } from "@/components/navigation-link";
import { getCurrentActor, type Actor } from "@/modules/auth/authorization";
import {
  enabledActorHome,
  PUBLIC_WORKSPACE_LABEL,
} from "@/modules/auth/navigation";

export async function PublicNavigation({
  actor: providedActor,
}: { actor?: Actor | null } = {}) {
  const actor =
    providedActor === undefined ? await getCurrentActor() : providedActor;
  const workspace = enabledActorHome(actor);
  const links = [
    { href: "/", label: "Inventory & Orders", className: "app-name" },
    { href: "/products", label: "Products" },
    ...(actor?.role === "CUSTOMER" && !actor.disabledAt
      ? [{ href: "/cart", label: "Cart" }]
      : []),
    ...(workspace && actor
      ? [
          {
            href: workspace,
            label: `Back to ${PUBLIC_WORKSPACE_LABEL[actor.role]}`,
            className: "button-link secondary",
          },
        ]
      : [
          {
            href: "/sign-in",
            label: "Sign in",
            className: "button-link secondary",
          },
        ]),
  ];
  const activeHrefs = links.map((link) => link.href);

  return (
    <nav className="public-header" aria-label="Public navigation">
      <NavigationLink
        activeHrefs={activeHrefs}
        className={links[0].className}
        href={links[0].href}
      >
        {links[0].label}
      </NavigationLink>
      <div className="action-row">
        {links.slice(1).map((link) => (
          <NavigationLink
            activeHrefs={activeHrefs}
            className={link.className}
            href={link.href}
            key={link.href}
          >
            {link.label}
          </NavigationLink>
        ))}
      </div>
    </nav>
  );
}
