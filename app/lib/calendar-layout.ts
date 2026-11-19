// 업무일정 layout helpers (pure): multi-day bars in week rows, side-by-side
// timed events in the day/week grid, repeat dates and small date helpers.
// Dates are "YYYY-MM-DD", times "HH:MM" (Korean wall clock).

import { daysBetween, shiftDate } from "./team";

export type LayoutEntry = {
  key: string;
  startDate: string;
  endDate: string;
  allDay: boolean;
  startTime: string | null;
  endTime: string | null;
  title: string;
};

export type WeekSegment<T extends LayoutEntry> = {
  entry: T;
  /** 0-based first column inside the week (or day range). */
  col: number;
  span: number;
  lane: number;
  /** The entry started before / continues after the shown days. */
  before: boolean;
  after: boolean;
};

/** Shown as a bar in the all-day row: all-day or longer than one day. */
export function isBarEntry(entry: Pick<LayoutEntry, "allDay" | "startDate" | "endDate" | "startTime">) {
  return entry.allDay || !entry.startTime || entry.startDate !== entry.endDate;
}

/**
 * Lanes for the entries overlapping `days` (consecutive dates): longer and
 * all-day entries first, then by start time, each in the lowest free lane.
 */
export function weekSegments<T extends LayoutEntry>(entries: T[], days: string[]): WeekSegment<T>[] {
  const first = days[0];
  const last = days[days.length - 1];
  const touching = entries
    .filter((entry) => entry.startDate <= last && entry.endDate >= first)
    .map((entry) => {
      const start = entry.startDate < first ? first : entry.startDate;
      const end = entry.endDate > last ? last : entry.endDate;
      return { entry, col: daysBetween(first, start), span: daysBetween(start, end) + 1 };
    })
    .sort(
      (a, b) =>
        a.col - b.col ||
        b.span - a.span ||
        Number(!isBarEntry(a.entry)) - Number(!isBarEntry(b.entry)) ||
        (a.entry.startTime ?? "").localeCompare(b.entry.startTime ?? "") ||
        a.entry.title.localeCompare(b.entry.title, "ko-KR")
    );
  const lanes: boolean[][] = [];
  return touching.map(({ entry, col, span }) => {
    let lane = 0;
    while (lanes[lane]?.slice(col, col + span).some(Boolean)) {
      lane += 1;
    }
    lanes[lane] ??= new Array(days.length).fill(false);
    for (let index = col; index < col + span; index += 1) {
      lanes[lane][index] = true;
    }
    return { entry, col, span, lane, before: entry.startDate < first, after: entry.endDate > last };
  });
}

/** Per column: how many segments sit in lanes at or past `limit`. */
export function hiddenPerDay<T extends LayoutEntry>(segments: WeekSegment<T>[], dayCount: number, limit: number) {
  const counts = new Array<number>(dayCount).fill(0);
  for (const segment of segments) {
    if (segment.lane >= limit) {
      for (let index = segment.col; index < segment.col + segment.span; index += 1) {
        counts[index] += 1;
      }
    }
  }
  return counts;
}

export function toMinutes(time: string | null | undefined) {
  if (!time) {
    return 0;
  }
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

export function fromMinutes(total: number) {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(total)));
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
}

export function snapMinutes(total: number, step = 15) {
  return Math.round(total / step) * step;
}

/** Minutes the event lasts in the time grid (no end time = 1 hour). */
export function entryDuration(entry: Pick<LayoutEntry, "startTime" | "endTime">) {
  const start = toMinutes(entry.startTime);
  const end = entry.endTime ? toMinutes(entry.endTime) : start + 60;
  return Math.max(15, Math.min(end, 24 * 60) - start);
}

export type TimedBox<T extends LayoutEntry> = { entry: T; start: number; end: number; column: number; columns: number };

/**
 * Timed events of one day placed side by side where they overlap (each
 * cluster of overlapping events shares its column count).
 */
