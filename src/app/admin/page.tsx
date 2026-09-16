import { Role } from "@/generated/prisma/enums";
import { ProtectedPlaceholder } from "@/components/protected-placeholder";
import { requireRole } from "@/modules/auth/authorization";

export default async function AdminPage() {
  const actor = await requireRole(Role.ADMIN);
  return <ProtectedPlaceholder actor={actor} title="Admin" />;
}
