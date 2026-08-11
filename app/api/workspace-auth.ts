import { getD1 } from "../../db";

export const DEFAULT_WORKSPACE_ID = "default";

export type WorkspaceRow = {
  id: string;
  department_name: string;
  team_name: string;
  password_hash: string | null;
  password_salt: string | null;
  updated_at: string;
  created_at: string;
};

export type WorkspaceSummary = {
  id: string;
  departmentName: string;
  teamName: string;
  label: string;
  requiresPassword: boolean;
  updatedAt: string;
  createdAt: string;
};

export type WorkspaceAccess =
  | { workspace: WorkspaceRow; summary: WorkspaceSummary; response?: never }
  | { workspace?: never; summary?: never; response: Response };

function toHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function normalizeWorkspaceId(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(trimmed) ? trimmed : "";
}

function normalizeText(value: unknown, maxLength = 80) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function workspaceLabel(row: Pick<WorkspaceRow, "department_name" | "team_name">) {
  const department = row.department_name.trim();
  const team = row.team_name.trim();

  if (department && team) {
    return `${department} / ${team}`;
  }

  return team || department || "기본 보드";
}

export function toWorkspaceSummary(row: WorkspaceRow): WorkspaceSummary {
  return {
    id: row.id,
    departmentName: row.department_name,
    teamName: row.team_name,
    label: workspaceLabel(row),
    requiresPassword: Boolean(row.password_hash),
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  };
}

export async function hashWorkspacePassword(password: string, salt: string) {
  const bytes = new TextEncoder().encode(`${salt}:${password}`);
  return toHex(await crypto.subtle.digest("SHA-256", bytes));
}

export async function makeWorkspacePassword(password: string) {
  const salt = crypto.randomUUID();
  return {
    salt,
    hash: await hashWorkspacePassword(password, salt),
  };
}

async function addColumnIfMissing(sql: string) {
  try {
    await getD1().prepare(sql).run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (
      !message.includes("duplicate column name") &&
      !message.includes("no such table")
    ) {
      throw error;
    }
  }
}

async function copyLegacySettings(defaultTeamName: string, defaultBoardTitle: string) {
  const d1 = getD1();
  let legacyRows: Array<{ key: string; value: string }> = [];

  try {
    const result = await d1
      .prepare("SELECT key, value FROM app_settings")
      .all<{ key: string; value: string }>();
    legacyRows = result.results ?? [];
  } catch {
    legacyRows = [];
  }

  const legacy = new Map(legacyRows.map((row) => [row.key, row.value]));
  const teamName = normalizeText(legacy.get("organizationName"), 80) || defaultTeamName;
  const boardTitle = normalizeText(legacy.get("boardTitle"), 80) || defaultBoardTitle;
  const groupOrder = legacy.get("groupOrder") ?? "[]";
  const now = new Date().toISOString();

  await d1.batch([
    d1
      .prepare(
        `UPDATE workspaces
         SET team_name = CASE WHEN team_name = '' THEN ? ELSE team_name END,
             updated_at = ?
         WHERE id = ?`
      )
      .bind(teamName, now, DEFAULT_WORKSPACE_ID),
    d1
      .prepare(
        `INSERT OR IGNORE INTO workspace_settings (workspace_id, key, value, updated_at)
         VALUES (?, 'organizationName', ?, ?)`
      )
      .bind(DEFAULT_WORKSPACE_ID, teamName, now),
    d1
      .prepare(
        `INSERT OR IGNORE INTO workspace_settings (workspace_id, key, value, updated_at)
         VALUES (?, 'boardTitle', ?, ?)`
      )
      .bind(DEFAULT_WORKSPACE_ID, boardTitle, now),
    d1
      .prepare(
        `INSERT OR IGNORE INTO workspace_settings (workspace_id, key, value, updated_at)
         VALUES (?, 'groupOrder', ?, ?)`
      )
      .bind(DEFAULT_WORKSPACE_ID, groupOrder, now),
  ]);
}

