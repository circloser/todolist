// 업무일정(shared calendar) and 회의록(meeting minutes): types and pure
// helpers shared by the API routes and the views. Dates are Korean calendar
// days ("YYYY-MM-DD") and times are Korean wall-clock ("HH:MM").

import { daysBetween, normalizeLogDate, shiftDate } from "./team";

// ------------------------------------------------------------------ events

export type EventCategory = "meeting" | "field" | "trip" | "training" | "leave" | "deadline" | "etc";

export const EVENT_CATEGORIES: Array<{ key: EventCategory; label: string; color: string; soft: string }> = [
  { key: "meeting", label: "회의", color: "#2563eb", soft: "#e8eefc" },
  { key: "field", label: "현장", color: "#18786f", soft: "#e4f2ef" },
  { key: "trip", label: "출장", color: "#8a5b8f", soft: "#f3e9f5" },
  { key: "training", label: "교육", color: "#b66d12", soft: "#fff4df" },
  { key: "leave", label: "휴가", color: "#6f7b2d", soft: "#eef2dc" },
  { key: "deadline", label: "마감", color: "#c44232", soft: "#fbecea" },
  { key: "etc", label: "기타", color: "#5d6b65", soft: "#eef1ee" },
];

export function categoryOf(key: string) {
  return EVENT_CATEGORIES.find((category) => category.key === key) ?? EVENT_CATEGORIES[EVENT_CATEGORIES.length - 1];
}

export const REMINDER_CHOICES: Array<{ minutes: number | null; label: string }> = [
  { minutes: null, label: "알림 없음" },
  { minutes: 0, label: "시작할 때" },
  { minutes: 10, label: "10분 전" },
  { minutes: 30, label: "30분 전" },
  { minutes: 60, label: "1시간 전" },
  { minutes: 1440, label: "하루 전" },
];

export type CalendarEvent = {
  id: number;
  title: string;
  category: EventCategory;
  startDate: string;
  endDate: string;
  allDay: boolean;
  startTime: string | null;
  endTime: string | null;
  location: string;
  description: string;
  /** Members expected to attend; empty means the whole team. */
  attendeeIds: number[];
  reminderMinutes: number | null;
  createdByMemberId: number;
  createdByName: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
};

export type EventsResponse = {
  events?: CalendarEvent[];
  event?: CalendarEvent | null;
  error?: string;
};

export const EVENT_RANGE_MAX_DAYS = 400;

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function normalizeTime(value: unknown) {
  return typeof value === "string" && TIME_PATTERN.test(value.trim()) ? value.trim() : null;
}

function cleanText(value: unknown, max: number) {
  return typeof value === "string" ? value.replace(/\r\n?/g, "\n").trim().slice(0, max) : "";
}

function cleanIds(value: unknown, max = 50) {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value.map(Number).filter((id) => Number.isInteger(id) && id > 0))].slice(0, max);
}

export type EventInput = Pick<
  CalendarEvent,
  | "title"
  | "category"
  | "startDate"
  | "endDate"
  | "allDay"
  | "startTime"
  | "endTime"
  | "location"
  | "description"
  | "attendeeIds"
  | "reminderMinutes"
>;

