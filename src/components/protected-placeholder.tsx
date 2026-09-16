import Link from "next/link";

import type { Actor } from "@/modules/auth/authorization";

export function ProtectedPlaceholder({
  actor,
  title,
}: {
  actor: Actor;
  title: string;
}) {
  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-20">
      <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
        Foundation placeholder
      </p>
      <h1 className="mt-3 text-4xl font-semibold">{title}</h1>
      <p className="mt-6 text-slate-700">
        Signed in as {actor.name} ({actor.email}). This route is protected on
        the server for the {actor.role} role.
      </p>
      <p className="mt-4 text-slate-600">
        Domain UI is intentionally deferred to the next phase.
      </p>
      <Link className="mt-8 inline-block underline" href="/">
        Return home
      </Link>
    </main>
  );
}
