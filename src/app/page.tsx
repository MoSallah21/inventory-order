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
        Authentication, authorization boundaries, and the database foundation
        are in place. Catalog, inventory, checkout, order workflows, and
        dashboards are intentionally not implemented yet.
      </p>
      <Link
        className="mt-8 w-fit rounded-md bg-slate-900 px-5 py-3 text-white"
        href="/sign-in"
      >
        Sign in
      </Link>
    </main>
  );
}
