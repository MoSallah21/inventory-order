import Link from "next/link";

import { SignOutButton } from "@/components/sign-out-button";
import type { Actor } from "@/modules/auth/authorization";
import { ROLE_NAVIGATION } from "@/modules/auth/navigation";

export function AuthenticatedNavigation({ actor }: { actor: Actor }) {
  return (
    <header className="authenticated-header">
      <div className="identity">
        <strong>{actor.name}</strong>
        <span className="badge">{actor.role.toLowerCase()}</span>
      </div>
      <nav aria-label={`${actor.role.toLowerCase()} navigation`}>
        {ROLE_NAVIGATION[actor.role].map((link) => (
          <Link href={link.href} key={link.href}>
            {link.label}
          </Link>
        ))}
      </nav>
      <SignOutButton />
    </header>
  );
}
