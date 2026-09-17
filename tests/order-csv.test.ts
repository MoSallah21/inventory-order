import { describe, expect, it } from "vitest";

import { ORDER_EXPORT_HEADERS, serializeOrderCsv } from "@/modules/orders/csv";

describe("order CSV serialization", () => {
  it("uses the exact allow-listed columns and preserves large integers", () => {
    const csv = serializeOrderCsv([
      {
        orderId: "order-1",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
        customerName: "Customer",
        customerEmail: "customer@example.test",
        supplierName: "Supplier",
        status: "PENDING",
        currency: "AED",
        totalMinor: "9007199254740993",
        humanReadableTotal: "AED 90071992547409.93",
      },
    ]);
    expect(csv).toContain(
      ORDER_EXPORT_HEADERS.map((value) => `"${value}"`).join(","),
    );
    expect(csv).toContain('"9007199254740993"');
  });

  it("escapes RFC-sensitive content and neutralizes spreadsheet formulas", () => {
    const csv = serializeOrderCsv([
      {
        orderId: 'order,"one"',
        createdAt: "date",
        updatedAt: "date",
        customerName: "  =SUM(1,1)\nnext",
        customerEmail: "+evil@example.test",
        supplierName: "@supplier",
        status: "-status",
        currency: "AED",
        totalMinor: "100",
        humanReadableTotal: "AED 1.00",
      },
    ]);
    expect(csv).toContain('"order,""one"""');
    expect(csv).toContain('"\'  =SUM(1,1)\nnext"');
    expect(csv).toContain('"\'+evil@example.test"');
    expect(csv).toContain('"\'@supplier"');
    expect(csv).toContain('"\'-status"');
    expect(csv.endsWith("\r\n")).toBe(true);
  });
});
