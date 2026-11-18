import { getD1 } from "../../../db";
import {
  formatLogDate,
  hasLogContent,
  normalizeItemIds,
  normalizeLogDate,
  normalizeLogRange,
  normalizeLogText,
} from "../../lib/team";
import {
  actorFrom,
  getMember,
  logTeamHistory,
  prepareTeamTables,
  routeError,
  toWorkLog,
  type WorkLogRow,
} from "../team-store";
import { requireWorkspaceAccess } from "../workspace-auth";

// 업무일지: one log per member per calendar day (KST), upserted on save.

type WorkLogPayload = {
  actor?: string;
  workspaceId?: string;
  workspacePassword?: string;
  id?: number;
  memberId?: number;
  logDate?: string;
  content?: string;
  plan?: string;
  issues?: string;
  itemIds?: unknown[];
};

async function readPayload(request: Request) {
  return (await request.json().catch(() => ({}))) as WorkLogPayload;
}

// Only keep links to work items that exist on this board.
async function existingItemIds(workspaceId: string, ids: number[]) {
  if (!ids.length) {
    return [];
  }

  try {
    const rows = await getD1()
      .prepare(
        `SELECT id FROM workflow_items WHERE workspace_id = ? AND id IN (${ids
          .map(() => "?")
          .join(", ")})`
      )
      .bind(workspaceId, ...ids)
      .all<{ id: number }>();
    const found = new Set((rows.results ?? []).map((row) => row.id));
    return ids.filter((id) => found.has(id));
  } catch {
    return [];
  }
}

export async function GET(request: Request) {
  try {
    await prepareTeamTables();
    const access = await requireWorkspaceAccess(request);
    if ("response" in access) {
      return access.response;
    }

    const url = new URL(request.url);
    const range = normalizeLogRange(
      url.searchParams.get("from") ?? url.searchParams.get("date"),
      url.searchParams.get("to") ?? url.searchParams.get("date")
    );

    if ("error" in range) {
      return Response.json({ error: range.error }, { status: 400 });
    }

    const memberId = Number(url.searchParams.get("memberId"));
    const byMember = Number.isInteger(memberId) && memberId > 0;
    const rows = await getD1()
      .prepare(
        `SELECT * FROM work_logs
         WHERE workspace_id = ? AND log_date BETWEEN ? AND ?
         ${byMember ? "AND member_id = ?" : ""}
         ORDER BY log_date DESC, member_name`
      )
      .bind(
        access.workspace.id,
        range.from,
        range.to,
        ...(byMember ? [memberId] : [])
      )
      .all<WorkLogRow>();

    return Response.json({ logs: (rows.results ?? []).map(toWorkLog) });
  } catch (error) {
    return routeError(error);
  }
}

export async function PUT(request: Request) {
  try {
    await prepareTeamTables();
    const payload = await readPayload(request);
    const access = await requireWorkspaceAccess(request, payload);
    if ("response" in access) {
      return access.response;
    }

    const workspaceId = access.workspace.id;
    const actor = actorFrom(request, payload.actor);
    const memberId = Number(payload.memberId);
    const member = Number.isInteger(memberId)
      ? await getMember(workspaceId, memberId)
      : null;

    if (!member) {
      return Response.json(
        { error: "업무일지를 작성할 구성원을 선택해 주세요." },
        { status: 400 }
      );
    }

    const logDate = normalizeLogDate(payload.logDate);

    if (!logDate) {
      return Response.json(
        { error: "날짜를 YYYY-MM-DD 형식으로 입력해 주세요." },
        { status: 400 }
      );
    }

    const draft = {
      content: normalizeLogText(payload.content),
      plan: normalizeLogText(payload.plan),
      issues: normalizeLogText(payload.issues),
      itemIds: await existingItemIds(workspaceId, normalizeItemIds(payload.itemIds)),
    };

    if (!hasLogContent(draft)) {
      return Response.json(
        { error: "업무 내용, 관련 업무, 계획, 특이사항 중 하나 이상 입력해 주세요." },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const existed = await getD1()
      .prepare(
        "SELECT id FROM work_logs WHERE workspace_id = ? AND member_id = ? AND log_date = ?"
      )
      .bind(workspaceId, member.id, logDate)
      .first<{ id: number }>();
    const row = await getD1()
      .prepare(
        `INSERT INTO work_logs
           (workspace_id, member_id, member_name, log_date, content, plan, issues, item_ids, updated_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(workspace_id, member_id, log_date) DO UPDATE SET
           member_name = excluded.member_name,
           content = excluded.content,
           plan = excluded.plan,
           issues = excluded.issues,
           item_ids = excluded.item_ids,
           updated_by = excluded.updated_by,
           updated_at = excluded.updated_at
         RETURNING *`
      )
      .bind(
        workspaceId,
        member.id,
        member.name,
        logDate,
        draft.content,
        draft.plan,
        draft.issues,
        JSON.stringify(draft.itemIds),
        actor,
        now,
        now
      )
      .first<WorkLogRow>();

    await logTeamHistory({
      workspaceId,
      entityType: "worklog",
      entityId: row?.id ?? null,
      action: existed ? "update" : "create",
      summary: `${actor}님이 ${member.name}님의 ${formatLogDate(logDate)} 업무일지를 ${
        existed ? "수정함" : "작성함"
      }`,
      actor,
    });

    return Response.json(
      { log: row ? toWorkLog(row) : null },
      { status: existed ? 200 : 201 }
    );
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    await prepareTeamTables();
    const payload = await readPayload(request);
    const access = await requireWorkspaceAccess(request, payload);
    if ("response" in access) {
      return access.response;
    }

    const workspaceId = access.workspace.id;
    const actor = actorFrom(request, payload.actor);
    const id = Number(payload.id);
    const row = Number.isInteger(id)
      ? await getD1()
          .prepare("SELECT * FROM work_logs WHERE workspace_id = ? AND id = ?")
          .bind(workspaceId, id)
          .first<WorkLogRow>()
      : null;

    if (!row) {
      return Response.json({ error: "업무일지를 찾을 수 없습니다." }, { status: 404 });
    }

    await getD1()
      .prepare("DELETE FROM work_logs WHERE workspace_id = ? AND id = ?")
      .bind(workspaceId, row.id)
      .run();
    await logTeamHistory({
      workspaceId,
      entityType: "worklog",
      entityId: row.id,
      action: "delete",
      summary: `${actor}님이 ${row.member_name}님의 ${formatLogDate(row.log_date)} 업무일지를 삭제함`,
      actor,
    });

    return Response.json({ log: null });
  } catch (error) {
    return routeError(error);
  }
}
