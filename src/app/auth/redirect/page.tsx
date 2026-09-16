import { redirect } from "next/navigation";

import { Role } from "@/generated/prisma/enums";
import { requireProtectedPage } from "@/modules/auth/page-authorization";
import { roleHome } from "@/modules/auth/navigation";

export default async function RoleRedirectPage() {
  const actor = await requireProtectedPage(
    Role.ADMIN,
    Role.SUPPLIER,
    Role.CUSTOMER,
  );
  redirect(roleHome(actor.role));
}
