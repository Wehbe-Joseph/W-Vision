import { db, profilesTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { type Request, type Response, type NextFunction } from "express";
import { supabaseAuth } from "../lib/supabaseAdmin";

type SupabaseAuthUser = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown>;
};

export interface AuthUser {
  id: string;
  profileId: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  profileImageUrl?: string | null;
}

declare global {
  namespace Express {
    interface User extends AuthUser {}
    interface Request {
      isAuthenticated(): this is AuthedRequest;
      user?: User | undefined;
    }
    export interface AuthedRequest {
      user: User;
    }
  }
}

function parseName(fullName: string | null): { firstName: string | null; lastName: string | null } {
  if (!fullName) return { firstName: null, lastName: null };
  const [firstName, ...rest] = fullName.trim().split(/\s+/);
  return { firstName: firstName || null, lastName: rest.length ? rest.join(" ") : null };
}

function getBearerToken(req: Request): string | null {
  const header = req.headers["authorization"];
  if (!header || Array.isArray(header) || !header.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length);
}

async function upsertUserFromSupabase(user: SupabaseAuthUser): Promise<AuthUser> {
  const metadata = user.user_metadata ?? {};
  const fullName =
    (typeof metadata.full_name === "string" ? metadata.full_name : null) ??
    (typeof metadata.name === "string" ? metadata.name : null);
  const avatarUrl =
    (typeof metadata.avatar_url === "string" ? metadata.avatar_url : null) ??
    (typeof metadata.picture === "string" ? metadata.picture : null);
  const { firstName, lastName } = parseName(fullName);

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

export async function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  req.isAuthenticated = function (this: Request) {
    return this.user != null;
  } as Request["isAuthenticated"];

  if (!supabaseAuth) {
    next();
    return;
  }

  const token = getBearerToken(req);
  if (!token) {
    next();
    return;
  }

  try {
    const { data, error } = await supabaseAuth.auth.getUser(token);
    if (error || !data.user) {
      next();
      return;
    }

    const supabaseUser = data.user as SupabaseAuthUser;

    try {
      req.user = await upsertUserFromSupabase(supabaseUser);
    } catch (dbErr) {
      // DB is unavailable (e.g. wrong pooler region, schema not pushed yet).
      // Still authenticate the request using the verified Supabase identity so
      // uploads and other routes work while the DB issue is resolved.
      console.warn("[authMiddleware] DB upsert failed, falling back to Supabase identity:", dbErr);
      const metadata = supabaseUser.user_metadata ?? {};
      const fullName =
        (typeof metadata.full_name === "string" ? metadata.full_name : null) ??
        (typeof metadata.name === "string" ? metadata.name : null);
      const { firstName, lastName } = parseName(fullName);
      const avatarUrl =
        (typeof metadata.avatar_url === "string" ? metadata.avatar_url : null) ??
        (typeof metadata.picture === "string" ? metadata.picture : null);
      req.user = {
        id: supabaseUser.id,
        profileId: supabaseUser.id,
        email: supabaseUser.email ?? null,
        firstName,
        lastName,
        profileImageUrl: avatarUrl,
      };
    }

    next();
  } catch {
    next();
  }
}