export function normalizeEventInput(raw: Record<string, unknown>): { value: EventInput } | { error: string } {
  const title = cleanText(raw.title, 120);
  if (!title) {
    return { error: "일정 제목을 입력해 주세요." };
  }

  const startDate = normalizeLogDate(raw.startDate);
  if (!startDate) {
    return { error: "시작 날짜를 확인해 주세요." };
  }
  const endDate = normalizeLogDate(raw.endDate) ?? startDate;
  if (endDate < startDate) {
    return { error: "종료 날짜가 시작 날짜보다 빠릅니다." };
  }
  if (daysBetween(startDate, endDate) > 366) {
    return { error: "일정 기간은 1년을 넘을 수 없습니다." };
  }

  const allDay = raw.allDay !== false;
  const startTime = allDay ? null : normalizeTime(raw.startTime);
  const endTime = allDay ? null : normalizeTime(raw.endTime);
  if (!allDay && !startTime) {
    return { error: "시작 시간을 입력하거나 '종일'로 지정해 주세요." };
  }
  if (!allDay && startTime && endTime && startDate === endDate && endTime < startTime) {
    return { error: "종료 시간이 시작 시간보다 빠릅니다." };
  }

  const category = EVENT_CATEGORIES.some((entry) => entry.key === raw.category)
    ? (raw.category as EventCategory)
    : "etc";
  const reminder =
    raw.reminderMinutes === null || raw.reminderMinutes === undefined || raw.reminderMinutes === ""
      ? null
      : Number(raw.reminderMinutes);

  return {
    value: {
      title,
      category,
      startDate,
      endDate,
      allDay,
      startTime,
      endTime,
      location: cleanText(raw.location, 120),
      description: cleanText(raw.description, 2000),
      attendeeIds: cleanIds(raw.attendeeIds),
      reminderMinutes:
        reminder !== null && Number.isInteger(reminder) && reminder >= 0 && reminder <= 10080 ? reminder : null,
    },
  };
}

export function eventOnDay(event: Pick<CalendarEvent, "startDate" | "endDate">, date: string) {
  return event.startDate <= date && date <= event.endDate;
}

/** Events touching `date`: all-day first, then by start time, then title. */
export function eventsOnDay<T extends CalendarEvent>(events: T[], date: string) {
  return events
    .filter((event) => eventOnDay(event, date))
    .sort(
      (first, second) =>
        Number(first.allDay === false) - Number(second.allDay === false) ||
        (first.startTime ?? "").localeCompare(second.startTime ?? "") ||
        first.title.localeCompare(second.title, "ko-KR")
    );
}

export function eventTimeLabel(event: Pick<CalendarEvent, "allDay" | "startTime" | "endTime" | "startDate" | "endDate">) {
  const span = event.startDate === event.endDate ? "" : `${shortMd(event.startDate)}~${shortMd(event.endDate)} `;
  if (event.allDay || !event.startTime) {
    return `${span}종일`.trim();
  }
  return `${span}${event.startTime}${event.endTime ? `~${event.endTime}` : ""}`;
}

function shortMd(date: string) {
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
}

/** Epoch ms of the event start in Korea (UTC+9). */
export function eventStartMs(event: Pick<CalendarEvent, "startDate" | "startTime" | "allDay">) {
  const [year, month, day] = event.startDate.split("-").map(Number);
  const [hour, minute] = (event.allDay || !event.startTime ? "09:00" : event.startTime).split(":").map(Number);
  return Date.UTC(year, month - 1, day, hour - 9, minute);
}

/** When to pop the reminder (all-day events count from 09:00), or null. */
export function reminderAtMs(event: Pick<CalendarEvent, "startDate" | "startTime" | "allDay" | "reminderMinutes">) {
  return event.reminderMinutes === null ? null : eventStartMs(event) - event.reminderMinutes * 60_000;
}

/** Whether `memberId` should be reminded: attendees, or everyone when none were picked. */
export function remindsMember(event: Pick<CalendarEvent, "attendeeIds">, memberId: number | null) {
  return event.attendeeIds.length === 0 || (memberId !== null && event.attendeeIds.includes(memberId));
}

/** Sunday-start calendar weeks covering `month` ("YYYY-MM"). */
export function monthWeeks(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const first = `${month}-01`;
  const weekday = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
  const last = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
  const weeks: string[][] = [];
  for (let start = shiftDate(first, -weekday); start <= last; start = shiftDate(start, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, index) => shiftDate(start, index)));
  }
  return weeks;
}

export function addMonths(month: string, count: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + count, 1));
  return date.toISOString().slice(0, 7);
}

