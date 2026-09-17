import Link from "next/link";
import { PublicNavigation } from "@/components/public-navigation";
import { getCurrentActor } from "@/modules/auth/authorization";
import { enabledActorHome } from "@/modules/auth/navigation";

export default async function Home() {
  const actor = await getCurrentActor();
  const workspace = enabledActorHome(actor);
  const navigation = await PublicNavigation({ actor });

  return (
    <main className="page-shell narrow">
      {navigation}
      <section className="hero-panel">
        <div className="gateway-copy">
          <p className="eyebrow">Inventory operations platform</p>
          <h1>Stock clarity from shelf to delivery.</h1>
          <p className="lede">
            {workspace
              ? "Browse the live catalog or return to your role-specific operations workspace."
              : "Browse products or sign in to a focused workspace for inventory control, purchasing, and dependable fulfillment."}
          </p>
          <div className="action-row">
            <Link className="button-link" href="/products">
              Browse products
            </Link>
            {!workspace ? (
              <Link className="button-link secondary" href="/sign-in">
                Sign in to workspace
              </Link>
            ) : (
              <Link className="button-link secondary" href={workspace}>
                Back to workspace
              </Link>
            )}
          </div>
        </div>
        <aside className="gateway-manifest" aria-label="Platform capabilities">
          <p>Operational coverage</p>
          <ol>
            <li>
              <span>01</span> Active catalog visibility
            </li>
            <li>
              <span>02</span> Role-based inventory control
            </li>
            <li>
              <span>03</span> Order lifecycle tracking
            </li>
          </ol>
        </aside>
      </section>
      <section className="gateway-strip" aria-label="Workspace principles">
        <div>
          <strong>One source of truth</strong>
          <span>Current inventory and immutable order records.</span>
        </div>
        <div>
          <strong>Role-specific control</strong>
          <span>Purpose-built views for each operation.</span>
        </div>
        <div>
          <strong>Clear handoffs</strong>
          <span>Visible status from purchase to delivery.</span>
        </div>
      </section>
    </main>
  );
}