export async function ensureWorkspaceTables({
  defaultTeamName,
  defaultBoardTitle,
}: {
  defaultTeamName: string;
  defaultBoardTitle: string;
}) {
  const d1 = getD1();
  const now = new Date().toISOString();

  await d1.batch([
    d1.prepare(`CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      department_name TEXT NOT NULL DEFAULT '',
      team_name TEXT NOT NULL,
      password_hash TEXT,
      password_salt TEXT,
      updated_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS workspace_settings (
      workspace_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (workspace_id, key)
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS workspace_assignee_settings (
      workspace_id TEXT NOT NULL,
      assignee TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#e6f4ef',
      updated_at TEXT NOT NULL,
      PRIMARY KEY (workspace_id, assignee)
    )`),
    d1.prepare(
      "CREATE INDEX IF NOT EXISTS workspaces_name_idx ON workspaces (department_name, team_name)"
    ),
  ]);

  await d1
    .prepare(
      `INSERT OR IGNORE INTO workspaces (
        id, department_name, team_name, password_hash, password_salt, updated_at, created_at
      ) VALUES (?, '', ?, NULL, NULL, ?, ?)`
    )
    .bind(DEFAULT_WORKSPACE_ID, defaultTeamName, now, now)
    .run();

  await copyLegacySettings(defaultTeamName, defaultBoardTitle);
  await addColumnIfMissing(
    `ALTER TABLE workflow_items ADD COLUMN workspace_id TEXT NOT NULL DEFAULT '${DEFAULT_WORKSPACE_ID}'`
  );
  await addColumnIfMissing(
    `ALTER TABLE workflow_history ADD COLUMN workspace_id TEXT NOT NULL DEFAULT '${DEFAULT_WORKSPACE_ID}'`
  );
  await addColumnIfMissing(
    `ALTER TABLE webhook_settings ADD COLUMN workspace_id TEXT NOT NULL DEFAULT '${DEFAULT_WORKSPACE_ID}'`
  );
  await addColumnIfMissing(
    `ALTER TABLE document_templates ADD COLUMN workspace_id TEXT NOT NULL DEFAULT '${DEFAULT_WORKSPACE_ID}'`
  );
}

export async function listWorkspaces() {
  const rows = await getD1()
    .prepare(
      `SELECT * FROM workspaces
       ORDER BY department_name COLLATE NOCASE, team_name COLLATE NOCASE, created_at`
    )
    .all<WorkspaceRow>();

  return (rows.results ?? []).map(toWorkspaceSummary);
}

export async function getWorkspaceById(id: string) {
  return await getD1()
    .prepare("SELECT * FROM workspaces WHERE id = ?")
    .bind(id)
    .first<WorkspaceRow>();
}

function workspaceIdFromRequest(request: Request, payload?: { workspaceId?: unknown }) {
  const url = new URL(request.url);
  return (
    normalizeWorkspaceId(request.headers.get("x-workspace-id")) ||
    normalizeWorkspaceId(url.searchParams.get("workspaceId")) ||
    normalizeWorkspaceId(payload?.workspaceId) ||
    DEFAULT_WORKSPACE_ID
  );
}

function passwordFromRequest(request: Request, payload?: { workspacePassword?: unknown }) {
  const url = new URL(request.url);
  const headerPassword = request.headers.get("x-workspace-password");

  return (
    (typeof headerPassword === "string" ? headerPassword : "") ||
    (typeof payload?.workspacePassword === "string" ? payload.workspacePassword : "") ||
    (url.searchParams.get("workspacePassword") ?? "")
  );
}

export async function requireWorkspaceAccess(
  request: Request,
  payload?: { workspaceId?: unknown; workspacePassword?: unknown }
): Promise<WorkspaceAccess> {
  const workspaceId = workspaceIdFromRequest(request, payload);
  const workspace = await getWorkspaceById(workspaceId);
  const workspaces = await listWorkspaces();

  if (!workspace) {
    return {
      response: Response.json(
        {
          error: "선택한 부서/팀을 찾을 수 없습니다.",
          workspaces,
          defaultWorkspaceId: DEFAULT_WORKSPACE_ID,
        },
        { status: 404 }
      ),
    };
  }

  if (workspace.password_hash && workspace.password_salt) {
    const password = passwordFromRequest(request, payload);
    const hash = password
      ? await hashWorkspacePassword(password, workspace.password_salt)
      : "";

    if (hash !== workspace.password_hash) {
      return {
        response: Response.json(
          {
            error: "이 부서/팀은 암호가 필요합니다.",
            requiresWorkspacePassword: true,
            workspace: toWorkspaceSummary(workspace),
            workspaces,
            defaultWorkspaceId: DEFAULT_WORKSPACE_ID,
          },
          { status: 401 }
        ),
      };
    }
  }

  return {
    workspace,
    summary: toWorkspaceSummary(workspace),
  };
}