// Korean public holidays (incl. substitute holidays) for the years this
// board is used in. Lunar holidays are listed by their solar dates.
export const KOREAN_HOLIDAYS: Record<string, string> = {
  "2026-01-01": "신정",
  "2026-02-16": "설날 연휴",
  "2026-02-17": "설날",
  "2026-02-18": "설날 연휴",
  "2026-03-01": "삼일절",
  "2026-03-02": "대체공휴일",
  "2026-05-05": "어린이날",
  "2026-05-24": "부처님오신날",
  "2026-05-25": "대체공휴일",
  "2026-06-03": "지방선거일",
  "2026-06-06": "현충일",
  "2026-08-15": "광복절",
  "2026-08-17": "대체공휴일",
  "2026-09-24": "추석 연휴",
  "2026-09-25": "추석",
  "2026-09-26": "추석 연휴",
  "2026-10-03": "개천절",
  "2026-10-05": "대체공휴일",
  "2026-10-09": "한글날",
  "2026-12-25": "성탄절",
  "2027-01-01": "신정",
  "2027-02-06": "설날 연휴",
  "2027-02-07": "설날",
  "2027-02-08": "설날 연휴",
  "2027-02-09": "대체공휴일",
  "2027-03-01": "삼일절",
  "2027-05-05": "어린이날",
  "2027-05-13": "부처님오신날",
  "2027-06-06": "현충일",
  "2027-08-15": "광복절",
  "2027-08-16": "대체공휴일",
  "2027-09-14": "추석 연휴",
  "2027-09-15": "추석",
  "2027-09-16": "추석 연휴",
  "2027-10-03": "개천절",
  "2027-10-04": "대체공휴일",
  "2027-10-09": "한글날",
  "2027-10-11": "대체공휴일",
  "2027-12-25": "성탄절",
  "2027-12-27": "대체공휴일",
};

/** Plain-text lines of a day's events for the morning webhook digest. */
export function scheduleDigestLines(events: CalendarEvent[], date: string) {
  const today = eventsOnDay(events, date);
  if (!today.length) {
    return [];
  }
  return [
    `📅 오늘 일정 ${today.length}건`,
    ...today.map(
      (event) =>
        `  · [${categoryOf(event.category).label}] ${eventTimeLabel(event)} ${event.title}${
          event.location ? ` @${event.location}` : ""
        }`
    ),
  ];
}

// ----------------------------------------------------------- 회의록

export type ActionItem = {
  text: string;
  ownerId: number | null;
  ownerName: string;
  dueDate: string | null;
  done: boolean;
};

export type MinutesAcknowledgment = {
  memberId: number;
  memberName: string;
  acknowledgedAt: string;
};

export type MeetingMinutes = {
  id: number;
  title: string;
  meetingDate: string;
  startTime: string | null;
  endTime: string | null;
  location: string;
  attendeeIds: number[];
  /** Attendees from outside the board, free text. */
  guests: string;
  agenda: string;
  content: string;
  decisions: string;
  actionItems: ActionItem[];
  eventId: number | null;
  /** Members who missed the meeting and confirmed they read the minutes. */
  acknowledgments: MinutesAcknowledgment[];
  authorMemberId: number;
  authorName: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
};

export type MinutesResponse = {
  minutes?: MeetingMinutes[];
  minute?: MeetingMinutes | null;
  error?: string;
};

export type MinutesInput = Pick<
  MeetingMinutes,
  | "title"
  | "meetingDate"
  | "startTime"
  | "endTime"
  | "location"
  | "attendeeIds"
  | "guests"
  | "agenda"
  | "content"
  | "decisions"
  | "actionItems"
  | "eventId"
>;

export function normalizeActionItems(value: unknown, ownerNames: Map<number, string> = new Map()): ActionItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((raw) => (raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}))
    .map((raw) => {
      const ownerId = Number(raw.ownerId);
      const validOwner = Number.isInteger(ownerId) && ownerId > 0 ? ownerId : null;
      return {
        text: cleanText(raw.text, 300),
        ownerId: validOwner,
        ownerName: validOwner !== null ? ownerNames.get(validOwner) ?? cleanText(raw.ownerName, 40) : cleanText(raw.ownerName, 40),
        dueDate: normalizeLogDate(raw.dueDate),
        done: raw.done === true,
      };
    })
    .filter((item) => item.text)
    .slice(0, 40);
}

export function parseActionItems(raw: string | null | undefined) {
  try {
    return normalizeActionItems(JSON.parse(raw ?? "[]"));
  } catch {
    return [];
  }
}

