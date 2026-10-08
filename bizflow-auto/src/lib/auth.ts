import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { cookies } from "next/headers";
import { hasPermission, type Permission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const SESSION_COOKIE = "bizflow_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7;
const roles = [
  "ADMIN",
  "SUPER_ADMIN",
  "GARAGE_MANAGER",
  "SERVICE_ADVISOR",
  "MECHANIC",
  "STOREKEEPER",
  "ACCOUNTANT",
  "CUSTOMER",
] as const;

export type UserRole = (typeof roles)[number];

export type SessionUser = {
  id: number;
  email: string;
  name: string;
  role: UserRole;
};

function isUserRole(role: string): role is UserRole {
  return roles.some((knownRole) => knownRole === role);
}

function getSecret() {
  const secret = process.env.AUTH_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET must be set to at least 32 characters.");
  }

  return new TextEncoder().encode(secret);
}

export function validateAuthConfiguration() {
  getSecret();
}

export async function createSession(user: SessionUser, request: Request) {
  const currentUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { sessionVersion: true },
  });
  if (!currentUser) throw new Error("SESSION_USER_UNAVAILABLE");

  const token = await new SignJWT({
    email: user.email,
    name: user.name,
    role: user.role,
    sessionVersion: currentUser.sessionVersion,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getSecret());

  const cookieStore = await cookies();
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  const isHttps = new URL(request.url).protocol === "https:" || forwardedProtocol === "https";
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isHttps,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (!token) return null;

  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, getSecret()));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("AUTH_SECRET")) {
      throw error;
    }
    return null;
  }

  const id = Number(payload.sub);
  if (!Number.isSafeInteger(id) || typeof payload.sessionVersion !== "number" || !Number.isSafeInteger(payload.sessionVersion)) return null;

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, name: true, role: true, sessionVersion: true },
  });
  if (!user || user.sessionVersion !== payload.sessionVersion || !isUserRole(user.role)) return null;

  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

export async function requireRole(role: UserRole) {
  const user = await getSessionUser();

  if (!user) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  if (user.role !== role) {
    return Response.json({ error: "You do not have permission to do this." }, { status: 403 });
  }

  return user;
}

export async function requirePermission(permission: Permission) {
  const user = await getSessionUser();

  if (!user) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }

  if (!hasPermission(user.role, permission)) {
    return Response.json({ error: "You do not have permission to do this." }, { status: 403 });
  }

  return user;
}

export function isDatabaseUnavailable(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    ["P1001", "P1002", "P1003", "P1017"].includes(error.code)
  );
}
