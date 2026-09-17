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
      <p className="eyebrow">Inventory &amp; order management</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">
        Inventory &amp; Order Management System
      </h1>
      <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
        {workspace
          ? "Browse the public catalog or return to your role-specific workspace."
          : "Browse the public catalog or sign in to manage role-specific inventory."}
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
    </main>
  );
}