export function normalizeMinutesInput(
  raw: Record<string, unknown>,
  ownerNames?: Map<number, string>
): { value: MinutesInput } | { error: string } {
  const title = cleanText(raw.title, 160);
  if (!title) {
    return { error: "회의 제목을 입력해 주세요." };
  }
  const meetingDate = normalizeLogDate(raw.meetingDate);
  if (!meetingDate) {
    return { error: "회의 날짜를 확인해 주세요." };
  }
  const attendeeIds = cleanIds(raw.attendeeIds);
  if (!attendeeIds.length) {
    return { error: "참석한 구성원을 한 명 이상 선택해 주세요." };
  }
  const eventId = Number(raw.eventId);
  return {
    value: {
      title,
      meetingDate,
      startTime: normalizeTime(raw.startTime),
      endTime: normalizeTime(raw.endTime),
      location: cleanText(raw.location, 120),
      attendeeIds,
      guests: cleanText(raw.guests, 300),
      agenda: cleanText(raw.agenda, 4000),
      content: cleanText(raw.content, 20000),
      decisions: cleanText(raw.decisions, 4000),
      actionItems: normalizeActionItems(raw.actionItems, ownerNames),
      eventId: Number.isInteger(eventId) && eventId > 0 ? eventId : null,
    },
  };
}

/** Open action items assigned to `memberId`, due within `withinDays` (or overdue). */
export function myOpenActions(
  minutes: Pick<MeetingMinutes, "id" | "title" | "actionItems">[],
  memberId: number | null,
  today: string,
  withinDays = 3
) {
  if (memberId === null) {
    return [];
  }
  return minutes.flatMap((minute) =>
    minute.actionItems
      .filter(
        (item) =>
          !item.done &&
          item.ownerId === memberId &&
          item.dueDate !== null &&
          daysBetween(today, item.dueDate) <= withinDays
      )
      .map((item) => ({ minutesId: minute.id, minutesTitle: minute.title, ...item }))
  );
}

/**
 * Attendance and read confirmation for one set of minutes: who attended
 * (board members picked as attendees) and, for every other active member,
 * whether they have confirmed reading the minutes.
 */
export function minutesAudience(
  minute: Pick<MeetingMinutes, "attendeeIds" | "acknowledgments"> & { createdAt?: string },
  members: Array<{ id: number; name: string; active: boolean; createdAt?: string }>
) {
  const byId = new Map(members.map((member) => [member.id, member] as const));
  const acknowledged = new Map(minute.acknowledgments.map((entry) => [entry.memberId, entry] as const));
  const attendees = minute.attendeeIds.map((id) => ({ id, name: byId.get(id)?.name ?? `#${id}` }));
  // People who joined the board after the minutes were written are not asked
  // to confirm them (unless they did anyway).
  const absentees = members
    .filter(
      (member) =>
        member.active &&
        !minute.attendeeIds.includes(member.id) &&
        (acknowledged.has(member.id) || !joinedAfter(member.createdAt, minute.createdAt))
    )
    .map((member) => ({
      id: member.id,
      name: member.name,
      acknowledgedAt: acknowledged.get(member.id)?.acknowledgedAt ?? null,
    }));
  return {
    attendees,
    absentees,
    confirmed: absentees.filter((member) => member.acknowledgedAt).length,
  };
}

function joinedAfter(memberCreatedAt: string | undefined, minutesCreatedAt: string | undefined) {
  return Boolean(memberCreatedAt && minutesCreatedAt && memberCreatedAt > minutesCreatedAt);
}

/** Minutes I missed and have not confirmed yet (in the given order). */
export function unreadMinutesFor<
  T extends Pick<MeetingMinutes, "id" | "attendeeIds" | "acknowledgments"> & { createdAt?: string },
>(minutes: T[], memberId: number | null, memberCreatedAt?: string) {
  if (memberId === null) {
    return [];
  }
  return minutes.filter(
    (minute) =>
      !minute.attendeeIds.includes(memberId) &&
      !minute.acknowledgments.some((entry) => entry.memberId === memberId) &&
      !joinedAfter(memberCreatedAt, minute.createdAt)
  );
}
