import { getD1 } from "../../../db";
import {
  EVENT_RANGE_MAX_DAYS,
  categoryOf,
  eventTimeLabel,
  normalizeEventInput,
  type CalendarEvent,
} from "../../lib/schedule";
import { daysBetween, normalizeLogDate } from "../../lib/team";
import { forbidden, requireWorkspaceAccess, type BoardAccess } from "../auth-store";
import { eventsBetween, toEvent, type EventRow } from "../schedule-store";
import { listMembers, logTeamHistory, prepareTeamTables, routeError } from "../team-store";

// 업무일정: a calendar shared by the whole board. Every member can add events
// and everyone sees all of them; only the creator or a 부서장 may change or
// delete an event.

async function readPayload(request: Request) {
  return (await request.json().catch(() => ({}))) as Record<string, unknown> & { id?: unknown };
}

async function findEvent(workspaceId: string, id: unknown) {
  const eventId = Number(id);
  if (!Number.isInteger(eventId)) {
    return null;
  }
  return await getD1()
    .prepare("SELECT * FROM calendar_events WHERE workspace_id = ? AND id = ?")
    .bind(workspaceId, eventId)
    .first<EventRow>();
}

/** Attendees must be members of this board. */
async function boardAttendeeIds(workspaceId: string, ids: number[]) {
  if (!ids.length) {
    return ids;
  }
  const known = new Set((await listMembers(workspaceId)).map((member) => member.id));
  return ids.filter((id) => known.has(id));
}

function editDenied(access: BoardAccess, row: EventRow) {
  return access.isManager || row.created_by_member_id === access.member.id
    ? null
    : forbidden("일정은 등록한 사람 또는 부서장만 수정·삭제할 수 있습니다.");
}

function describe(event: Pick<CalendarEvent, "title" | "category" | "startDate" | "endDate" | "allDay" | "startTime" | "endTime">) {
  return `[${categoryOf(event.category).label}] ${event.title} (${event.startDate} ${eventTimeLabel(event)})`;
}

export async function GET(request: Request) {
  try {
    await prepareTeamTables();
    const access = await requireWorkspaceAccess(request);
    if ("response" in access) {
      return access.response;
    }

    const url = new URL(request.url);
    const changedSince = url.searchParams.get("changedSince");
    const id = url.searchParams.get("id");

    if (id) {
      const row = await findEvent(access.workspace.id, id);
      return row
        ? Response.json({ event: toEvent(row) })
        : Response.json({ error: "일정을 찾을 수 없습니다." }, { status: 404 });
    }

    // Recently added/changed events (for "새 일정" notifications).
    if (changedSince) {
      const since = Number.isNaN(Date.parse(changedSince)) ? new Date(0).toISOString() : changedSince;
      const rows = await getD1()
        .prepare(
          "SELECT * FROM calendar_events WHERE workspace_id = ? AND updated_at > ? ORDER BY updated_at DESC LIMIT 50"
        )
        .bind(access.workspace.id, since)
        .all<EventRow>();
      return Response.json({ events: (rows.results ?? []).map(toEvent) });
    }

    const from = normalizeLogDate(url.searchParams.get("from"));
    const to = normalizeLogDate(url.searchParams.get("to")) ?? from;
    if (!from || !to || to < from) {
      return Response.json({ error: "조회 기간을 확인해 주세요." }, { status: 400 });
    }
    if (daysBetween(from, to) > EVENT_RANGE_MAX_DAYS) {
      return Response.json({ error: `한 번에 ${EVENT_RANGE_MAX_DAYS}일까지만 조회할 수 있습니다.` }, { status: 400 });
    }

    return Response.json({ events: await eventsBetween(access.workspace.id, from, to) });
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

    const input = normalizeEventInput(payload);
    if ("error" in input) {
      return Response.json({ error: input.error }, { status: 400 });
    }

    const value = {
      ...input.value,
      attendeeIds: await boardAttendeeIds(access.workspace.id, input.value.attendeeIds),
    };
    const now = new Date().toISOString();
    const row = await getD1()
      .prepare(
        `INSERT INTO calendar_events
           (workspace_id, title, category, start_date, end_date, all_day, start_time, end_time, location,
            description, attendee_ids, reminder_minutes, created_by_member_id, created_by_name, updated_by,
            created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING *`
      )
      .bind(
        access.workspace.id,
        value.title,
        value.category,
        value.startDate,
        value.endDate,
        value.allDay ? 1 : 0,
        value.startTime,
        value.endTime,
        value.location,
        value.description,
        JSON.stringify(value.attendeeIds),
        value.reminderMinutes,
        access.member.id,
        access.actor,
        access.actor,
        now,
        now
      )
      .first<EventRow>();

    await logTeamHistory({
      workspaceId: access.workspace.id,
      entityType: "event",
      entityId: row?.id ?? null,
      action: "create",
      summary: `${access.actor}님이 일정 ${describe(value)}을 등록함`,
      actor: access.actor,
    });

    return Response.json({ event: row ? toEvent(row) : null }, { status: 201 });
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

    const current = await findEvent(access.workspace.id, payload.id);
    if (!current) {
      return Response.json({ error: "일정을 찾을 수 없습니다." }, { status: 404 });
    }
    const denied = editDenied(access, current);
    if (denied) {
      return denied;
    }

    const merged = { ...toEvent(current), ...payload };
    const input = normalizeEventInput(merged as Record<string, unknown>);
    if ("error" in input) {
      return Response.json({ error: input.error }, { status: 400 });
    }

    const value = {
      ...input.value,
      attendeeIds: await boardAttendeeIds(access.workspace.id, input.value.attendeeIds),
    };
    const row = await getD1()
      .prepare(
        `UPDATE calendar_events
         SET title = ?, category = ?, start_date = ?, end_date = ?, all_day = ?, start_time = ?, end_time = ?,
             location = ?, description = ?, attendee_ids = ?, reminder_minutes = ?, updated_by = ?, updated_at = ?
         WHERE workspace_id = ? AND id = ?
         RETURNING *`
      )
      .bind(
        value.title,
        value.category,
        value.startDate,
        value.endDate,
        value.allDay ? 1 : 0,
        value.startTime,
        value.endTime,
        value.location,
        value.description,
        JSON.stringify(value.attendeeIds),
        value.reminderMinutes,
        access.actor,
        new Date().toISOString(),
        access.workspace.id,
        current.id
      )
      .first<EventRow>();

    await logTeamHistory({
      workspaceId: access.workspace.id,
      entityType: "event",
      entityId: current.id,
      action: "update",
      summary: `${access.actor}님이 일정 ${describe(value)}을 수정함`,
      actor: access.actor,
    });

    return Response.json({ event: row ? toEvent(row) : null });
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

    const current = await findEvent(access.workspace.id, payload.id);
    if (!current) {
      return Response.json({ error: "일정을 찾을 수 없습니다." }, { status: 404 });
    }
    const denied = editDenied(access, current);
    if (denied) {
      return denied;
    }

    await getD1()
      .prepare("DELETE FROM calendar_events WHERE workspace_id = ? AND id = ?")
      .bind(access.workspace.id, current.id)
      .run();
    await logTeamHistory({
      workspaceId: access.workspace.id,
      entityType: "event",
      entityId: current.id,
      action: "delete",
      summary: `${access.actor}님이 일정 ${describe(toEvent(current))}을 삭제함`,
      actor: access.actor,
    });

    return Response.json({ event: null });
  } catch (error) {
    return routeError(error);
  }
}
