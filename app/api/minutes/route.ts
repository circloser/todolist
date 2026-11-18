import { getD1 } from "../../../db";
import { normalizeMinutesInput } from "../../lib/schedule";
import { normalizeLogDate } from "../../lib/team";
import { forbidden, requireWorkspaceAccess, type BoardAccess } from "../auth-store";
import { minutesAcknowledgments, toMinutes, type MinutesRow } from "../schedule-store";
import { listMembers, logTeamHistory, prepareTeamTables, routeError } from "../team-store";

// 회의록: shared with the whole board. Any member can write minutes; the author
// or a 부서장 may edit or delete them, and the person an action item is
// assigned to may tick it off. Attendees are board members; everyone who did
// not attend can confirm afterwards that they have read the minutes.

async function readPayload(request: Request) {
  return (await request.json().catch(() => ({}))) as Record<string, unknown>;
}

async function findMinutes(workspaceId: string, id: unknown) {
  const minutesId = Number(id);
  if (!Number.isInteger(minutesId)) {
    return null;
  }
  return await getD1()
    .prepare("SELECT * FROM meeting_minutes WHERE workspace_id = ? AND id = ?")
    .bind(workspaceId, minutesId)
    .first<MinutesRow>();
}

function parseAttendees(row: MinutesRow) {
  return toMinutes(row, true).attendeeIds;
}

function editDenied(access: BoardAccess, row: MinutesRow) {
  return access.isManager || row.author_member_id === access.member.id
    ? null
    : forbidden("회의록은 작성자 또는 부서장만 수정·삭제할 수 있습니다.");
}

async function memberNames(workspaceId: string) {
  return new Map((await listMembers(workspaceId)).map((member) => [member.id, member.name] as const));
}

/** Keeps only ids of this board's members; the minutes need at least one. */
function boardAttendees<T extends { attendeeIds: number[] }>(value: T, names: Map<number, string>) {
  const attendeeIds = value.attendeeIds.filter((id) => names.has(id));
  return attendeeIds.length ? { ...value, attendeeIds } : null;
}

async function withAcknowledgments(workspaceId: string, row: MinutesRow) {
  return toMinutes(row, false, (await minutesAcknowledgments(workspaceId, row.id)).get(row.id) ?? []);
}

export async function GET(request: Request) {
  try {
    await prepareTeamTables();
    const access = await requireWorkspaceAccess(request);
    if ("response" in access) {
      return access.response;
    }

    const url = new URL(request.url);
    const id = url.searchParams.get("id");

    if (id) {
      const row = await findMinutes(access.workspace.id, id);
      return row
        ? Response.json({ minute: await withAcknowledgments(access.workspace.id, row) })
        : Response.json({ error: "회의록을 찾을 수 없습니다." }, { status: 404 });
    }

    // List: newest first, with short previews (open one by id for the full text).
    const from = normalizeLogDate(url.searchParams.get("from")) ?? "0000-01-01";
    const to = normalizeLogDate(url.searchParams.get("to")) ?? "9999-12-31";
    const rows = await getD1()
      .prepare(
        `SELECT * FROM meeting_minutes
         WHERE workspace_id = ? AND meeting_date BETWEEN ? AND ?
         ORDER BY meeting_date DESC, start_time DESC, id DESC LIMIT 500`
      )
      .bind(access.workspace.id, from, to)
      .all<MinutesRow>();

    const acknowledgments = await minutesAcknowledgments(access.workspace.id);
    return Response.json({
      minutes: (rows.results ?? []).map((row) => toMinutes(row, true, acknowledgments.get(row.id) ?? [])),
    });
  } catch (error) {
    return routeError(error);
  }
}

