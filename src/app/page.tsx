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
        <p className="eyebrow">Inventory &amp; order management</p>
        <h1>Clear stock. Dependable orders.</h1>
        <p className="lede">
          {workspace
            ? "Browse the active catalog or return to your role-specific operations workspace."
            : "Explore active inventory or sign in to manage products, fulfillment, or purchases."}
        </p>
        <div className="action-row">
          <Link className="button-link" href="/products">
            Browse products
          </Link>
          {!workspace ? (
            <Link className="button-link secondary" href="/sign-in">
              Sign in
            </Link>
          ) : null}
        </div>
      </section>
    </main>
  );
}
