import Link from "next/link";
import { formatMinorUnits } from "@/lib/money";
import { getAdminDashboard } from "@/modules/admin/dashboard";
import { getCurrentActor } from "@/modules/auth/authorization";

export default async function AdminPage() {
  const dashboard = await getAdminDashboard(await getCurrentActor());
  return (
    <main className="page-shell">
      <nav className="top-nav">
        <Link href="/">Inventory</Link>
        <span className="action-row">
          <Link href="/admin/categories">Manage categories</Link>
          <Link href="/orders">Manage orders</Link>
        </span>
      </nav>
      <p className="eyebrow">Admin operations</p>
      <h1>Dashboard</h1>
      <p className="lede">
        Live stock, order activity, and recognized supplier revenue. Reporting
        days use UTC.
      </p>
      <section className="panel dashboard-section">
        <div className="row">
          <div>
            <p className="eyebrow">Inventory attention</p>
            <h2>Low-stock products</h2>
          </div>
          <span className="badge">≤ {dashboard.lowStockThreshold} units</span>
        </div>
        {dashboard.lowStockProducts.length === 0 ? (
          <p className="empty">No active products are low on stock.</p>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Supplier</th>
                  <th>Category</th>
                  <th>Stock</th>
                  <th>Price</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.lowStockProducts.map((product) => (
                  <tr key={product.id}>
                    <td>{product.name}</td>
                    <td>{product.supplier.name}</td>
                    <td>{product.category.name}</td>
                    <td>
                      <strong>{product.stockQuantity}</strong>
                    </td>
                    <td>
                      {formatMinorUnits(
                        BigInt(product.priceMinor),
                        product.currency,
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <div className="dashboard-grid">
        <section className="panel dashboard-section">
          <p className="eyebrow">Last {dashboard.activityDays} days</p>
          <h2>Orders per day</h2>
          <p className="hint">
            Supplier orders are counted separately; cancelled orders are
            excluded.
          </p>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date (UTC)</th>
                  <th>Orders</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.ordersPerDay.map((day) => (
                  <tr key={day.date}>
                    <td>{day.date}</td>
                    <td>
                      <strong>{day.orderCount}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="panel dashboard-section">
          <p className="eyebrow">Delivered orders only</p>
          <h2>Revenue per supplier</h2>
          <p className="hint">
            Currencies are reported independently from immutable order totals.
          </p>
          {dashboard.revenuePerSupplier.length === 0 ? (
            <p className="empty">No delivered-order revenue is available.</p>
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Supplier</th>
                    <th>Currency</th>
                    <th>Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.revenuePerSupplier.map((row) => (
                    <tr key={`${row.supplier.id}:${row.currency}`}>
                      <td>{row.supplier.name}</td>
                      <td>{row.currency}</td>
                      <td>
                        <strong>
                          {formatMinorUnits(
                            BigInt(row.revenueMinor),
                            row.currency,
                          )}
                        </strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
