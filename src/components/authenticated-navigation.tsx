import Link from "next/link";

import { SignOutButton } from "@/components/sign-out-button";
import type { Actor } from "@/modules/auth/authorization";
import {
  ROLE_NAVIGATION,
  ROLE_WORKSPACE_LABEL,
} from "@/modules/auth/navigation";

export function AuthenticatedNavigation({ actor }: { actor: Actor }) {
  return (
    <header className="authenticated-header">
      <div className="brand-block">
        <Link className="app-name" href={ROLE_NAVIGATION[actor.role][0].href}>
          Inventory &amp; Orders
        </Link>
        <span className="workspace-label">
          {ROLE_WORKSPACE_LABEL[actor.role]}
        </span>
      </div>
      <nav aria-label={`${actor.role.toLowerCase()} navigation`}>
        {ROLE_NAVIGATION[actor.role].map((link) => (
          <Link href={link.href} key={link.href}>
            {link.label}
          </Link>
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
