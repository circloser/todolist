import { getD1 } from "../../../db";
import { categoryOf, eventTimeLabel } from "../../lib/schedule";
import {
  likeAllClause,
  parseSearchQuery,
  searchSnippet,
  type SearchField,
  type SearchHit,
} from "../../lib/search";
import { WORK_LOG_STATUS_LABEL, canViewAllLogs } from "../../lib/team";
import { requireWorkspaceAccess } from "../auth-store";
import { toEvent, toMinutes, type EventRow, type MinutesRow } from "../schedule-store";
import { getTeamPolicy, prepareTeamTables, routeError, toWorkLog, type WorkLogRow } from "../team-store";

// 통합 검색 (server part): 업무일정, 회의록, 업무일지 and 양식 of the open
// board. Work items, members and the manual are already in the browser and
// are searched there. 업무일지 follow the same visibility rule as the work-log
// API: without permission to read everyone's logs you only find your own.

const LIMITS = { event: 20, minutes: 20, worklog: 30, document: 10 };

function shortDate(date: string) {
  return `${date.slice(0, 4)}.${Number(date.slice(5, 7))}.${Number(date.slice(8, 10))}`;
}

async function searchEvents(workspaceId: string, terms: string[]): Promise<SearchHit[]> {
  const { clause, binds } = likeAllClause(["title", "location", "description"], terms);
  const rows = await getD1()
    .prepare(`SELECT * FROM calendar_events WHERE workspace_id = ? AND ${clause} ORDER BY start_date DESC, id DESC LIMIT ?`)
    .bind(workspaceId, ...binds, LIMITS.event)
    .all<EventRow>();
  return (rows.results ?? []).map((row) => {
    const event = toEvent(row);
    const fields: SearchField[] = [
      ["제목", event.title],
      ["장소", event.location],
      ["메모", event.description],
    ];
    return {
      kind: "event",
      id: String(event.id),
      title: event.title,
      ...searchSnippet(fields, terms),
      meta: `${categoryOf(event.category).label} · ${shortDate(event.startDate)} ${eventTimeLabel(event)}`,
      target: { eventId: event.id },
    };
  });
}

async function searchMinutes(workspaceId: string, terms: string[]): Promise<SearchHit[]> {
  const { clause, binds } = likeAllClause(
    ["title", "location", "guests", "agenda", "content", "decisions", "action_items", "author_name"],
    terms
  );
  const rows = await getD1()
    .prepare(`SELECT * FROM meeting_minutes WHERE workspace_id = ? AND ${clause} ORDER BY meeting_date DESC, id DESC LIMIT ?`)
    .bind(workspaceId, ...binds, LIMITS.minutes)
    .all<MinutesRow>();
  return (rows.results ?? []).map((row) => {
    const minute = toMinutes(row);
    const fields: SearchField[] = [
      ["회의명", minute.title],
      ["회의 내용", minute.content],
      ["결정 사항", minute.decisions],
      ["안건", minute.agenda],
      ["후속 조치", minute.actionItems.map((item) => `${item.text}${item.ownerName ? ` (${item.ownerName})` : ""}`).join(" · ")],
      ["외부 참석자", minute.guests],
      ["장소", minute.location],
      ["작성자", minute.authorName],
    ];
    return {
      kind: "minutes",
      id: String(minute.id),
      title: minute.title,
      ...searchSnippet(fields, terms),
      meta: `${shortDate(minute.meetingDate)} · 작성 ${minute.authorName}`,
      target: { minutesId: minute.id },
    };
  });
}

async function searchWorkLogs(
  workspaceId: string,
  terms: string[],
  onlyMemberId: number | null
): Promise<SearchHit[]> {
  const { clause, binds } = likeAllClause(["member_name", "content", "plan", "issues", "review_comment"], terms);
  const own = onlyMemberId === null ? "" : "AND member_id = ?";
  const rows = await getD1()
    .prepare(`SELECT * FROM work_logs WHERE workspace_id = ? ${own} AND ${clause} ORDER BY log_date DESC, id DESC LIMIT ?`)
    .bind(workspaceId, ...(onlyMemberId === null ? [] : [onlyMemberId]), ...binds, LIMITS.worklog)
    .all<WorkLogRow>();
  return (rows.results ?? []).map((row) => {
    const log = toWorkLog(row);
    const fields: SearchField[] = [
      ["오늘 한 일", log.content],
      ["다음 계획", log.plan],
      ["특이사항", log.issues],
      ["부서장 의견", log.reviewComment],
      ["작성자", log.memberName],
    ];
    return {
      kind: "worklog",
      id: String(log.id),
      title: `${log.memberName} · ${shortDate(log.logDate)} 업무일지`,
      ...searchSnippet(fields, terms),
      meta: WORK_LOG_STATUS_LABEL[log.status] ?? "",
      target: { memberId: log.memberId, logDate: log.logDate },
    };
  });
}

async function searchDocuments(workspaceId: string, terms: string[]): Promise<SearchHit[]> {
  const { clause, binds } = likeAllClause(["name", "filename", "uploaded_by"], terms);
  try {
    const rows = await getD1()
      .prepare(
        `SELECT id, name, filename, uploaded_by, updated_at FROM document_templates
         WHERE workspace_id = ? AND ${clause} ORDER BY updated_at DESC LIMIT ?`
      )
      .bind(workspaceId, ...binds, LIMITS.document)
      .all<{ id: number; name: string; filename: string; uploaded_by: string; updated_at: string }>();
    return (rows.results ?? []).map((row) => ({
      kind: "document" as const,
      id: String(row.id),
      title: row.name,
      field: "파일",
      snippet: row.filename,
      meta: row.uploaded_by ? `올린 사람 ${row.uploaded_by}` : "",
      target: { documentId: row.id },
    }));
  } catch {
    // The 양식함 table is created on first use.
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
    const query = url.searchParams.get("q") ?? "";
    const terms = parseSearchQuery(query);
    if (!terms.length) {
      return Response.json({ query, hits: [] });
    }

    const workspaceId = access.workspace.id;
    const policy = await getTeamPolicy(workspaceId);
    const seesEveryone = canViewAllLogs(policy, access, { logViewer: access.member.log_viewer === 1 });

    const groups = await Promise.all([
      searchEvents(workspaceId, terms),
      searchMinutes(workspaceId, terms),
      searchWorkLogs(workspaceId, terms, seesEveryone ? null : access.member.id),
      searchDocuments(workspaceId, terms),
    ]);

    return Response.json({ query, hits: groups.flat() });
  } catch (error) {
    return routeError(error);
  }
}
