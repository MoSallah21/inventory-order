export const ORDER_EXPORT_HEADERS = [
  "Order ID",
  "Created at",
  "Updated at",
  "Customer name",
  "Customer email",
  "Supplier name",
  "Status",
  "Currency",
  "Total minor units",
  "Human-readable total",
] as const;

function neutralizeFormula(value: string) {
  return /^\s*[=+\-@]/.test(value) ? `'${value}` : value;
}

export function csvCell(value: string) {
  const safe = neutralizeFormula(value);
  return `"${safe.replaceAll('"', '""')}"`;
}

type ExportRow = {
  orderId: string;
  createdAt: string;
  updatedAt: string;
  customerName: string;
  customerEmail: string;
  supplierName: string;
  status: string;
  currency: string;
  totalMinor: string;
  humanReadableTotal: string;
};

export function serializeOrderCsv(rows: ExportRow[]) {
  const lines = [ORDER_EXPORT_HEADERS.map(csvCell).join(",")];
  for (const row of rows)
    lines.push(
      [
        row.orderId,
        row.createdAt,
        row.updatedAt,
        row.customerName,
        row.customerEmail,
        row.supplierName,
        row.status,
        row.currency,
        row.totalMinor,
        row.humanReadableTotal,
      ]
        .map(csvCell)
        .join(","),
    );
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
