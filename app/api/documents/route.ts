import { getD1 } from "../../../db";
import {
  DEFAULT_WORKSPACE_ID,
  ensureWorkspaceTables,
  requireWorkspaceAccess,
} from "../workspace-auth";

// Shared document templates (기안문 양식 등): small office files stored as
// D1 blobs so no extra storage infrastructure is needed. Uploads are capped
// well below D1's per-row limits.

type DocumentRow = {
  id: number;
  workspace_id: string;
  name: string;
  filename: string;
  mime_type: string;
  size: number;
  uploaded_by: string;
  updated_at: string;
  created_at: string;
};

// Bound by the platform's ~1MB request/parameter ceiling (verified: 1000KB
// round-trips, 1100KB is rejected upstream with 413).
const MAX_FILE_BYTES = 1_000_000;
const ALLOWED_EXTENSIONS = [".hwp", ".hwpx", ".doc", ".docx", ".pdf", ".xlsx"];

let documentsReady = false;

async function prepareDocuments() {
  if (documentsReady) {
    return;
  }

  await getD1()
    .prepare(`CREATE TABLE IF NOT EXISTS document_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workspace_id TEXT NOT NULL DEFAULT '${DEFAULT_WORKSPACE_ID}',
      name TEXT NOT NULL,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
      size INTEGER NOT NULL,
      data BLOB NOT NULL,
      uploaded_by TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`)
    .run();
  await ensureWorkspaceTables({
    defaultTeamName: "습지복원팀",
    defaultBoardTitle: "Workflow Command Center",
  });
  documentsReady = true;
}

function toDocument(row: DocumentRow) {
  return {
    id: row.id,
    name: row.name,
    filename: row.filename,
    mimeType: row.mime_type,
    size: row.size,
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
  };
}

async function listDocuments(workspaceId: string) {
  const rows = await getD1()
    .prepare(
      `SELECT id, name, filename, mime_type, size, uploaded_by, updated_at, created_at
       FROM document_templates WHERE workspace_id = ? ORDER BY created_at DESC, id DESC`
    )
    .bind(workspaceId)
    .all<DocumentRow>();

  return (rows.results ?? []).map(toDocument);
}

// The history table belongs to the tasks route's schema; it may not exist yet
// on a fresh database, so document history is best-effort only.
async function logDocumentHistory(
  workspaceId: string,
  summary: string,
  actor: string
) {
  try {
    await getD1()
      .prepare(
        `INSERT INTO workflow_history (workspace_id, item_id, entity_type, entity_id, action, summary, actor, created_at)
         VALUES (?, NULL, 'document', NULL, 'update', ?, ?, ?)`
      )
      .bind(workspaceId, summary, actor, new Date().toISOString())
      .run();
  } catch {
    // ignore — history is non-essential here
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected error";
}

export async function GET(request: Request) {
  try {
    await prepareDocuments();
    const access = await requireWorkspaceAccess(request);
    if ("response" in access) {
      return access.response;
    }
    const workspaceId = access.workspace.id;

    const url = new URL(request.url);
    const id = Number(url.searchParams.get("id"));

    if (Number.isFinite(id) && id > 0) {
      const row = await getD1()
        .prepare("SELECT * FROM document_templates WHERE id = ? AND workspace_id = ?")
        .bind(id, workspaceId)
        .first<DocumentRow & { data: ArrayBuffer | number[] }>();

      if (!row) {
        return Response.json({ error: "양식을 찾을 수 없습니다." }, { status: 404 });
      }

      // D1 returns BLOBs as ArrayBuffer; tolerate a number[] representation
      // too so a driver change can't silently corrupt downloads.
      const bytes =
        row.data instanceof ArrayBuffer
          ? row.data
          : new Uint8Array(row.data as unknown as number[]).buffer;
      const encodedFilename = encodeURIComponent(row.filename).replaceAll(
        "'",
        "%27"
      );

      return new Response(bytes, {
        headers: {
          "Content-Type": row.mime_type || "application/octet-stream",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodedFilename}`,
          "Content-Length": String(row.size),
          "Cache-Control": "private, no-store",
        },
      });
    }

    return Response.json({ documents: await listDocuments(workspaceId) });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await prepareDocuments();
    const access = await requireWorkspaceAccess(request);
    if ("response" in access) {
      return access.response;
    }
    const workspaceId = access.workspace.id;

    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File) || !file.name) {
      return Response.json({ error: "업로드할 파일을 선택해 주세요." }, { status: 400 });
    }

    const lowerName = file.name.toLowerCase();

    if (!ALLOWED_EXTENSIONS.some((extension) => lowerName.endsWith(extension))) {
      return Response.json(
        { error: `허용된 형식이 아닙니다 (${ALLOWED_EXTENSIONS.join(", ")}).` },
        { status: 400 }
      );
    }

    if (!file.size) {
      return Response.json({ error: "빈 파일은 업로드할 수 없습니다." }, { status: 400 });
    }

    if (file.size > MAX_FILE_BYTES) {
      return Response.json(
        { error: "파일이 너무 큽니다 (최대 1MB)." },
        { status: 400 }
      );
    }

    const nameField = form.get("name");
    const name =
      (typeof nameField === "string" ? nameField.trim().slice(0, 80) : "") ||
      file.name;
    const actorField = form.get("actor");
    const actor =
      (typeof actorField === "string" ? actorField.trim().slice(0, 80) : "") ||
      "사용자";
    const now = new Date().toISOString();

    await getD1()
      .prepare(
        `INSERT INTO document_templates (workspace_id, name, filename, mime_type, size, data, uploaded_by, updated_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        workspaceId,
        name,
        file.name.slice(0, 200),
        file.type || "application/octet-stream",
        file.size,
        await file.arrayBuffer(),
        actor,
        now,
        now
      )
      .run();

    await logDocumentHistory(
      workspaceId,
      `${actor}님이 '${name}' 양식을 업로드함`,
      actor
    );

    return Response.json(
      { documents: await listDocuments(workspaceId) },
      { status: 201 }
    );
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    await prepareDocuments();

    const payload = (await request.json().catch(() => ({}))) as {
      id?: number;
      actor?: string;
      workspaceId?: string;
      workspacePassword?: string;
    };
    const access = await requireWorkspaceAccess(request, payload);
    if ("response" in access) {
      return access.response;
    }
    const workspaceId = access.workspace.id;
    const id = Number(payload.id);

    if (!Number.isFinite(id)) {
      return Response.json({ error: "삭제할 양식을 선택해 주세요." }, { status: 400 });
    }

    const row = await getD1()
      .prepare("SELECT name FROM document_templates WHERE id = ? AND workspace_id = ?")
      .bind(id, workspaceId)
      .first<{ name: string }>();

    if (!row) {
      return Response.json({ error: "양식을 찾을 수 없습니다." }, { status: 404 });
    }

    await getD1()
      .prepare("DELETE FROM document_templates WHERE id = ? AND workspace_id = ?")
      .bind(id, workspaceId)
      .run();

    const actor =
      typeof payload.actor === "string" && payload.actor.trim()
        ? payload.actor.trim().slice(0, 80)
        : "사용자";
    await logDocumentHistory(
      workspaceId,
      `${actor}님이 '${row.name}' 양식을 삭제함`,
      actor
    );

    return Response.json({ documents: await listDocuments(workspaceId) });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
