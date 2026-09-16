import { headers } from "next/headers";

import { Role } from "@/generated/prisma/enums";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/db";
import { auth } from "@/modules/auth/auth";

export type Actor = {
  id: string;
  name: string;
  email: string;
  role: Role;
  disabledAt: Date | null;
};

export function assertAuthenticatedActor(actor: Actor | null): Actor {
  if (!actor) {
    throw new AppError("UNAUTHENTICATED", "Authentication is required.");
  }

  if (actor.disabledAt) {
    throw new AppError("FORBIDDEN", "This account is disabled.");
  }

  return actor;
}

export function assertActorRole(
  actor: Actor,
  allowedRoles: readonly Role[],
): Actor {
  if (!allowedRoles.includes(actor.role)) {
    throw new AppError(
      "FORBIDDEN",
      "You do not have permission to access this resource.",
    );
  }

  return actor;
}

export async function getCurrentActor(): Promise<Actor | null> {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    return null;
  }

  return prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      disabledAt: true,
    },
  });
}

export async function requireAuthenticatedActor(): Promise<Actor> {
  return assertAuthenticatedActor(await getCurrentActor());
}

export async function requireRole(
  ...allowedRoles: readonly Role[]
): Promise<Actor> {
  return assertActorRole(await requireAuthenticatedActor(), allowedRoles);
}
