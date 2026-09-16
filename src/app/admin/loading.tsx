export default function AdminLoading() {
  return (
    <main className="page-shell" aria-busy="true">
      <p className="eyebrow">Admin operations</p>
      <h1>Loading dashboard…</h1>
      <p className="lede">Refreshing inventory and order aggregates.</p>
      <div className="dashboard-grid">
        <div className="panel skeleton-panel" />
        <div className="panel skeleton-panel" />
      </div>
    </main>
  );
}
