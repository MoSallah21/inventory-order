import Link from "next/link";
import { Role } from "@/generated/prisma/enums";
import { ProtectedPlaceholder } from "@/components/protected-placeholder";
import { requireRole } from "@/modules/auth/authorization";

export default async function AccountPage() {
  const actor = await requireRole(Role.CUSTOMER);
  return (
    <>
      <ProtectedPlaceholder actor={actor} title="Customer account" />
      <p className="portal-link">
        <Link href="/orders">View orders →</Link>
      </p>
    </>
  );
}
