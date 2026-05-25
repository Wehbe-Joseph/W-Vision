import type { Request } from "express";
import { db } from "@workspace/db";
import { profilesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ensureProfileForSupabaseUser } from "./profileSync";

/**
 * Resolve the Postgres `profiles.id` for the authenticated Supabase user.
 * Tours and uploads must use this id (FK), not the raw Supabase auth uuid.
 */
export async function resolveProfileId(req: Request): Promise<string | null> {
  const authUser = req.user;
  if (!authUser?.id) return null;

  try {
    const bySupabaseId = await db.query.profilesTable.findFirst({
      where: eq(profilesTable.replitUserId, authUser.id),
    });
    if (bySupabaseId) return bySupabaseId.id;

    if (authUser.profileId && authUser.profileId !== authUser.id) {
      const byProfileId = await db.query.profilesTable.findFirst({
        where: eq(profilesTable.id, authUser.profileId),
      });
      if (byProfileId) return byProfileId.id;
    }

    const synced = await ensureProfileForSupabaseUser({
      id: authUser.id,
      email: authUser.email,
    });
    req.user = synced;
    return synced.profileId;
  } catch {
    if (authUser.profileId && authUser.profileId !== authUser.id) {
      return authUser.profileId;
    }
    return null;
  }
}

export async function requireProfileId(req: Request): Promise<string | null> {
  if (!req.user?.id) return null;
  return resolveProfileId(req);
}
