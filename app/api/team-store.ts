import { getD1 } from "../../db";
import {
  DEFAULT_MEMBER_COLOR,
  parseItemIds,
  type TeamMember,
  type WorkLog,
} from "../lib/team";
import { ensureWorkspaceTables } from "./workspace-auth";

// Storage for 구성원(team members) and 업무일지(work logs). Tables are created
// on demand like the rest of the app (idempotent DDL, cached per isolate);
// drizzle/ holds the matching migration for fresh databases.

export type MemberRow = {
  id: number;
  workspace_id: string;
  name: string;
  role: string;
  color: string;
  active: number;
  position: number;
  created_at: string;
  updated_at: string;
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
  updated_by: string;
  created_at: string;
  updated_at: string;
};

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
  ]);
  teamReady = true;
}

export function toMember(row: MemberRow): TeamMember {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    color: row.color,
    active: row.active === 1,
    position: row.position,
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
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listMembers(workspaceId: string) {
  const rows = await getD1()
    .prepare(
      "SELECT * FROM workspace_members WHERE workspace_id = ? ORDER BY position, id"
    )
    .bind(workspaceId)
    .all<MemberRow>();

  return (rows.results ?? []).map(toMember);
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

export function actorFrom(request: Request, override?: unknown) {
  if (typeof override === "string" && override.trim()) {
    return override.trim().slice(0, 80);
  }

  const encodedName = request.headers.get("oai-authenticated-user-full-name");
  const nameEncoding = request.headers.get(
    "oai-authenticated-user-full-name-encoding"
  );

  if (encodedName && nameEncoding === "percent-encoded-utf-8") {
    return decodeURIComponent(encodedName);
  }

  return request.headers.get("oai-authenticated-user-email") ?? "사용자";
}

export function routeError(error: unknown) {
  return Response.json(
    { error: error instanceof Error ? error.message : "Unexpected error" },
    { status: 500 }
  );
}
