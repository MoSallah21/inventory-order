import { redirect } from "next/navigation";

import { getCurrentActor } from "@/modules/auth/authorization";
import { enabledActorHome } from "@/modules/auth/navigation";
import { SignInForm } from "@/app/sign-in/sign-in-form";

export default async function SignInPage() {
  const actor = await getCurrentActor();
  const destination = enabledActorHome(actor);
  if (destination) redirect(destination);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="text-3xl font-semibold">Sign in</h1>
      <p className="mt-2 text-sm text-slate-600">
        Use one of the seeded demo accounts.
      </p>
      <SignInForm />
    </main>
  );
}
