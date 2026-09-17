import { AppError } from "@/lib/errors";
import { getCurrentActor } from "@/modules/auth/authorization";
import { serializeOrderCsv } from "@/modules/orders/csv";
import { listAdminOrderExportRows } from "@/modules/orders/service";

export async function GET() {
  try {
    const actor = await getCurrentActor();
    if (!actor)
      return new Response("Authentication required.", { status: 401 });
    const rows = await listAdminOrderExportRows(actor);
    return new Response(serializeOrderCsv(rows), {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": 'attachment; filename="orders.csv"',
        "Content-Type": "text/csv; charset=utf-8",
      },
    });
  } catch (error) {
    if (error instanceof AppError)
      return new Response(error.message, {
        status: error.code === "UNAUTHENTICATED" ? 401 : 403,
        headers: { "Cache-Control": "no-store" },
      });
    throw error;
  }
}
