import { redirect } from "next/navigation";
import Link from "next/link";

import { getCurrentActor } from "@/modules/auth/authorization";
import { enabledActorHome } from "@/modules/auth/navigation";
import { SignInForm } from "@/app/sign-in/sign-in-form";

export default async function SignInPage() {
  const actor = await getCurrentActor();
  const destination = enabledActorHome(actor);
  if (destination) redirect(destination);

  return (
    <main className="auth-shell">
      <section className="auth-intro" aria-labelledby="auth-intro-heading">
        <Link className="app-name" href="/">
          Inventory &amp; Orders
        </Link>
        <div>
          <p className="eyebrow">Secure workspace access</p>
          <p className="auth-intro-title" id="auth-intro-heading">
            Keep inventory moving.
          </p>
          <p>
            One operational workspace for catalog control, fulfillment, and
            dependable order tracking.
          </p>
        </div>
      </section>
      <section className="auth-panel">
        <p className="eyebrow">Welcome back</p>
        <h1>Sign in</h1>
        <p className="lede">Use one of the provided demo accounts.</p>
        <SignInForm />
      </section>
    </main>
  );
}
