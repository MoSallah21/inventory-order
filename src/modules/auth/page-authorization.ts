import { redirect } from "next/navigation";

import { Role } from "@/generated/prisma/enums";
import { getCurrentActor, type Actor } from "@/modules/auth/authorization";
import { roleHome } from "@/modules/auth/navigation";

export function protectedPageDestination(
  actor: Actor | null,
  allowedRoles: readonly Role[],
): string | null {
  if (!actor || actor.disabledAt) return "/sign-in";
  if (!allowedRoles.includes(actor.role)) return roleHome(actor.role);
  return null;
}

export async function requireProtectedPage(
  ...allowedRoles: readonly Role[]
): Promise<Actor> {
  const actor = await getCurrentActor();
  const destination = protectedPageDestination(actor, allowedRoles);
  if (destination) redirect(destination);
  return actor as Actor;
}
