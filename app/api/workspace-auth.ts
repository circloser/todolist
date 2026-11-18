import { getD1 } from "../../db";

export const DEFAULT_WORKSPACE_ID = "default";
export const DEFAULT_WORKSPACE_YEAR = "2026";
const DEFAULT_WORKSPACE_PASSWORD = "5541";

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
         SET department_name = CASE WHEN department_name = '' THEN ? ELSE department_name END,
             team_name = CASE WHEN team_name = '' THEN ? ELSE team_name END,
             updated_at = ?
         WHERE id = ?`
      )
      .bind(DEFAULT_WORKSPACE_YEAR, teamName, now, DEFAULT_WORKSPACE_ID),
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

async function ensureDefaultWorkspacePassword() {
  const d1 = getD1();
  const current = await getWorkspaceById(DEFAULT_WORKSPACE_ID);

  if (!current) {
    return;
  }

  const now = new Date().toISOString();

  if (!current.department_name.trim()) {
    await d1
      .prepare(
        "UPDATE workspaces SET department_name = ?, updated_at = ? WHERE id = ?"
      )
      .bind(DEFAULT_WORKSPACE_YEAR, now, DEFAULT_WORKSPACE_ID)
      .run();
  }

  if (!current.password_hash || !current.password_salt) {
    const credential = await makeWorkspacePassword(DEFAULT_WORKSPACE_PASSWORD);
    await d1
      .prepare(
        "UPDATE workspaces SET password_hash = ?, password_salt = ?, updated_at = ? WHERE id = ?"
      )
      .bind(credential.hash, credential.salt, now, DEFAULT_WORKSPACE_ID)
      .run();
  }
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
  await ensureDefaultWorkspacePassword();
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

export function workspaceIdFromRequest(request: Request, payload?: { workspaceId?: unknown }) {
  const url = new URL(request.url);
  return (
    normalizeWorkspaceId(request.headers.get("x-workspace-id")) ||
    normalizeWorkspaceId(url.searchParams.get("workspaceId")) ||
    normalizeWorkspaceId(payload?.workspaceId) ||
    DEFAULT_WORKSPACE_ID
  );
}

export { normalizeWorkspaceId };

// The board password is now a join code: it proves someone belongs to the
// team when they ask to join. Day-to-day access uses personal accounts
// (see auth-store.ts / requireWorkspaceAccess).
export async function verifyBoardPassword(workspace: WorkspaceRow, password: string) {
  if (!workspace.password_hash || !workspace.password_salt) {
    return true;
  }

  if (!password) {
    return false;
  }

  return (
    (await hashWorkspacePassword(password, workspace.password_salt)) ===
    workspace.password_hash
  );
}