export async function POST(request: Request) {
  try {
    await prepareTeamTables();
    const payload = await readPayload(request);
    const access = await requireWorkspaceAccess(request, payload as { workspaceId?: unknown });
    if ("response" in access) {
      return access.response;
    }

    const names = await memberNames(access.workspace.id);
    const input = normalizeMinutesInput(payload, names);
    if ("error" in input) {
      return Response.json({ error: input.error }, { status: 400 });
    }

    const value = boardAttendees(input.value, names);
    if (!value) {
      return Response.json({ error: "참석한 구성원을 한 명 이상 선택해 주세요." }, { status: 400 });
    }
    const now = new Date().toISOString();
    const row = await getD1()
      .prepare(
        `INSERT INTO meeting_minutes
           (workspace_id, title, meeting_date, start_time, end_time, location, attendee_ids, guests, agenda,
            content, decisions, action_items, event_id, author_member_id, author_name, updated_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING *`
      )
      .bind(
        access.workspace.id,
        value.title,
        value.meetingDate,
        value.startTime,
        value.endTime,
        value.location,
        JSON.stringify(value.attendeeIds),
        value.guests,
        value.agenda,
        value.content,
        value.decisions,
        JSON.stringify(value.actionItems),
        value.eventId,
        access.member.id,
        access.actor,
        access.actor,
        now,
        now
      )
      .first<MinutesRow>();

    await logTeamHistory({
      workspaceId: access.workspace.id,
      entityType: "minutes",
      entityId: row?.id ?? null,
      action: "create",
      summary: `${access.actor}님이 회의록 '${value.title}'(${value.meetingDate})을 작성함`,
      actor: access.actor,
    });

    return Response.json({ minute: row ? toMinutes(row) : null }, { status: 201 });
  } catch (error) {
    return routeError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await prepareTeamTables();
    const payload = await readPayload(request);
    const access = await requireWorkspaceAccess(request, payload as { workspaceId?: unknown });
    if ("response" in access) {
      return access.response;
    }

    const current = await findMinutes(access.workspace.id, payload.id);
    if (!current) {
      return Response.json({ error: "회의록을 찾을 수 없습니다." }, { status: 404 });
    }

    const now = new Date().toISOString();

    // A member who missed the meeting confirms (or withdraws) having read it.
    if (payload.action === "acknowledge") {
      if (parseAttendees(current).includes(access.member.id)) {
        return Response.json({ error: "회의에 참석한 구성원은 확인할 필요가 없습니다." }, { status: 400 });
      }
      const confirm = payload.acknowledged !== false;
      if (confirm) {
        await getD1()
          .prepare(
            `INSERT INTO meeting_minutes_reads (minutes_id, workspace_id, member_id, member_name, acknowledged_at)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT (minutes_id, member_id) DO NOTHING`
          )
          .bind(current.id, access.workspace.id, access.member.id, access.member.name, now)
          .run();
      } else {
        await getD1()
          .prepare("DELETE FROM meeting_minutes_reads WHERE minutes_id = ? AND member_id = ?")
          .bind(current.id, access.member.id)
          .run();
      }
      await logTeamHistory({
        workspaceId: access.workspace.id,
        entityType: "minutes",
        entityId: current.id,
        action: "acknowledge",
        summary: `${access.actor}님이 회의록 '${current.title}'(${current.meeting_date}) 내용을 ${
          confirm ? "확인함" : "확인 취소함"
        }`,
        actor: access.actor,
      });
      return Response.json({ minute: await withAcknowledgments(access.workspace.id, current) });
    }

    // The person an action item is assigned to may mark it done.
    if (payload.action === "toggle-action") {
      const minute = toMinutes(current);
      const index = Number(payload.index);
      const item = minute.actionItems[index];
      if (!item) {
        return Response.json({ error: "할 일을 찾을 수 없습니다." }, { status: 404 });
      }
      if (!access.isManager && current.author_member_id !== access.member.id && item.ownerId !== access.member.id) {
        return forbidden("할 일은 담당자, 작성자 또는 부서장만 완료 처리할 수 있습니다.");
      }
      const actionItems = minute.actionItems.map((entry, position) =>
        position === index ? { ...entry, done: payload.done === true } : entry
      );
      const row = await getD1()
        .prepare(
          "UPDATE meeting_minutes SET action_items = ?, updated_by = ?, updated_at = ? WHERE id = ? RETURNING *"
        )
        .bind(JSON.stringify(actionItems), access.actor, now, current.id)
        .first<MinutesRow>();
      await logTeamHistory({
        workspaceId: access.workspace.id,
        entityType: "minutes",
        entityId: current.id,
        action: "action-item",
        summary: `${access.actor}님이 회의록 '${current.title}'의 할 일 '${item.text}'을 ${
          payload.done === true ? "완료" : "미완료"
        }로 표시함`,
        actor: access.actor,
      });
      return Response.json({ minute: row ? await withAcknowledgments(access.workspace.id, row) : null });
    }

    const denied = editDenied(access, current);
    if (denied) {
      return denied;
    }

    const names = await memberNames(access.workspace.id);
    const input = normalizeMinutesInput({ ...toMinutes(current), ...payload } as Record<string, unknown>, names);
    if ("error" in input) {
      return Response.json({ error: input.error }, { status: 400 });
    }

    const value = boardAttendees(input.value, names);
    if (!value) {
      return Response.json({ error: "참석한 구성원을 한 명 이상 선택해 주세요." }, { status: 400 });
    }
    const row = await getD1()
      .prepare(
        `UPDATE meeting_minutes
         SET title = ?, meeting_date = ?, start_time = ?, end_time = ?, location = ?, attendee_ids = ?, guests = ?,
             agenda = ?, content = ?, decisions = ?, action_items = ?, event_id = ?, updated_by = ?, updated_at = ?
         WHERE workspace_id = ? AND id = ?
         RETURNING *`
      )
      .bind(
        value.title,
        value.meetingDate,
        value.startTime,
        value.endTime,
        value.location,
        JSON.stringify(value.attendeeIds),
        value.guests,
        value.agenda,
        value.content,
        value.decisions,
        JSON.stringify(value.actionItems),
        value.eventId,
        access.actor,
        now,
        access.workspace.id,
        current.id
      )
      .first<MinutesRow>();

    await logTeamHistory({
      workspaceId: access.workspace.id,
      entityType: "minutes",
      entityId: current.id,
      action: "update",
      summary: `${access.actor}님이 회의록 '${value.title}'을 수정함`,
      actor: access.actor,
    });

    // Someone who is now listed as an attendee no longer needs a read confirmation.
    if (value.attendeeIds.length) {
      await getD1()
        .prepare(
          `DELETE FROM meeting_minutes_reads WHERE minutes_id = ? AND member_id IN (${value.attendeeIds
            .map(() => "?")
            .join(", ")})`
        )
        .bind(current.id, ...value.attendeeIds)
        .run();
    }

    return Response.json({ minute: row ? await withAcknowledgments(access.workspace.id, row) : null });
  } catch (error) {
    return routeError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    await prepareTeamTables();
    const payload = await readPayload(request);
    const access = await requireWorkspaceAccess(request, payload as { workspaceId?: unknown });
    if ("response" in access) {
      return access.response;
    }

    const current = await findMinutes(access.workspace.id, payload.id);
    if (!current) {
      return Response.json({ error: "회의록을 찾을 수 없습니다." }, { status: 404 });
    }
    const denied = editDenied(access, current);
    if (denied) {
      return denied;
    }

    await getD1().batch([
      getD1()
        .prepare("DELETE FROM meeting_minutes WHERE workspace_id = ? AND id = ?")
        .bind(access.workspace.id, current.id),
      getD1().prepare("DELETE FROM meeting_minutes_reads WHERE minutes_id = ?").bind(current.id),
    ]);
    await logTeamHistory({
      workspaceId: access.workspace.id,
      entityType: "minutes",
      entityId: current.id,
      action: "delete",
      summary: `${access.actor}님이 회의록 '${current.title}'(${current.meeting_date})을 삭제함`,
      actor: access.actor,
    });

    return Response.json({ minute: null });
  } catch (error) {
    return routeError(error);
  }
}
