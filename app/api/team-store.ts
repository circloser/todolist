import { getD1 } from "../../db";
import {
  DEFAULT_MEMBER_COLOR,
  normalizeLogStatus,
  parseItemIds,
  type TeamMember,
  type WorkLog,
} from "../lib/team";
import { ensureWorkspaceTables } from "./workspace-auth";

// Storage for 구성원(team members), 업무일지(work logs) and the personal
// accounts that sign in as members. Tables are created on demand like the
// rest of the app (idempotent DDL, cached per isolate); drizzle/ holds the
// matching migrations for fresh databases.

export type MemberRow = {
  id: number;
  workspace_id: string;
  name: string;
  role: string;
  color: string;
  active: number;
  position: number;
  user_id: number | null;
  access_role: string;
  created_at: string;
  updated_at: string;
  login_id?: string | null;
};

export type WorkLogRow = {
  id: number;
  workspace_id: string;
  member_id: number;
  member_name: string;
  log_date: string;
  content: string;
  plan: string;
  issues: string;
  item_ids: string;
  status: string;
  reviewer_name: string;
  reviewed_at: string | null;
  review_comment: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
};

async function addColumnIfMissing(sql: string) {
  try {
    await getD1().prepare(sql).run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("duplicate column name")) {
      throw error;
    }
  }
}

let teamReady = false;

