import Link from "next/link";

import { NavigationLink } from "@/components/navigation-link";
import { SignOutButton } from "@/components/sign-out-button";
import type { Actor } from "@/modules/auth/authorization";
import {
  ROLE_NAVIGATION,
  ROLE_WORKSPACE_LABEL,
} from "@/modules/auth/navigation";

export function AuthenticatedNavigation({ actor }: { actor: Actor }) {
  const links = ROLE_NAVIGATION[actor.role];
  const activeHrefs = links.map((link) => link.href);

  return (
    <header className={`authenticated-header role-${actor.role.toLowerCase()}`}>
      <div className="brand-block">
        <Link className="app-name nav-touch-target" href={links[0].href}>
          Inventory &amp; Orders
        </Link>
        <span className="workspace-label">
          {ROLE_WORKSPACE_LABEL[actor.role]}
        </span>
      </div>
      <nav aria-label={`${actor.role.toLowerCase()} navigation`}>
        {links.map((link) => (
          <NavigationLink
            activeHrefs={activeHrefs}
            href={link.href}
            key={link.href}
          >
            {link.label}
          </NavigationLink>
        ))}
      </nav>
      <div className="identity">
        <span className="identity-name">{actor.name}</span>
        <span className="role-badge">
          {actor.role.charAt(0) + actor.role.slice(1).toLowerCase()}
        </span>
        <SignOutButton />
      </div>
    </header>
  );
}
