import { GraphQLError } from "graphql";
import { Role, Job, User } from "@prisma/client";
import { Context } from "../../context.js";

export function requireAuth(ctx: Context): User {
  if (!ctx.user) {
    throw new GraphQLError("Authentication required", {
      extensions: { code: "UNAUTHENTICATED" },
    });
  }
  return ctx.user;
}

export function requireRole(ctx: Context, role: Role): User {
  const user = requireAuth(ctx);
  if (user.role !== role) {
    throw new GraphQLError(`Requires ${role} role`, {
      extensions: { code: "FORBIDDEN" },
    });
  }
  return user;
}

export function requireContractor(ctx: Context): User {
  return requireRole(ctx, "CONTRACTOR");
}

type JobWithHomeowners = Job & { homeowners: { id: string }[] };

export function requireJobAccess(
  user: User,
  job: JobWithHomeowners,
): void {
  const isContractor = job.contractorId === user.id;
  const isHomeowner = job.homeowners.some((h) => h.id === user.id);

  if (!isContractor && !isHomeowner) {
    throw new GraphQLError("You do not have access to this job", {
      extensions: { code: "FORBIDDEN" },
    });
  }
}
