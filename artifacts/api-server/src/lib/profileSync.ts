import { db, profilesTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { AuthUser } from "../middlewares/authMiddleware";

type SupabaseIdentity = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown>;
};

function parseName(fullName: string | null): {
  firstName: string | null;
  lastName: string | null;
} {
  if (!fullName) return { firstName: null, lastName: null };
  const [firstName, ...rest] = fullName.trim().split(/\s+/);
  return { firstName: firstName || null, lastName: rest.length ? rest.join(" ") : null };
}

function metadataFromUser(user: SupabaseIdentity) {
  const metadata = user.user_metadata ?? {};
  const fullName =
    (typeof metadata.full_name === "string" ? metadata.full_name : null) ??
    (typeof metadata.name === "string" ? metadata.name : null);
  const avatarUrl =
    (typeof metadata.avatar_url === "string" ? metadata.avatar_url : null) ??
    (typeof metadata.picture === "string" ? metadata.picture : null);
  const { firstName, lastName } = parseName(fullName);
  return { fullName, avatarUrl, firstName, lastName };
}

/** Ensure `profiles` + `users` rows exist; returns Postgres `profiles.id`. */
export async function ensureProfileForSupabaseUser(
  user: SupabaseIdentity,
): Promise<AuthUser> {
  const { fullName, avatarUrl, firstName, lastName } = metadataFromUser(user);

  await db
    .insert(usersTable)
    .values({
      id: user.id,
      email: user.email ?? null,
      firstName,
      lastName,
      profileImageUrl: avatarUrl,
    })
    .onConflictDoUpdate({
      target: usersTable.id,
      set: {
        email: user.email ?? null,
        firstName,
        lastName,
        profileImageUrl: avatarUrl,
        updatedAt: new Date(),
      },
    });

  let profile = await db.query.profilesTable.findFirst({
    where: eq(profilesTable.replitUserId, user.id),
  });

  if (!profile) {
    const [inserted] = await db
      .insert(profilesTable)
      .values({
        replitUserId: user.id,
        fullName: fullName ?? "",
        email: user.email ?? "",
        avatarUrl,
      })
      .returning();
    profile = inserted;
  } else {
    const [updated] = await db
      .update(profilesTable)
      .set({
        fullName: fullName ?? profile.fullName,
        email: user.email ?? profile.email,
        avatarUrl: avatarUrl ?? profile.avatarUrl,
        updatedAt: new Date(),
      })
      .where(eq(profilesTable.id, profile.id))
      .returning();
    profile = updated ?? profile;
  }

  return {
    id: user.id,
    profileId: profile.id,
    email: user.email ?? null,
    firstName,
    lastName,
    profileImageUrl: avatarUrl,
  };
}
