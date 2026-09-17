import Link from "next/link";

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
  return (
    <nav className="public-header" aria-label="Public navigation">
      <Link className="app-name" href="/">
        Inventory &amp; Orders
      </Link>
      <div className="action-row">
        <Link href="/products">Products</Link>
        {actor?.role === "CUSTOMER" && !actor.disabledAt ? (
          <Link href="/cart">Cart</Link>
        ) : null}
        {workspace && actor ? (
          <Link className="button-link secondary" href={workspace}>
            Back to {PUBLIC_WORKSPACE_LABEL[actor.role]}
          </Link>
        ) : (
          <Link className="button-link secondary" href="/sign-in">
            Sign in
          </Link>
        )}
      </div>
    </nav>
  );
}
