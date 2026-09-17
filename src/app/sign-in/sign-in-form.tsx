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
    <form onSubmit={onSubmit}>
      <div>
        <label htmlFor="email">Email</label>
        <input
          autoComplete="email"
          id="email"
          name="email"
          required
          type="email"
        />
      </div>
      <div>
        <label htmlFor="password">Password</label>
        <input
          autoComplete="current-password"
          id="password"
          minLength={12}
          name="password"
          required
          type="password"
        />
      </div>
      {error ? (
        <p aria-live="polite" className="notice error" role="alert">
          {error}
        </p>
      ) : null}
      <button disabled={pending} type="submit">
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