export function timedLayout<T extends LayoutEntry>(entries: T[]): TimedBox<T>[] {
  const boxes = entries
    .map((entry) => {
      const start = toMinutes(entry.startTime);
      return { entry, start, end: start + entryDuration(entry), column: 0, columns: 1 };
    })
    .sort((a, b) => a.start - b.start || b.end - a.end);
  let cluster: typeof boxes = [];
  let clusterEnd = -1;
  const columnsEnd: number[] = [];
  const flush = () => {
    const count = Math.max(1, ...cluster.map((box) => box.column + 1));
    for (const box of cluster) {
      box.columns = count;
    }
    cluster = [];
    columnsEnd.length = 0;
  };
  for (const box of boxes) {
    if (box.start >= clusterEnd && cluster.length) {
      flush();
    }
    let column = columnsEnd.findIndex((end) => end <= box.start);
    if (column === -1) {
      column = columnsEnd.length;
    }
    columnsEnd[column] = box.end;
    box.column = column;
    cluster.push(box);
    clusterEnd = Math.max(clusterEnd, box.end);
  }
  flush();
  return boxes;
}

/** Sunday of the week holding `date`. */
export function weekStart(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return shiftDate(date, -new Date(Date.UTC(year, month - 1, day)).getUTCDay());
}

export function datesBetween(from: string, to: string) {
  const [start, end] = from <= to ? [from, to] : [to, from];
  return Array.from({ length: daysBetween(start, end) + 1 }, (_, index) => shiftDate(start, index));
}

export function weekdayOf(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export type RepeatFreq = "none" | "daily" | "weekdays" | "weekly" | "biweekly" | "monthly";

export const REPEAT_CHOICES: Array<{ key: RepeatFreq; label: string }> = [
  { key: "none", label: "반복 안 함" },
  { key: "daily", label: "매일" },
  { key: "weekdays", label: "평일마다 (월~금)" },
  { key: "weekly", label: "매주" },
  { key: "biweekly", label: "2주마다" },
  { key: "monthly", label: "매월 같은 날" },
];

/** Most events one 반복 or 여러 날짜 can create at once. */
export const MAX_BULK_EVENTS = 100;

/**
 * Start dates for a repeating event: `count` occurrences, or up to `until`
 * (inclusive), never more than MAX_BULK_EVENTS. Monthly skips months that
 * lack the day (e.g. the 31st).
 */
export function repeatDates(start: string, freq: RepeatFreq, options: { count?: number; until?: string | null }) {
  if (freq === "none") {
    return [start];
  }
  const limit = Math.min(MAX_BULK_EVENTS, options.until ? MAX_BULK_EVENTS : Math.max(1, options.count ?? 1));
  const until = options.until ?? null;
  const dates: string[] = [];
  const [year, month, day] = start.split("-").map(Number);
  for (let step = 0, guard = 0; dates.length < limit && guard < 2000; step += 1, guard += 1) {
    let date: string;
    if (freq === "monthly") {
      const candidate = new Date(Date.UTC(year, month - 1 + step, day));
      if (candidate.getUTCDate() !== day) {
        continue;
      }
      date = candidate.toISOString().slice(0, 10);
    } else {
      date = shiftDate(start, step * (freq === "weekly" ? 7 : freq === "biweekly" ? 14 : 1));
    }
    if (until && date > until) {
      break;
    }
    if (freq === "weekdays" && (weekdayOf(date) === 0 || weekdayOf(date) === 6)) {
      continue;
    }
    dates.push(date);
  }
  return dates;
}

/** "11월 3일 (월)" */
export function koreanDay(date: string) {
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][weekdayOf(date)];
  return `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일 (${weekday})`;
}

/** "11/3" */
export function shortDay(date: string) {
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
}

/** "오전 9:30" style label used in the time grid. */
export function clockLabel(time: string) {
  const minutes = toMinutes(time);
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const half = hour < 12 ? "오전" : "오후";
  const shown = hour % 12 === 0 ? 12 : hour % 12;
  return `${half} ${shown}${minute ? `:${String(minute).padStart(2, "0")}` : "시"}`;
}
