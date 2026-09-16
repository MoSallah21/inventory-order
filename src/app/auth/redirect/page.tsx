import { redirect } from "next/navigation";

import { Role } from "@/generated/prisma/enums";
import { requireAuthenticatedActor } from "@/modules/auth/authorization";

export default async function RoleRedirectPage() {
  const actor = await requireAuthenticatedActor();

  const destination: Record<Role, string> = {
    [Role.ADMIN]: "/admin",
    [Role.SUPPLIER]: "/supplier",
    [Role.CUSTOMER]: "/account",
  };

  redirect(destination[actor.role]);
}
