import { getD1 } from "../../db";
import type { AccessRole, BoardMembership } from "../lib/team";
import { prepareTeamTables, type MemberRow } from "./team-store";
import {
  getWorkspaceById,
  toWorkspaceSummary,
  workspaceIdFromRequest,
  workspaceLabel,
  type WorkspaceRow,
  type WorkspaceSummary,
} from "./workspace-auth";

// Personal accounts and sessions. Every board API resolves the caller from
// the session cookie and their membership in the board, so permissions are
// enforced on the server no matter what the client sends.

export const SESSION_COOKIE = "tb_session";
const SESSION_DAYS = 30;
// Cloudflare Workers caps PBKDF2 at 100k iterations.
const PBKDF2_ITERATIONS = 100_000;
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 10;

export type UserRow = {
  id: number;
  login_id: string;
  name: string;
  password_hash: string;
  failed_logins: number;
  locked_until: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SessionUser = { id: number; loginId: string; name: string };

export type BoardAccess = {
  workspace: WorkspaceRow;
  summary: WorkspaceSummary;
  user: SessionUser;
  member: MemberRow;
  accessRole: AccessRole;
  isManager: boolean;
  /** Name recorded in history and updated_by columns. */
  actor: string;
};

export type WorkspaceAccess =
  | (BoardAccess & { response?: never })
  | { response: Response };

export async function prepareAuth() {
  await prepareTeamTables();
}

// ----------------------------------------------------------------- crypto

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function fromBase64(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function toHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(first: string, second: string) {
  if (first.length !== second.length) {
    return false;
  }
  let diff = 0;
  for (let index = 0; index < first.length; index += 1) {
    diff |= first.charCodeAt(index) ^ second.charCodeAt(index);
  }
  return diff === 0;
}

async function pbkdf2(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    256
  );
  return toBase64(new Uint8Array(bits));
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2-sha256$${PBKDF2_ITERATIONS}$${toBase64(salt)}$${hash}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, iterations, salt, hash] = stored.split("$");

  if (scheme !== "pbkdf2-sha256" || !iterations || !salt || !hash) {
    return false;
  }

  const candidate = await pbkdf2(password, fromBase64(salt), Number(iterations));
  return timingSafeEqual(candidate, hash);
}

// Used when the login id does not exist so response time doesn't reveal it.
const DUMMY_HASH = `pbkdf2-sha256$${PBKDF2_ITERATIONS}$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=`;

async function sha256Hex(value: string) {
  return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

// --------------------------------------------------------------- sessions

function readCookie(request: Request, name: string) {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) {
      return decodeURIComponent(rest.join("="));
    }
  }
  return "";
}

