"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { authClient } from "@/modules/auth/auth-client";

export function SignInForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "")
      .trim()
      .toLowerCase();
    const password = String(data.get("password") ?? "");

    const result = await authClient.signIn.email({ email, password });
    setPending(false);

    if (result.error) {
      setError("Invalid email or password.");
      return;
    }

    router.replace("/auth/redirect");
    router.refresh();
  }

  return (
    <form className="mt-8 space-y-5" onSubmit={onSubmit}>
      <div>
        <label className="block text-sm font-medium" htmlFor="email">
          Email
        </label>
        <input
          autoComplete="email"
          className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2"
          id="email"
          name="email"
          required
          type="email"
        />
      </div>
      <div>
        <label className="block text-sm font-medium" htmlFor="password">
          Password
        </label>
        <input
          autoComplete="current-password"
          className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2"
          id="password"
          minLength={12}
          name="password"
          required
          type="password"
        />
      </div>
      {error ? (
        <p aria-live="polite" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <button
        className="w-full rounded-md bg-slate-900 px-4 py-2 text-white disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
