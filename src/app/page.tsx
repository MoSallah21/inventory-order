import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6">
      <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
        Foundation phase
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">
        Inventory &amp; Order Management System
      </h1>
      <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
        Browse the public catalog or sign in to manage role-specific inventory.
      </p>
      <div className="mt-8 flex gap-3">
        <Link
          className="rounded-md bg-slate-900 px-5 py-3 text-white"
          href="/products"
        >
          Browse products
        </Link>
        <Link
          className="rounded-md border border-slate-300 px-5 py-3"
          href="/sign-in"
        >
          Sign in
        </Link>
      </div>
    </main>
  );
}