export async function prepareTeamTables() {
  if (teamReady) {
    return;
  }

  const d1 = getD1();

  await ensureWorkspaceTables({
    defaultTeamName: "습지복원팀",
    defaultBoardTitle: "Workflow Command Center",
  });
  await d1.batch([
    d1.prepare(`CREATE TABLE IF NOT EXISTS workspace_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL DEFAULT '${DEFAULT_MEMBER_COLOR}',
      active INTEGER NOT NULL DEFAULT 1,
      position INTEGER NOT NULL DEFAULT 0,
      user_id INTEGER,
      access_role TEXT NOT NULL DEFAULT 'member',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    d1.prepare(
      "CREATE UNIQUE INDEX IF NOT EXISTS workspace_members_name_idx ON workspace_members (workspace_id, name)"
    ),
    d1.prepare(
      "CREATE INDEX IF NOT EXISTS workspace_members_position_idx ON workspace_members (workspace_id, position)"
    ),
    d1.prepare(`CREATE TABLE IF NOT EXISTS work_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id TEXT NOT NULL,
      member_id INTEGER NOT NULL,
      member_name TEXT NOT NULL,
      log_date TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      plan TEXT NOT NULL DEFAULT '',
      issues TEXT NOT NULL DEFAULT '',
      item_ids TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'submitted',
      reviewer_name TEXT NOT NULL DEFAULT '',
      reviewed_at TEXT,
      review_comment TEXT NOT NULL DEFAULT '',
      updated_by TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    d1.prepare(
      "CREATE UNIQUE INDEX IF NOT EXISTS work_logs_member_date_idx ON work_logs (workspace_id, member_id, log_date)"
    ),
    d1.prepare(
      "CREATE INDEX IF NOT EXISTS work_logs_workspace_date_idx ON work_logs (workspace_id, log_date)"
    ),
    d1.prepare(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      login_id TEXT NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      failed_logins INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT,
      last_login_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    d1.prepare(
      "CREATE UNIQUE INDEX IF NOT EXISTS users_login_id_idx ON users (login_id)"
    ),
    d1.prepare(`CREATE TABLE IF NOT EXISTS user_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    )`),
    d1.prepare(
      "CREATE INDEX IF NOT EXISTS user_sessions_user_idx ON user_sessions (user_id)"
    ),
    d1.prepare(`CREATE TABLE IF NOT EXISTS workspace_join_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`),
    d1.prepare(
      "CREATE UNIQUE INDEX IF NOT EXISTS workspace_join_requests_user_idx ON workspace_join_requests (workspace_id, user_id)"
    ),
  ]);

  // Columns added after the first release of these tables.
  await addColumnIfMissing("ALTER TABLE workspace_members ADD COLUMN user_id INTEGER");
  await addColumnIfMissing(
    "ALTER TABLE workspace_members ADD COLUMN access_role TEXT NOT NULL DEFAULT 'member'"
  );
  await addColumnIfMissing(
    "ALTER TABLE work_logs ADD COLUMN status TEXT NOT NULL DEFAULT 'submitted'"
  );
  await addColumnIfMissing(
    "ALTER TABLE work_logs ADD COLUMN reviewer_name TEXT NOT NULL DEFAULT ''"
  );
  await addColumnIfMissing("ALTER TABLE work_logs ADD COLUMN reviewed_at TEXT");
  await addColumnIfMissing(
    "ALTER TABLE work_logs ADD COLUMN review_comment TEXT NOT NULL DEFAULT ''"
  );
  await d1
    .prepare(
      "CREATE UNIQUE INDEX IF NOT EXISTS workspace_members_user_idx ON workspace_members (workspace_id, user_id) WHERE user_id IS NOT NULL"
    )
    .run();
  teamReady = true;
}

export function toMember(row: MemberRow, includeLogin = false): TeamMember {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    color: row.color,
    active: row.active === 1,
    position: row.position,
    accessRole: row.access_role === "manager" ? "manager" : "member",
    hasAccount: row.user_id !== null && row.user_id !== undefined,
    ...(includeLogin && row.login_id ? { loginId: row.login_id } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toWorkLog(row: WorkLogRow): WorkLog {
  return {
    id: row.id,
    memberId: row.member_id,
    memberName: row.member_name,
    logDate: row.log_date,
    content: row.content,
    plan: row.plan,
    issues: row.issues,
    itemIds: parseItemIds(row.item_ids),
    status: normalizeLogStatus(row.status),
    reviewerName: row.reviewer_name ?? "",
    reviewedAt: row.reviewed_at ?? null,
    reviewComment: row.review_comment ?? "",
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listMembers(workspaceId: string, includeLogin = false) {
  const rows = await getD1()
    .prepare(
      `SELECT m.*, u.login_id AS login_id
       FROM workspace_members m
       LEFT JOIN users u ON u.id = m.user_id
       WHERE m.workspace_id = ?
       ORDER BY m.position, m.id`
    )
    .bind(workspaceId)
    .all<MemberRow>();

  return (rows.results ?? []).map((row) => toMember(row, includeLogin));
}

export async function getMember(workspaceId: string, memberId: number) {
  return await getD1()
    .prepare("SELECT * FROM workspace_members WHERE workspace_id = ? AND id = ?")
    .bind(workspaceId, memberId)
    .first<MemberRow>();
}

export async function getAssigneeColors(workspaceId: string) {
  try {
    const rows = await getD1()
      .prepare(
        "SELECT assignee, color FROM workspace_assignee_settings WHERE workspace_id = ?"
      )
      .bind(workspaceId)
      .all<{ assignee: string; color: string }>();

    return Object.fromEntries(
      (rows.results ?? []).map((row) => [row.assignee, row.color])
    );
  } catch {
    return {};
  }
}

// The history table belongs to the tasks route's schema; it may not exist on
// a brand-new database, so team history is best-effort only.
export async function logTeamHistory({
  workspaceId,
  entityType,
  entityId,
  action,
  summary,
  actor,
}: {
  workspaceId: string;
  entityType: "member" | "worklog";
  entityId: number | null;
  action: string;
  summary: string;
  actor: string;
}) {
  try {
    await getD1()
      .prepare(
        `INSERT INTO workflow_history (workspace_id, item_id, entity_type, entity_id, action, summary, actor, created_at)
         VALUES (?, NULL, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        workspaceId,
        entityType,
        entityId,
        action,
        summary,
        actor,
        new Date().toISOString()
      )
      .run();
  } catch {
    // ignore — history is non-essential here
  }
}


export function routeError(error: unknown) {
  return Response.json(
    { error: error instanceof Error ? error.message : "Unexpected error" },
    { status: 500 }
  );
}
