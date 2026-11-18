import { getD1 } from "../../../db";
import {
  formatLogDate,
  hasLogContent,
  normalizeItemIds,
  normalizeLogDate,
  normalizeLogRange,
  normalizeLogText,
  WORK_LOG_STATUS_LABEL,
} from "../../lib/team";
import { forbidden, requireWorkspaceAccess, type BoardAccess } from "../auth-store";
import {
  logTeamHistory,
  prepareTeamTables,
  routeError,
  toWorkLog,
  type WorkLogRow,
} from "../team-store";

// 업무일지: one log per member per calendar day (KST).
// - Members write, edit and delete only their own logs, until approved.
// - 부서장 read everyone's logs and approve / return (반려) / reopen them,
//   but never edit someone else's content.

type WorkLogPayload = {
  workspaceId?: string;
  id?: number;
  ids?: unknown[];
  memberId?: number;
  logDate?: string;
  content?: string;
  plan?: string;
  issues?: string;
  itemIds?: unknown[];
  decision?: "approve" | "reject" | "reopen";
  comment?: string;
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

// Other members' logs waiting for this manager's review.
async function pendingReviewCount(access: BoardAccess) {
  if (!access.isManager) {
    return 0;
  }

  const row = await getD1()
    .prepare(
      `SELECT COUNT(*) AS count FROM work_logs
       WHERE workspace_id = ? AND status = 'submitted' AND member_id <> ?`
    )
    .bind(access.workspace.id, access.member.id)
    .first<{ count: number }>();

  return row?.count ?? 0;
}

export async function GET(request: Request) {
  try {
    await prepareTeamTables();
    const access = await requireWorkspaceAccess(request);
    if ("response" in access) {
      return access.response;
    }

    const url = new URL(request.url);
    const onlyPending = url.searchParams.get("status") === "submitted";
    const range = onlyPending
      ? ({ from: "0000-01-01", to: "9999-12-31" } as const)
      : normalizeLogRange(
          url.searchParams.get("from") ?? url.searchParams.get("date"),
          url.searchParams.get("to") ?? url.searchParams.get("date")
        );

    if ("error" in range) {
      return Response.json({ error: range.error }, { status: 400 });
    }

    // Members only ever see their own logs, whatever they ask for.
    const requested = Number(url.searchParams.get("memberId"));
    const memberId = access.isManager
      ? Number.isInteger(requested) && requested > 0
        ? requested
        : null
      : access.member.id;
    const conditions = ["workspace_id = ?", "log_date BETWEEN ? AND ?"];
    const binds: Array<string | number> = [access.workspace.id, range.from, range.to];

    if (memberId !== null) {
      conditions.push("member_id = ?");
      binds.push(memberId);
    }

    if (onlyPending) {
      conditions.push("status = 'submitted'", "member_id <> ?");
      binds.push(access.member.id);
    }

    const rows = await getD1()
      .prepare(
        `SELECT * FROM work_logs WHERE ${conditions.join(" AND ")}
         ORDER BY log_date DESC, member_name LIMIT 500`
      )
      .bind(...binds)
      .all<WorkLogRow>();

    return Response.json({
      logs: (rows.results ?? []).map(toWorkLog),
      pendingReview: await pendingReviewCount(access),
    });
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
    const member = access.member;

    if (payload.memberId !== undefined && Number(payload.memberId) !== member.id) {
      return forbidden("다른 구성원의 업무일지는 작성하거나 수정할 수 없습니다.");
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
        "SELECT id, status FROM work_logs WHERE workspace_id = ? AND member_id = ? AND log_date = ?"
      )
      .bind(workspaceId, member.id, logDate)
      .first<{ id: number; status: string }>();

    if (existed?.status === "approved") {
      return Response.json(
        { error: "승인된 업무일지는 수정할 수 없습니다. 부서장에게 승인 취소를 요청해 주세요." },
        { status: 409 }
      );
    }

    // Saving (re)submits the log for review.
    const row = await getD1()
      .prepare(
        `INSERT INTO work_logs
           (workspace_id, member_id, member_name, log_date, content, plan, issues, item_ids,
            status, reviewer_name, reviewed_at, review_comment, updated_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'submitted', '', NULL, '', ?, ?, ?)
         ON CONFLICT(workspace_id, member_id, log_date) DO UPDATE SET
           member_name = excluded.member_name,
           content = excluded.content,
           plan = excluded.plan,
           issues = excluded.issues,
           item_ids = excluded.item_ids,
           status = 'submitted',
           reviewer_name = '',
           reviewed_at = NULL,
           review_comment = '',
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
        access.actor,
        now,
        now
      )
      .first<WorkLogRow>();

    await logTeamHistory({
      workspaceId,
      entityType: "worklog",
      entityId: row?.id ?? null,
      action: existed ? "update" : "create",
      summary: `${access.actor}님이 ${formatLogDate(logDate)} 업무일지를 ${
        existed ? (existed.status === "rejected" ? "보완해 다시 제출함" : "수정함") : "제출함"
      }`,
      actor: access.actor,
    });

    return Response.json(
      { log: row ? toWorkLog(row) : null },
      { status: existed ? 200 : 201 }
    );
  } catch (error) {
    return routeError(error);
  }
}

// 부서장 review: approve, return with a reason (반려), or reopen (승인 취소).
export async function PATCH(request: Request) {
  try {
    await prepareTeamTables();
    const payload = await readPayload(request);
    const access = await requireWorkspaceAccess(request, payload);
    if ("response" in access) {
      return access.response;
    }
    if (!access.isManager) {
      return forbidden("업무일지 승인은 부서장만 할 수 있습니다.");
    }

    const decision = payload.decision;
    if (decision !== "approve" && decision !== "reject" && decision !== "reopen") {
      return Response.json({ error: "승인, 반려, 승인 취소 중 하나를 선택해 주세요." }, { status: 400 });
    }

    const comment = normalizeLogText(payload.comment).slice(0, 500);
    if (decision === "reject" && !comment) {
      return Response.json({ error: "반려 사유를 입력해 주세요." }, { status: 400 });
    }

    const ids = normalizeItemIds(Array.isArray(payload.ids) ? payload.ids : [payload.id]);
    if (!ids.length) {
      return Response.json({ error: "검토할 업무일지를 선택해 주세요." }, { status: 400 });
    }

    const workspaceId = access.workspace.id;
    const rows = await getD1()
      .prepare(
        `SELECT * FROM work_logs WHERE workspace_id = ? AND id IN (${ids.map(() => "?").join(", ")})`
      )
      .bind(workspaceId, ...ids)
      .all<WorkLogRow>();
    const logs = rows.results ?? [];

    if (logs.some((log) => log.member_id === access.member.id)) {
      return forbidden("본인의 업무일지는 직접 승인할 수 없습니다.");
    }

    const targets = logs.filter((log) =>
      decision === "reopen" ? log.status !== "submitted" : log.status !== "approved" || decision === "reject"
    );

    if (!targets.length) {
      return Response.json({ error: "검토할 수 있는 업무일지가 없습니다." }, { status: 400 });
    }

    const now = new Date().toISOString();
    const status = decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "submitted";
    const d1 = getD1();

    await d1.batch(
      targets.map((log) =>
        d1
          .prepare(
            `UPDATE work_logs
             SET status = ?, reviewer_name = ?, reviewed_at = ?, review_comment = ?
             WHERE id = ?`
          )
          .bind(
            status,
            decision === "reopen" ? "" : access.actor,
            decision === "reopen" ? null : now,
            decision === "reopen" ? "" : comment,
            log.id
          )
      )
    );

    const label = decision === "reopen" ? "승인 취소" : WORK_LOG_STATUS_LABEL[status];
    await logTeamHistory({
      workspaceId,
      entityType: "worklog",
      entityId: targets.length === 1 ? targets[0].id : null,
      action: decision,
      summary:
        targets.length === 1
          ? `${access.actor}님이 ${targets[0].member_name}님의 ${formatLogDate(targets[0].log_date)} 업무일지를 ${label}함`
          : `${access.actor}님이 업무일지 ${targets.length}건을 ${label}함`,
      actor: access.actor,
    });

    const updated = await d1
      .prepare(
        `SELECT * FROM work_logs WHERE id IN (${targets.map(() => "?").join(", ")})`
      )
      .bind(...targets.map((log) => log.id))
      .all<WorkLogRow>();

    return Response.json({
      logs: (updated.results ?? []).map(toWorkLog),
      reviewed: targets.length,
      pendingReview: await pendingReviewCount(access),
    });
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

    if (row.member_id !== access.member.id) {
      return forbidden("다른 구성원의 업무일지는 삭제할 수 없습니다.");
    }

    if (row.status === "approved") {
      return Response.json(
        { error: "승인된 업무일지는 삭제할 수 없습니다." },
        { status: 409 }
      );
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
      summary: `${access.actor}님이 ${formatLogDate(row.log_date)} 업무일지를 삭제함`,
      actor: access.actor,
    });

    return Response.json({ log: null });
  } catch (error) {
    return routeError(error);
  }
}