function cookieAttributes(request: Request, maxAge: number) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export async function createSession(request: Request, userId: number) {
  const token = toBase64(crypto.getRandomValues(new Uint8Array(32)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 86_400_000);

  await getD1()
    .prepare(
      "INSERT INTO user_sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)"
    )
    .bind(await sha256Hex(token), userId, now.toISOString(), expires.toISOString())
    .run();

  return `${SESSION_COOKIE}=${token}; ${cookieAttributes(request, SESSION_DAYS * 86_400)}`;
}

export function clearSessionCookie(request: Request) {
  return `${SESSION_COOKIE}=; ${cookieAttributes(request, 0)}`;
}

export async function destroySession(request: Request) {
  const token = readCookie(request, SESSION_COOKIE);
  if (token) {
    await getD1()
      .prepare("DELETE FROM user_sessions WHERE token_hash = ?")
      .bind(await sha256Hex(token))
      .run();
  }
}

export async function destroyOtherSessions(request: Request, userId: number) {
  const token = readCookie(request, SESSION_COOKIE);
  await getD1()
    .prepare("DELETE FROM user_sessions WHERE user_id = ? AND token_hash <> ?")
    .bind(userId, token ? await sha256Hex(token) : "")
    .run();
}

export async function getSessionUser(request: Request): Promise<SessionUser | null> {
  const token = readCookie(request, SESSION_COOKIE);

  if (!token || token.length > 100) {
    return null;
  }

  const row = await getD1()
    .prepare(
      `SELECT u.id, u.login_id, u.name, s.expires_at
       FROM user_sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`
    )
    .bind(await sha256Hex(token))
    .first<{ id: number; login_id: string; name: string; expires_at: string }>();

  if (!row || Date.parse(row.expires_at) <= Date.now()) {
    return null;
  }

  return { id: row.id, loginId: row.login_id, name: row.name };
}

// ------------------------------------------------------------------ users

export async function findUserByLoginId(loginId: string) {
  return await getD1()
    .prepare("SELECT * FROM users WHERE login_id = ?")
    .bind(loginId)
    .first<UserRow>();
}

export async function getUserById(id: number) {
  return await getD1()
    .prepare("SELECT * FROM users WHERE id = ?")
    .bind(id)
    .first<UserRow>();
}

export async function createUser(loginId: string, name: string, password: string) {
  const now = new Date().toISOString();
  return await getD1()
    .prepare(
      `INSERT INTO users (login_id, name, password_hash, failed_logins, created_at, updated_at)
       VALUES (?, ?, ?, 0, ?, ?)
       RETURNING *`
    )
    .bind(loginId, name, await hashPassword(password), now, now)
    .first<UserRow>();
}

export type LoginResult =
  | { ok: true; user: UserRow }
  | { ok: false; status: number; error: string };

export async function attemptLogin(loginId: string, password: string): Promise<LoginResult> {
  const user = await findUserByLoginId(loginId);
  const failure: LoginResult = {
    ok: false,
    status: 401,
    error: "아이디 또는 비밀번호가 맞지 않습니다.",
  };

  if (!user) {
    await verifyPassword(password, DUMMY_HASH);
    return failure;
  }

  if (user.locked_until && Date.parse(user.locked_until) > Date.now()) {
    return {
      ok: false,
      status: 429,
      error: `로그인 시도가 너무 많아 잠시 잠겼습니다. ${LOCK_MINUTES}분 후 다시 시도해 주세요.`,
    };
  }

  const d1 = getD1();
  const now = new Date();

  if (!(await verifyPassword(password, user.password_hash))) {
    const failed = user.failed_logins + 1;
    const locked = failed >= MAX_FAILED_LOGINS;
    await d1
      .prepare("UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?")
      .bind(
        locked ? 0 : failed,
        locked ? new Date(now.getTime() + LOCK_MINUTES * 60_000).toISOString() : null,
        user.id
      )
      .run();
    return failure;
  }

  await d1
    .prepare(
      "UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = ? WHERE id = ?"
    )
    .bind(now.toISOString(), user.id)
    .run();
  // Opportunistic cleanup of expired sessions.
  await d1
    .prepare("DELETE FROM user_sessions WHERE expires_at < ?")
    .bind(now.toISOString())
    .run();

  return { ok: true, user };
}

// ------------------------------------------------------------- membership

export async function getMembership(workspaceId: string, userId: number) {
  return await getD1()
    .prepare("SELECT * FROM workspace_members WHERE workspace_id = ? AND user_id = ?")
    .bind(workspaceId, userId)
    .first<MemberRow>();
}

export async function listBoardsForUser(userId: number): Promise<BoardMembership[]> {
  const rows = await getD1()
    .prepare(
      `SELECT m.id AS member_id, m.name AS member_name, m.access_role, m.active,
              w.id AS workspace_id, w.department_name, w.team_name
       FROM workspace_members m JOIN workspaces w ON w.id = m.workspace_id
       WHERE m.user_id = ?
       ORDER BY w.department_name DESC, w.team_name`
    )
    .bind(userId)
    .all<{
      member_id: number;
      member_name: string;
      access_role: string;
      active: number;
      workspace_id: string;
      department_name: string;
      team_name: string;
    }>();

  return (rows.results ?? []).map((row) => ({
    workspaceId: row.workspace_id,
    label: workspaceLabel(row),
    departmentName: row.department_name,
    teamName: row.team_name,
    memberId: row.member_id,
    memberName: row.member_name,
    accessRole: row.access_role === "manager" ? "manager" : "member",
    active: row.active === 1,
  }));
}

export async function boardHasManager(workspaceId: string) {
  const row = await getD1()
    .prepare(
      `SELECT COUNT(*) AS count FROM workspace_members
       WHERE workspace_id = ? AND access_role = 'manager' AND active = 1 AND user_id IS NOT NULL`
    )
    .bind(workspaceId)
    .first<{ count: number }>();
  return (row?.count ?? 0) > 0;
}

function denied(status: number, body: Record<string, unknown>) {
  return { response: Response.json(body, { status }) } as const;
}

export function forbidden(error: string) {
  return Response.json({ error, forbidden: true }, { status: 403 });
}

// The one gate every board API goes through: a signed-in user who is an
// active member of the requested board.
export async function requireWorkspaceAccess(
  request: Request,
  payload?: { workspaceId?: unknown }
): Promise<WorkspaceAccess> {
  await prepareAuth();
  const user = await getSessionUser(request);

  if (!user) {
    return denied(401, { error: "로그인이 필요합니다.", requiresLogin: true });
  }

  const workspace = await getWorkspaceById(workspaceIdFromRequest(request, payload));

  if (!workspace) {
    return denied(404, { error: "선택한 연도/팀 보드를 찾을 수 없습니다.", notMember: true });
  }

  const member = await getMembership(workspace.id, user.id);

  if (!member) {
    return denied(403, {
      error: "이 보드의 구성원이 아닙니다. 가입 신청 후 부서장 승인을 받아 주세요.",
      notMember: true,
    });
  }

  if (member.active !== 1) {
    return denied(403, {
      error: "비활성화된 구성원입니다. 부서장에게 문의해 주세요.",
      notMember: true,
    });
  }

  const accessRole: AccessRole = member.access_role === "manager" ? "manager" : "member";

  return {
    workspace,
    summary: toWorkspaceSummary(workspace),
    user,
    member,
    accessRole,
    isManager: accessRole === "manager",
    actor: member.name,
  };
}

export function viewerOf(access: BoardAccess) {
  return {
    userId: access.user.id,
    loginId: access.user.loginId,
    memberId: access.member.id,
    name: access.member.name,
    accessRole: access.accessRole,
  };
}
