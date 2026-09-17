import { AuthenticatedNavigation } from "@/components/authenticated-navigation";
import { Role } from "@/generated/prisma/enums";
import { formatMinorUnits } from "@/lib/money";
import { getAdminDashboard } from "@/modules/admin/dashboard";
import { requireProtectedPage } from "@/modules/auth/page-authorization";
import { PageHeader } from "@/components/page-header";
import { AppIcon } from "@/components/app-icon";

export default async function AdminPage() {
  const actor = await requireProtectedPage(Role.ADMIN);
  const dashboard = await getAdminDashboard(actor);
  return (
    <main className="page-shell workspace-page" id="workspace-content">
      <AuthenticatedNavigation actor={actor} />
      <PageHeader
        eyebrow="Admin operations"
        title="Operations dashboard"
        description="Inventory pressure, order activity, and recognized supplier revenue in one executive view."
        meta={
          <>
            <span className="context-chip">
              <AppIcon name="stock" />
              {dashboard.lowStockProducts.length} stock alerts
            </span>
            <span className="context-chip">Reporting in UTC</span>
          </>
        }
      />
      <section className="attention-strip" aria-label="Dashboard summary">
        <div>
          <AppIcon name="stock" />
          <span>Inventory attention</span>
          <strong>{dashboard.lowStockProducts.length}</strong>
          <small>products at or below {dashboard.lowStockThreshold}</small>
        </div>
        <div>
          <AppIcon name="orders" />
          <span>Seven-day activity</span>
          <strong>
            {dashboard.ordersPerDay.reduce(
              (sum, day) => sum + day.orderCount,
              0,
            )}
          </strong>
          <small>non-cancelled supplier orders</small>
        </div>
        <div>
          <AppIcon name="revenue" />
          <span>Revenue groups</span>
          <strong>{dashboard.revenuePerSupplier.length}</strong>
          <small>supplier and currency records</small>
        </div>
      </section>
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
          <div
            aria-label="Low-stock products table"
            className="table-scroll"
            role="region"
            tabIndex={0}
          >
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
                      <strong
                        className={
                          product.stockQuantity === 0
                            ? "stock-unavailable"
                            : "stock-low"
                        }
                      >
                        {product.stockQuantity}
                      </strong>
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
      <div className="dashboard-grid dashboard-analytics">
        <section className="panel dashboard-section">
          <p className="eyebrow">Last {dashboard.activityDays} days</p>
          <h2>Orders per day</h2>
          <p className="hint">
            Supplier orders are counted separately; cancelled orders are
            excluded.
          </p>
          <div
            className="activity-chart"
            role="img"
            aria-label={`Orders per day: ${dashboard.ordersPerDay.map((day) => `${day.date}, ${day.orderCount}`).join("; ")}`}
          >
            {dashboard.ordersPerDay.map((day) => {
              const max = Math.max(
                1,
                ...dashboard.ordersPerDay.map((item) => item.orderCount),
              );
              return (
                <div className="activity-day" key={day.date}>
                  <strong>{day.orderCount}</strong>
                  <div className="bar-track">
                    <span
                      style={{
                        height: `${Math.max(5, (day.orderCount / max) * 100)}%`,
                      }}
                    />
                  </div>
                  <time dateTime={day.date}>{day.date.slice(5)}</time>
                </div>
              );
            })}
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
            <ol className="revenue-ranking">
              {dashboard.revenuePerSupplier.map((row, index) => (
                <li key={`${row.supplier.id}:${row.currency}`}>
                  <span className="rank">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <strong>{row.supplier.name}</strong>
                    <small>{row.currency} ledger</small>
                  </div>
                  <strong>
                    {formatMinorUnits(BigInt(row.revenueMinor), row.currency)}
                  </strong>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </main>
  );
}
