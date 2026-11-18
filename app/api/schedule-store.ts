import { getD1 } from "../../db";
import {
  parseActionItems,
  type CalendarEvent,
  type EventCategory,
  type MeetingMinutes,
  type MinutesAcknowledgment,
} from "../lib/schedule";
import { parseItemIds } from "../lib/team";

// Row mappers and small queries for 업무일정 and 회의록. Tables are created in
// team-store.ts (prepareTeamTables) with the rest of the team schema.

export type EventRow = {
  id: number;
  workspace_id: string;
  title: string;
  category: string;
  start_date: string;
  end_date: string;
  all_day: number;
  start_time: string | null;
  end_time: string | null;
  location: string;
  description: string;
  attendee_ids: string;
  reminder_minutes: number | null;
  created_by_member_id: number;
  created_by_name: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
};

export type MinutesRow = {
  id: number;
  workspace_id: string;
  title: string;
  meeting_date: string;
  start_time: string | null;
  end_time: string | null;
  location: string;
  attendee_ids: string;
  guests: string;
  agenda: string;
  content: string;
  decisions: string;
  action_items: string;
  event_id: number | null;
  author_member_id: number;
  author_name: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
};

export function toEvent(row: EventRow): CalendarEvent {
  return {
    id: row.id,
    title: row.title,
    category: row.category as EventCategory,
    startDate: row.start_date,
    endDate: row.end_date,
    allDay: row.all_day === 1,
    startTime: row.start_time,
    endTime: row.end_time,
    location: row.location,
    description: row.description,
    attendeeIds: parseItemIds(row.attendee_ids),
    reminderMinutes: row.reminder_minutes,
    createdByMemberId: row.created_by_member_id,
    createdByName: row.created_by_name,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toMinutes(
  row: MinutesRow,
  preview = false,
  acknowledgments: MinutesAcknowledgment[] = []
): MeetingMinutes {
  return {
    id: row.id,
    title: row.title,
    meetingDate: row.meeting_date,
    startTime: row.start_time,
    endTime: row.end_time,
    location: row.location,
    attendeeIds: parseItemIds(row.attendee_ids),
    guests: row.guests,
    agenda: preview ? "" : row.agenda,
    content: preview ? row.content.slice(0, 160) : row.content,
    decisions: preview ? row.decisions.slice(0, 160) : row.decisions,
    actionItems: parseActionItems(row.action_items),
    eventId: row.event_id,
    acknowledgments,
    authorMemberId: row.author_member_id,
    authorName: row.author_name,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Events overlapping [from, to]; empty when the table doesn't exist yet. */
export async function eventsBetween(workspaceId: string, from: string, to: string) {
  try {
    const rows = await getD1()
      .prepare(
        `SELECT * FROM calendar_events
         WHERE workspace_id = ? AND start_date <= ? AND end_date >= ?
         ORDER BY start_date, all_day DESC, start_time, id LIMIT 2000`
      )
      .bind(workspaceId, to, from)
      .all<EventRow>();
    return (rows.results ?? []).map(toEvent);
  } catch {
    return [];
  }
}

/** Read confirmations grouped by minutes id. */
export async function minutesAcknowledgments(workspaceId: string, minutesId?: number) {
  const rows = await getD1()
    .prepare(
      `SELECT minutes_id, member_id, member_name, acknowledged_at FROM meeting_minutes_reads
       WHERE workspace_id = ? ${minutesId ? "AND minutes_id = ?" : ""}
       ORDER BY acknowledged_at`
    )
    .bind(...(minutesId ? [workspaceId, minutesId] : [workspaceId]))
    .all<{ minutes_id: number; member_id: number; member_name: string; acknowledged_at: string }>();
  const grouped = new Map<number, MinutesAcknowledgment[]>();
  for (const row of rows.results ?? []) {
    grouped.set(row.minutes_id, [
      ...(grouped.get(row.minutes_id) ?? []),
      { memberId: row.member_id, memberName: row.member_name, acknowledgedAt: row.acknowledged_at },
    ]);
  }
  return grouped;
}
