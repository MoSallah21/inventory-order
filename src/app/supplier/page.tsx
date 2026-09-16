import { Role } from "@/generated/prisma/enums";
import { ProtectedPlaceholder } from "@/components/protected-placeholder";
import { requireRole } from "@/modules/auth/authorization";

export default async function SupplierPage() {
  const actor = await requireRole(Role.SUPPLIER);
  return <ProtectedPlaceholder actor={actor} title="Supplier" />;
}
