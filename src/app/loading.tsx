export default function AppLoading() {
  return (
    <main className="page-shell" aria-busy="true" aria-live="polite">
      <p className="eyebrow">Inventory &amp; Orders</p>
      <h1>Loading…</h1>
      <p className="lede">Preparing the latest information.</p>
      <div className="panel skeleton-panel" />
    </main>
  );
}
