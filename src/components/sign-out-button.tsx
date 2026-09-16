"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { authClient } from "@/modules/auth/auth-client";

type SignOutResult = { error?: unknown };

export function createSignOutRunner({
  signOut,
  onSuccess,
  onFailure,
}: {
  signOut: () => Promise<SignOutResult>;
  onSuccess: () => void;
  onFailure: () => void;
}) {
  let running = false;

  return async () => {
    if (running) return false;
    running = true;
    try {
      const result = await signOut();
      if (result.error) {
        onFailure();
        return false;
      }
      onSuccess();
      return true;
    } catch {
      onFailure();
      return false;
    } finally {
      running = false;
    }
  };
}

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const runner = useRef<ReturnType<typeof createSignOutRunner> | null>(null);

  runner.current ??= createSignOutRunner({
    signOut: () => authClient.signOut(),
    onSuccess: () => {
      router.replace("/sign-in");
      router.refresh();
    },
    onFailure: () => {
      setError("Could not sign out. Please try again.");
      setPending(false);
    },
  });

  async function handleSignOut() {
    if (pending) return;
    setError(null);
    setPending(true);
    const succeeded = await runner.current?.();
    if (!succeeded) setPending(false);
  }

  return (
    <div className="sign-out-control">
      <button disabled={pending} onClick={handleSignOut} type="button">
        {pending ? "Signing out…" : "Sign out"}
      </button>
      {error ? (
        <span aria-live="polite" className="sign-out-error" role="status">
          {error}
        </span>
      ) : null}
    </div>
  );
}
