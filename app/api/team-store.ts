import { getD1 } from "../../db";
import {
  DEFAULT_MEMBER_COLOR,
  normalizeLogStatus,
  parseItemIds,
  parsePolicy,
  type TeamPolicy,
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
  log_viewer: number;
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
    defaultBoardTitle: "업무나침반",
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
      log_viewer INTEGER NOT NULL DEFAULT 0,
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
    d1.prepare(`CREATE TABLE IF NOT EXISTS calendar_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id TEXT NOT NULL,
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'etc',
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      all_day INTEGER NOT NULL DEFAULT 1,
      start_time TEXT,
      end_time TEXT,
      location TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      attendee_ids TEXT NOT NULL DEFAULT '[]',
      reminder_minutes INTEGER,
      created_by_member_id INTEGER NOT NULL,
      created_by_name TEXT NOT NULL,
      updated_by TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    d1.prepare(
      "CREATE INDEX IF NOT EXISTS calendar_events_range_idx ON calendar_events (workspace_id, start_date, end_date)"
    ),
    d1.prepare(
      "CREATE INDEX IF NOT EXISTS calendar_events_updated_idx ON calendar_events (workspace_id, updated_at)"
    ),
    d1.prepare(`CREATE TABLE IF NOT EXISTS meeting_minutes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id TEXT NOT NULL,
      title TEXT NOT NULL,
      meeting_date TEXT NOT NULL,
      start_time TEXT,
      end_time TEXT,
      location TEXT NOT NULL DEFAULT '',
      attendee_ids TEXT NOT NULL DEFAULT '[]',
      guests TEXT NOT NULL DEFAULT '',
      agenda TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      decisions TEXT NOT NULL DEFAULT '',
      action_items TEXT NOT NULL DEFAULT '[]',
      event_id INTEGER,
      author_member_id INTEGER NOT NULL,
      author_name TEXT NOT NULL,
      updated_by TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    d1.prepare(
      "CREATE INDEX IF NOT EXISTS meeting_minutes_date_idx ON meeting_minutes (workspace_id, meeting_date)"
    ),
    d1.prepare(`CREATE TABLE IF NOT EXISTS meeting_minutes_reads (
      minutes_id INTEGER NOT NULL,
      workspace_id TEXT NOT NULL,
      member_id INTEGER NOT NULL,
      member_name TEXT NOT NULL,
      acknowledged_at TEXT NOT NULL,
      PRIMARY KEY (minutes_id, member_id)
    )`),
    d1.prepare(
      "CREATE INDEX IF NOT EXISTS meeting_minutes_reads_workspace_idx ON meeting_minutes_reads (workspace_id)"
    ),
  ]);

  // Columns added after the first release of these tables.
  await addColumnIfMissing("ALTER TABLE workspace_members ADD COLUMN user_id INTEGER");
  await addColumnIfMissing(
    "ALTER TABLE workspace_members ADD COLUMN access_role TEXT NOT NULL DEFAULT 'member'"
  );
  await addColumnIfMissing(
    "ALTER TABLE workspace_members ADD COLUMN log_viewer INTEGER NOT NULL DEFAULT 0"
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
  // 부서장 본인 업무일지는 승인이 필요 없다: pending logs written by a current
  // 부서장 (from before this rule) become "recorded". Idempotent.
  await d1
    .prepare(
      `UPDATE work_logs SET status = 'recorded'
       WHERE status = 'submitted' AND EXISTS (
         SELECT 1 FROM workspace_members m
         WHERE m.id = work_logs.member_id AND m.workspace_id = work_logs.workspace_id AND m.access_role = 'manager'
       )`
    )
    .run();
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
    logViewer: row.log_viewer === 1,
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
  entityType: "member" | "worklog" | "event" | "minutes";
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

// ------------------------------------------------------------ team policy

export async function getTeamPolicy(workspaceId: string): Promise<TeamPolicy> {
  try {
    const row = await getD1()
      .prepare(
        "SELECT value FROM workspace_settings WHERE workspace_id = ? AND key = 'teamPolicy'"
      )
      .bind(workspaceId)
      .first<{ value: string }>();
    return parsePolicy(row?.value);
  } catch {
    return parsePolicy(null);
  }
}

export async function saveTeamPolicy(workspaceId: string, policy: TeamPolicy) {
  await getD1()
    .prepare(
      `INSERT INTO workspace_settings (workspace_id, key, value, updated_at)
       VALUES (?, 'teamPolicy', ?, ?)
       ON CONFLICT(workspace_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .bind(workspaceId, JSON.stringify(policy), new Date().toISOString())
    .run();
}
