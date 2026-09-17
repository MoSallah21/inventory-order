import Link from "next/link";

import { NavigationLink } from "@/components/navigation-link";
import { SignOutButton } from "@/components/sign-out-button";
import type { Actor } from "@/modules/auth/authorization";
import {
  ROLE_NAVIGATION,
  ROLE_WORKSPACE_LABEL,
} from "@/modules/auth/navigation";
import { AppIcon, type IconName } from "@/components/app-icon";

const iconByHref: Record<string, IconName> = {
  "/admin": "dashboard",
  "/admin/categories": "categories",
  "/supplier": "dashboard",
  "/supplier/products": "products",
  "/account": "account",
  "/products": "products",
  "/cart": "cart",
  "/orders": "orders",
};

export function AuthenticatedNavigation({ actor }: { actor: Actor }) {
  const links = ROLE_NAVIGATION[actor.role];
  const activeHrefs = links.map((link) => link.href);

  const navigation = (announceCurrent = true) =>
    links.map((link) => (
      <NavigationLink
        activeHrefs={activeHrefs}
        announceCurrent={announceCurrent}
        href={link.href}
        key={link.href}
      >
        <AppIcon name={iconByHref[link.href]} />
        <span>{link.label}</span>
      </NavigationLink>
    ));
  return (
    <>
      <a className="skip-link nav-touch-target" href="#workspace-content">
        Skip to content
      </a>
      <aside className={`workspace-sidebar role-${actor.role.toLowerCase()}`}>
        <div className="brand-block">
          <Link className="app-name nav-touch-target" href={links[0].href}>
            Inventory &amp; Orders
          </Link>
          <span className="workspace-label">
            {ROLE_WORKSPACE_LABEL[actor.role]}
          </span>
        </div>
        <nav aria-label={`${actor.role.toLowerCase()} navigation`}>
          {navigation()}
        </nav>
        <div className="sidebar-identity">
          <div>
            <span className="identity-name">{actor.name}</span>
            <span className="role-badge">
              {actor.role.charAt(0) + actor.role.slice(1).toLowerCase()}
            </span>
          </div>
          <SignOutButton />
        </div>
      </aside>
      <header className="mobile-workspace-header">
        <div className="brand-block">
          <Link className="app-name nav-touch-target" href={links[0].href}>
            Inventory &amp; Orders
          </Link>
          <span className="workspace-label">
            {ROLE_WORKSPACE_LABEL[actor.role]}
          </span>
        </div>
        <details className="mobile-nav">
          <summary aria-label="Open workspace navigation">Menu</summary>
          <nav aria-label={`Mobile ${actor.role.toLowerCase()} navigation`}>
            {navigation(false)}
          </nav>
          <div className="identity">
            <span className="identity-name">{actor.name}</span>
            <span className="role-badge">
              {actor.role.charAt(0) + actor.role.slice(1).toLowerCase()}
            </span>
            <SignOutButton />
          </div>
        </details>
      </header>
    </>
  );
}
