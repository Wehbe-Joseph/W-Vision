import { type Request, type Response, type NextFunction } from "express";
import { getSupabaseAuth } from "../lib/supabaseAdmin";
import { ensureProfileForSupabaseUser } from "../lib/profileSync";

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

function parseName(fullName: string | null): {
  firstName: string | null;
  lastName: string | null;
} {
  if (!fullName) return { firstName: null, lastName: null };
  const [firstName, ...rest] = fullName.trim().split(/\s+/);
  return { firstName: firstName || null, lastName: rest.length ? rest.join(" ") : null };
}

function getBearerToken(req: Request): string | null {
  const header = req.headers["authorization"];
  if (!header || Array.isArray(header) || !header.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length);
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  req.isAuthenticated = function (this: Request) {
    return this.user != null;
  } as Request["isAuthenticated"];

  const supabaseAuth = getSupabaseAuth();
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
      return res.status(401).json({
        error: "Unauthorized",
        message: "Invalid or expired session. Sign in again.",
      });
    }

    const supabaseUser = data.user as SupabaseAuthUser;

    try {
      req.user = await ensureProfileForSupabaseUser(supabaseUser);
    } catch (dbErr) {
      console.warn(
        "[authMiddleware] DB upsert failed, falling back to Supabase identity:",
        dbErr,
      );
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
