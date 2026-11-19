"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import EventEditor, { draftBodies, draftFromEvent, newDraft, type EventDraft } from "./calendar-editor";
import {
  clockLabel,
  datesBetween,
  fromMinutes,
  hiddenPerDay,
  isBarEntry,
  koreanDay,
  shortDay,
  snapMinutes,
  timedLayout,
  toMinutes,
  weekSegments,
  weekStart,
  weekdayOf,
  type LayoutEntry,
} from "./lib/calendar-layout";
import {
  EVENT_CATEGORIES,
  KOREAN_HOLIDAYS,
  addMonths,
  categoryOf,
  eventTimeLabel,
  monthWeeks,
  type CalendarEvent,
  type EventCategory,
  type EventsResponse,
  type MeetingMinutes,
} from "./lib/schedule";
import { daysBetween, kstToday, shiftDate, weekdayLabel, type TeamMember, type Viewer } from "./lib/team";
import { assigneeName, isItemDone, nextStep, type WorkflowItem } from "./lib/workflow";

// 업무일정: one shared calendar for the board, working like the everyday
// calendar apps.
// - Views: 일 · 주 · 월 · 두 달 · 일정 목록 (keys d w m x a; t 오늘, j/k 앞뒤, c 만들기)
// - Month: click a day to add, drag across days for a 기간 or for one event per
//   day, Ctrl/⌘-click to pick scattered days; multi-day events are bars;
//   drag an event to another day to move it (되돌리기 in the toast).
// - Week/day: drag in the time grid to create, drag an event to move it,
//   drag its bottom edge to change the end; red line = now.
// Everyone sees every event; the creator or a 부서장 may change it.

type ApiRequest = (path: string, init?: RequestInit) => Promise<Response>;

type View = "day" | "week" | "month" | "two" | "agenda";

const VIEWS: Array<{ key: View; label: string; shortcut: string }> = [
  { key: "day", label: "일", shortcut: "D" },
  { key: "week", label: "주", shortcut: "W" },
  { key: "month", label: "월", shortcut: "M" },
  { key: "two", label: "두 달", shortcut: "X" },
  { key: "agenda", label: "일정 목록", shortcut: "A" },
];

type Deadline = { key: string; itemId: number; date: string; title: string; label: string; assignee: string };

type Entry = LayoutEntry &
  ({ kind: "event"; event: CalendarEvent; category: EventCategory } | { kind: "deadline"; deadline: Deadline; category: null });

type Point = { x: number; y: number };

type QuickCreate = {
  at: Point;
  dates: string[];
  /** Picked as one run of days (drag) rather than scattered (Ctrl-click). */
  contiguous: boolean;
  startTime: string | null;
  endTime: string | null;
};

type MonthDrag =
  | { kind: "select"; anchor: string; current: string; moved: boolean }
  | { kind: "move"; event: CalendarEvent; grabbed: string; current: string; start: Point; moved: boolean };

type GridDrag =
  | { kind: "create"; date: string; from: number; to: number; moved: boolean }
  | { kind: "move"; event: CalendarEvent; date: string; offset: number; start: number; duration: number; origin: Point; moved: boolean }
  | { kind: "resize"; event: CalendarEvent; date: string; start: number; end: number; moved: boolean };

type Toast = { id: number; text: string; undo?: () => void };

// Handler-only flags (never read while rendering).
/** A click right after a drag must not open the event. */
const suppressClick = { active: false };

const VIEW_KEY = "wc-calendar-view";
const LEGACY_SPAN_KEY = "wc-calendar-span";
const HOUR_PX = 48;
const AGENDA_DAYS = 60;

function readView(): View {
  try {
    const saved = window.localStorage.getItem(VIEW_KEY) as View | null;
    if (saved && VIEWS.some((view) => view.key === saved)) {
      return saved;
    }
    const legacy = window.localStorage.getItem(LEGACY_SPAN_KEY);
    if (legacy === "1") {
      return "month";
    }
    return window.matchMedia("(max-width: 640px)").matches ? "month" : "two";
  } catch {
    return "two";
  }
}

export function categoryStyle(category: string) {
  const color = categoryOf(category).color;
  return {
    color,
    background: `color-mix(in srgb, ${color} 15%, transparent)`,
    borderLeft: `3px solid ${color}`,
  };
}

function monthLabel(month: string) {
  return `${month.slice(0, 4)}년 ${Number(month.slice(5, 7))}월`;
}

function dayLabel(date: string) {
  return `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일 (${weekdayLabel(date)})`;
}

function dayTone(date: string) {
  const weekday = weekdayOf(date);
  if (weekday === 0 || KOREAN_HOLIDAYS[date]) {
    return "text-[var(--danger)]";
  }
  return weekday === 6 ? "text-[#2563eb]" : "";
}

function attendeeLabel(event: Pick<CalendarEvent, "attendeeIds">, members: TeamMember[]) {
  if (!event.attendeeIds.length) {
    return "팀 전체";
  }
  const names = event.attendeeIds.map((id) => members.find((member) => member.id === id)?.name ?? `#${id}`);
  return names.length > 4 ? `${names.slice(0, 4).join(", ")} 외 ${names.length - 4}명` : names.join(", ");
}

function kstNowMinutes() {
  const now = new Date(Date.now() + 9 * 3600_000);
  return now.getUTCHours() * 60 + now.getUTCMinutes();
}

/** Keep a pop-up of about `size` inside the window, next to the point. */
function popupStyle(at: Point, size: { width: number; height: number }) {
  const width = typeof window === "undefined" ? 1200 : window.innerWidth;
  const height = typeof window === "undefined" ? 800 : window.innerHeight;
  const left = Math.max(8, Math.min(at.x + 8, width - size.width - 8));
  const top = at.y + size.height + 16 > height ? Math.max(8, at.y - size.height - 8) : at.y + 8;
  return { left, top, width: Math.min(size.width, width - 16) };
}

function dateUnder(x: number, y: number) {
  const element = document.elementFromPoint(x, y)?.closest("[data-cal-date]");
  return element?.getAttribute("data-cal-date") ?? null;
}

function columnUnder(x: number, y: number) {
  const element = document.elementFromPoint(x, y)?.closest("[data-cal-col]") as HTMLElement | null;
  if (!element) {
    return null;
  }
  const rect = element.getBoundingClientRect();
  return { date: element.getAttribute("data-cal-col") as string, minutes: ((y - rect.top) / HOUR_PX) * 60 };
}

/** Compact list of events, used by the dashboard and the calendar. */
export function EventList({
  events,
  members,
  onOpen,
  showDate = true,
  empty,
}: {
  events: CalendarEvent[];
  members: TeamMember[];
  onOpen: (event: CalendarEvent) => void;
  showDate?: boolean;
  empty: string;
}) {
  if (!events.length) {
    return <div className="py-3 text-sm text-[var(--text-faint)]">{empty}</div>;
  }
  return (
    <div className="space-y-1.5">
      {events.map((event) => (
        <button
          key={`${event.id}-${event.startDate}`}
          type="button"
          onClick={() => onOpen(event)}
          className="flex w-full items-start gap-2.5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-left transition hover:border-[var(--accent)] hover:bg-[var(--surface-3)]"
        >
          <span className="mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold" style={categoryStyle(event.category)}>
            {categoryOf(event.category).label}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{event.title}</span>
            <span className="block truncate text-[11px] text-[var(--text-faint)]">
              {showDate ? `${dayLabel(event.startDate)} · ` : ""}
              {eventTimeLabel(event)}
              {event.location ? ` · ${event.location}` : ""} · {attendeeLabel(event, members)}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

type CalendarViewProps = {
  viewer: Viewer | null;
  isManager: boolean;
  members: TeamMember[];
  items: WorkflowItem[];
  minutes: MeetingMinutes[];
  upcoming: CalendarEvent[];
  request: ApiRequest;
  refreshKey: number;
  focusEventId: number | null;
  onFocusHandled: () => void;
  onChanged: () => void;
  onSeen: () => void;
  onOpenItem: (id: number) => void;
  onWriteMinutes: (event: CalendarEvent) => void;
  onOpenMinutes: (id: number) => void;
};

export default function CalendarView({
  viewer,
  isManager,
  members,
  items,
  minutes,
  upcoming,
  request,
  refreshKey,
  focusEventId,
  onFocusHandled,
  onChanged,
  onSeen,
  onOpenItem,
  onWriteMinutes,
  onOpenMinutes,
}: CalendarViewProps) {
  const today = kstToday();
  const [view, setView] = useState<View>(readView);
  const [cursor, setCursor] = useState(today);
  const [hidden, setHidden] = useState<Set<EventCategory>>(new Set());
  const [showDeadlines, setShowDeadlines] = useState(true);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [draftError, setDraftError] = useState("");
  const [quick, setQuick] = useState<QuickCreate | null>(null);
  const [popover, setPopover] = useState<{ at: Point; event: CalendarEvent } | null>(null);
  const [dayList, setDayList] = useState<{ at: Point; date: string } | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [monthDrag, setMonthDrag] = useState<MonthDrag | null>(null);
  const [gridDrag, setGridDrag] = useState<GridDrag | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [nowMinutes, setNowMinutes] = useState<number | null>(null);
  const gridScrollRef = useRef<HTMLDivElement | null>(null);

  const anchorMonth = cursor.slice(0, 7);
  const months = useMemo(
    () => (view === "two" ? [anchorMonth, addMonths(anchorMonth, 1)] : view === "month" ? [anchorMonth] : []),
    [anchorMonth, view]
  );
  const gridDays = useMemo(
    () => (view === "week" ? datesBetween(weekStart(cursor), shiftDate(weekStart(cursor), 6)) : view === "day" ? [cursor] : []),
    [cursor, view]
  );
  const range = useMemo(() => {
    if (months.length) {
      const first = monthWeeks(months[0]);
      const last = monthWeeks(months[months.length - 1]);
      return { from: first[0][0], to: last[last.length - 1][6] };
    }
    if (gridDays.length) {
      return { from: gridDays[0], to: gridDays[gridDays.length - 1] };
    }
    return { from: cursor, to: shiftDate(cursor, AGENDA_DAYS - 1) };
  }, [cursor, gridDays, months]);

  function say(text: string, undo?: () => void) {
    setToast((current) => ({ id: (current?.id ?? 0) + 1, text, undo }));
  }

  // Opening 업무일정 counts as having seen other members' new events.
  useEffect(() => {
    onSeen();
  }, [onSeen]);

  function changeView(next: View) {
    setView(next);
    setQuick(null);
    setPopover(null);
    setDayList(null);
    setPicked([]);
    try {
      window.localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Not remembered; fine.
    }
  }

  function step(direction: 1 | -1) {
    setQuick(null);
    setPopover(null);
    setDayList(null);
    setCursor((current) =>
      view === "day"
        ? shiftDate(current, direction)
        : view === "week"
          ? shiftDate(current, 7 * direction)
          : view === "agenda"
            ? shiftDate(current, 30 * direction)
            : `${addMonths(current.slice(0, 7), direction)}-01`
    );
  }

  function goToday() {
    setCursor(today);
    setQuick(null);
    setPopover(null);
  }

  // ------------------------------------------------------------ data

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      void load();
    }, 0);
    const load = async () => {
      try {
        const response = await request(`/api/events?from=${range.from}&to=${range.to}`, { cache: "no-store" });
        const data = (await response.json().catch(() => ({}))) as EventsResponse;
        if (cancelled) {
          return;
        }
        if (response.ok) {
          setEvents(data.events ?? []);
          setError("");
        } else {
          setError(data.error ?? "일정을 불러오지 못했습니다.");
        }
      } catch {
        if (!cancelled) {
          setError("일정을 불러오지 못했습니다.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [range.from, range.to, refreshKey, request]);

  // Open an event chosen elsewhere (dashboard, notifications, search).
  useEffect(() => {
    if (focusEventId === null) {
      return;
    }
    let cancelled = false;
    const show = (event: CalendarEvent) => {
      setCursor(event.startDate);
      setDraft(draftFromEvent(event));
      setDraftError("");
    };
    const timer = window.setTimeout(() => {
      onFocusHandled();
      const known = [...events, ...upcoming].find((event) => event.id === focusEventId);
      if (known) {
        show(known);
        return;
      }
      void request(`/api/events?id=${focusEventId}`, { cache: "no-store" })
        .then((response) => response.json() as Promise<EventsResponse>)
        .then((data) => {
          if (!cancelled && data.event) {
            show(data.event);
          } else if (!cancelled) {
            setError("일정을 찾을 수 없습니다. 삭제되었을 수 있습니다.");
          }
        })
        .catch(() => undefined);
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [events, focusEventId, onFocusHandled, request, upcoming]);

  // The red "now" line, refreshed every minute.
  useEffect(() => {
    const update = () => setNowMinutes(kstNowMinutes());
    const first = window.setTimeout(update, 0);
    const timer = window.setInterval(update, 60_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, []);

  // Day/week: start the time grid around 8 AM.
  useEffect(() => {
    if (view !== "day" && view !== "week") {
      return;
    }
    const timer = window.setTimeout(() => {
      if (gridScrollRef.current) {
        gridScrollRef.current.scrollTop = 7.5 * HOUR_PX;
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [view]);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = window.setTimeout(() => setToast(null), toast.undo ? 7000 : 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const visible = useMemo(() => events.filter((event) => !hidden.has(event.category)), [events, hidden]);

  const deadlines = useMemo(() => {
    const list: Deadline[] = [];
    if (!showDeadlines) {
      return list;
    }
    for (const item of items) {
      if (isItemDone(item)) {
        continue;
      }
      const next = nextStep(item);
      if (next?.dueDate && next.dueDate !== item.dueDate) {
        list.push({ key: `s${next.id}`, itemId: item.id, date: next.dueDate, title: item.title, label: next.title, assignee: assigneeName(item.assignee) });
      }
      if (item.dueDate) {
        list.push({ key: `i${item.id}`, itemId: item.id, date: item.dueDate, title: item.title, label: "최종 마감", assignee: assigneeName(item.assignee) });
      }
    }
    return list.filter((entry) => entry.date >= range.from && entry.date <= range.to);
  }, [items, range.from, range.to, showDeadlines]);

  const entries = useMemo<Entry[]>(
    () => [
      ...visible.map((event) => ({
        key: `e${event.id}`,
        startDate: event.startDate,
        endDate: event.endDate,
        allDay: event.allDay,
        startTime: event.startTime,
        endTime: event.endTime,
        title: event.title,
        kind: "event" as const,
        event,
        category: event.category,
      })),
      ...deadlines.map((deadline) => ({
        key: `d${deadline.key}`,
        startDate: deadline.date,
        endDate: deadline.date,
        allDay: true,
        startTime: null,
        endTime: null,
        title: `⚑ ${deadline.title}`,
        kind: "deadline" as const,
        deadline,
        category: null,
      })),
    ],
    [deadlines, visible]
  );

  const canEditEvent = (event: Pick<CalendarEvent, "createdByMemberId">) =>
    isManager || (viewer !== null && event.createdByMemberId === viewer.memberId);
  const canEditDraft = (entry: EventDraft) => entry.id === null || canEditEvent({ createdByMemberId: entry.createdByMemberId ?? -1 });

  // ------------------------------------------------------------ saving

  async function sendEvents(method: "POST" | "PATCH" | "DELETE", body: Record<string, unknown>) {
    const response = await request("/api/events", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as EventsResponse;
    if (!response.ok) {
      throw new Error(data.error ?? "저장하지 못했습니다.");
    }
    return data;
  }

  /** Saves a new or changed draft; returns an error message or "". */
  async function saveDraft(target: EventDraft) {
    if (!target.title.trim()) {
      return "일정 제목을 입력해 주세요.";
    }
    try {
      if (target.id) {
        const data = await sendEvents("PATCH", { id: target.id, ...draftBodies(target)[0] });
        const saved = data.event;
        if (saved) {
          setEvents((current) => [...current.filter((event) => event.id !== saved.id), saved]);
        }
        say(`‘${target.title}’ 일정을 저장했습니다.`);
      } else {
        const bodies = draftBodies(target);
        const data = bodies.length === 1 ? await sendEvents("POST", bodies[0]) : await sendEvents("POST", { events: bodies });
        const saved = data.events ?? (data.event ? [data.event] : []);
        setEvents((current) => [...current, ...saved]);
        say(saved.length > 1 ? `일정 ${saved.length}개를 만들었습니다.` : `‘${target.title}’ 일정을 만들었습니다.`);
      }
      onChanged();
      return "";
    } catch (saveError) {
      return saveError instanceof Error ? saveError.message : "저장하지 못했습니다. 네트워크를 확인해 주세요.";
    }
  }

  async function saveEditor() {
    if (!draft) {
      return;
    }
    setSaving(true);
    setDraftError("");
    const message = await saveDraft(draft);
    setSaving(false);
    if (message) {
      setDraftError(message);
    } else {
      setDraft(null);
    }
  }

  async function removeEvent(event: Pick<CalendarEvent, "id" | "title">) {
    if (!window.confirm(`'${event.title}' 일정을 삭제할까요? 모든 구성원의 달력에서 사라집니다.`)) {
      return false;
    }
    try {
      await sendEvents("DELETE", { id: event.id });
      setEvents((current) => current.filter((entry) => entry.id !== event.id));
      onChanged();
      say(`‘${event.title}’ 일정을 삭제했습니다.`);
      return true;
    } catch (deleteError) {
      say(deleteError instanceof Error ? deleteError.message : "삭제하지 못했습니다.");
      return false;
    }
  }

  /** Moves/resizes an event right away, with 되돌리기. */
  async function reschedule(event: CalendarEvent, patch: Partial<Pick<CalendarEvent, "startDate" | "endDate" | "startTime" | "endTime">>, undoable = true) {
    const before = { startDate: event.startDate, endDate: event.endDate, startTime: event.startTime, endTime: event.endTime };
    const next = { ...event, ...patch };
    setEvents((current) => current.map((entry) => (entry.id === event.id ? next : entry)));
    try {
      const data = await sendEvents("PATCH", { id: event.id, ...patch });
      const saved = data.event;
      if (saved) {
        setEvents((current) => current.map((entry) => (entry.id === saved.id ? saved : entry)));
      }
      onChanged();
      if (undoable) {
        const label = next.allDay || !next.startTime ? koreanDay(next.startDate) : `${koreanDay(next.startDate)} ${next.startTime}`;
        say(`‘${event.title}’ → ${label}`, () => void reschedule(saved ?? next, before, false));
      }
    } catch (moveError) {
      setEvents((current) => current.map((entry) => (entry.id === event.id ? event : entry)));
      say(moveError instanceof Error ? moveError.message : "일정을 옮기지 못했습니다.");
    }
  }

  // ------------------------------------------------------------ opening things

  function openEditor(next: EventDraft) {
    setQuick(null);
    setPopover(null);
    setDayList(null);
    setDraftError("");
    setDraft(next);
  }

  function openQuick(dates: string[], at: Point, options: { contiguous?: boolean; startTime?: string | null; endTime?: string | null } = {}) {
    setPopover(null);
    setDayList(null);
    setQuick({
      at,
      dates: [...new Set(dates)].sort(),
      contiguous: options.contiguous ?? true,
      startTime: options.startTime ?? null,
      endTime: options.endTime ?? null,
    });
  }

  function openPopover(event: CalendarEvent, at: Point) {
    setQuick(null);
    setDayList(null);
    setPopover({ at, event });
  }

  function duplicate(event: CalendarEvent) {
    const copy = draftFromEvent(event);
    openEditor({ ...copy, id: null, title: `${event.title} (복사)`, createdByMemberId: null, createdByName: "" });
  }

  // A click outside a pop-up closes it (like the common calendar apps).
  useEffect(() => {
    if (!quick && !popover && !dayList) {
      return;
    }
    const onDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".tb-cal-pop")) {
        return;
      }
      setQuick(null);
      setPopover(null);
      setDayList(null);
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [dayList, popover, quick]);

  // ------------------------------------------------------------ keyboard

  const closeEditor = useCallback(() => setDraft(null), []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable)) {
        return;
      }
      if (event.key === "Escape") {
        setQuick(null);
        setPopover(null);
        setDayList(null);
        setPicked([]);
        return;
      }
      if (draft || event.ctrlKey || event.metaKey || event.altKey || document.querySelector('[role="dialog"][aria-modal="true"]')) {
        return;
      }
      const key = event.key.toLowerCase();
      const actions: Record<string, () => void> = {
        t: goToday,
        j: () => step(1),
        n: () => step(1),
        k: () => step(-1),
        p: () => step(-1),
        d: () => changeView("day"),
        w: () => changeView("week"),
        m: () => changeView("month"),
        x: () => changeView("two"),
        a: () => changeView("agenda"),
        c: () => openEditor(newDraft(cursor >= range.from && cursor <= range.to ? cursor : range.from)),
      };
      const action = actions[key];
      if (action) {
        event.preventDefault();
        action();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ------------------------------------------------------------ month drag

  function onDayPointerDown(event: React.PointerEvent, date: string) {
    if (event.button !== 0 || event.pointerType === "touch") {
      return;
    }
    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      // Ctrl/⌘-click: pick scattered days (Shift extends from the last pick).
      event.preventDefault();
      setQuick(null);
      setPopover(null);
      setPicked((current) => {
        if (event.shiftKey && current.length) {
          return [...new Set([...current, ...datesBetween(current[current.length - 1], date)])];
        }
        return current.includes(date) ? current.filter((entry) => entry !== date) : [...current, date];
      });
      return;
    }
    event.preventDefault();
    const start = { kind: "select" as const, anchor: date, current: date, moved: false };
    setMonthDrag(start);
    let latest = start;
    const move = (moveEvent: PointerEvent) => {
      const over = dateUnder(moveEvent.clientX, moveEvent.clientY);
      if (over && over !== latest.current) {
        latest = { ...latest, current: over, moved: true };
        setMonthDrag(latest);
      }
    };
    const up = (upEvent: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setMonthDrag(null);
      setPicked([]);
      openQuick(datesBetween(latest.anchor, latest.current), { x: upEvent.clientX, y: upEvent.clientY });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function onChipPointerDown(event: React.PointerEvent, entry: Entry, date: string) {
    if (entry.kind !== "event" || event.button !== 0 || event.pointerType === "touch" || !canEditEvent(entry.event)) {
      return;
    }
    event.stopPropagation();
    const start: MonthDrag = { kind: "move", event: entry.event, grabbed: date, current: date, start: { x: event.clientX, y: event.clientY }, moved: false };
    let latest = start;
    const move = (moveEvent: PointerEvent) => {
      if (latest.kind !== "move") {
        return;
      }
      const far = Math.abs(moveEvent.clientX - latest.start.x) + Math.abs(moveEvent.clientY - latest.start.y) > 5;
      if (!latest.moved && !far) {
        return;
      }
      const over = dateUnder(moveEvent.clientX, moveEvent.clientY) ?? latest.current;
      if (!latest.moved || over !== latest.current) {
        latest = { ...latest, current: over, moved: true };
        setMonthDrag(latest);
      }
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setMonthDrag(null);
      if (latest.kind !== "move" || !latest.moved) {
        return;
      }
      suppressClick.active = true;
      window.setTimeout(() => {
        suppressClick.active = false;
      }, 0);
      const delta = daysBetween(latest.grabbed, latest.current);
      if (delta) {
        void reschedule(latest.event, {
          startDate: shiftDate(latest.event.startDate, delta),
          endDate: shiftDate(latest.event.endDate, delta),
        });
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function onEntryClick(event: React.MouseEvent, entry: Entry) {
    event.stopPropagation();
    if (suppressClick.active) {
      return;
    }
    if (entry.kind === "deadline") {
      onOpenItem(entry.deadline.itemId);
      return;
    }
    openPopover(entry.event, { x: event.clientX, y: event.clientY });
  }

  // Days highlighted while selecting or moving.
  const highlighted = useMemo(() => {
    const set = new Set<string>(picked);
    if (monthDrag?.kind === "select") {
      for (const date of datesBetween(monthDrag.anchor, monthDrag.current)) {
        set.add(date);
      }
    } else if (monthDrag?.kind === "move" && monthDrag.moved) {
      const delta = daysBetween(monthDrag.grabbed, monthDrag.current);
      for (const date of datesBetween(shiftDate(monthDrag.event.startDate, delta), shiftDate(monthDrag.event.endDate, delta))) {
        set.add(date);
      }
    }
    for (const date of quick?.dates ?? []) {
      set.add(date);
    }
    return set;
  }, [monthDrag, picked, quick]);

  // ------------------------------------------------------------ time grid drag

  function onColumnPointerDown(event: React.PointerEvent, date: string) {
    if (event.button !== 0) {
      return;
    }
    const spot = columnUnder(event.clientX, event.clientY);
    if (!spot) {
      return;
    }
    const startMinutes = Math.max(0, Math.min(24 * 60 - 15, Math.floor(spot.minutes / 15) * 15));
    if (event.pointerType === "touch") {
      openQuick([date], { x: event.clientX, y: event.clientY }, { startTime: fromMinutes(startMinutes), endTime: fromMinutes(Math.min(startMinutes + 60, 23 * 60 + 59)) });
      return;
    }
    event.preventDefault();
    let latest: GridDrag = { kind: "create", date, from: startMinutes, to: startMinutes + 15, moved: false };
    setGridDrag(latest);
    const move = (moveEvent: PointerEvent) => {
      const over = columnUnder(moveEvent.clientX, moveEvent.clientY);
      if (!over || latest.kind !== "create" || over.date !== latest.date) {
        return;
      }
      const at = Math.max(0, Math.min(24 * 60, snapMinutes(over.minutes)));
      latest = { ...latest, to: at === latest.from ? latest.from + 15 : at, moved: true };
      setGridDrag(latest);
    };
    const up = (upEvent: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setGridDrag(null);
      if (latest.kind !== "create") {
        return;
      }
      const from = Math.min(latest.from, latest.to);
      const to = latest.moved ? Math.max(latest.from, latest.to) : from + 60;
      openQuick([latest.date], { x: upEvent.clientX, y: upEvent.clientY }, { startTime: fromMinutes(from), endTime: fromMinutes(Math.min(to, 23 * 60 + 59)) });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function onTimedPointerDown(event: React.PointerEvent, calendarEvent: CalendarEvent, mode: "move" | "resize") {
    if (event.button !== 0 || event.pointerType === "touch" || !canEditEvent(calendarEvent)) {
      return;
    }
    event.stopPropagation();
    event.preventDefault();
    const start = toMinutes(calendarEvent.startTime);
    const end = calendarEvent.endTime ? toMinutes(calendarEvent.endTime) : start + 60;
    const spot = columnUnder(event.clientX, event.clientY);
    let latest: GridDrag =
      mode === "move"
        ? { kind: "move", event: calendarEvent, date: calendarEvent.startDate, offset: (spot?.minutes ?? start) - start, start, duration: Math.max(15, end - start), origin: { x: event.clientX, y: event.clientY }, moved: false }
        : { kind: "resize", event: calendarEvent, date: calendarEvent.startDate, start, end, moved: false };
    const move = (moveEvent: PointerEvent) => {
      const over = columnUnder(moveEvent.clientX, moveEvent.clientY);
      if (!over) {
        return;
      }
      if (latest.kind === "move") {
        const far = Math.abs(moveEvent.clientX - latest.origin.x) + Math.abs(moveEvent.clientY - latest.origin.y) > 4;
        if (!latest.moved && !far) {
          return;
        }
        const nextStart = Math.max(0, Math.min(24 * 60 - latest.duration, snapMinutes(over.minutes - latest.offset)));
        latest = { ...latest, date: over.date, start: nextStart, moved: true };
      } else if (latest.kind === "resize") {
        latest = { ...latest, end: Math.max(latest.start + 15, Math.min(24 * 60, snapMinutes(over.minutes))), moved: true };
      }
      setGridDrag(latest);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setGridDrag(null);
      if (!latest.moved) {
        return;
      }
      suppressClick.active = true;
      window.setTimeout(() => {
        suppressClick.active = false;
      }, 0);
      if (latest.kind === "move") {
        const changed = latest.date !== calendarEvent.startDate || latest.start !== start;
        if (changed) {
          void reschedule(calendarEvent, {
            startDate: latest.date,
            endDate: latest.date,
            startTime: fromMinutes(latest.start),
            endTime: fromMinutes(Math.min(latest.start + latest.duration, 23 * 60 + 59)),
          });
        }
      } else if (latest.kind === "resize" && latest.end !== end) {
        void reschedule(calendarEvent, { endTime: fromMinutes(Math.min(latest.end, 23 * 60 + 59)) });
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // ------------------------------------------------------------ render pieces

  const laneLimit = view === "two" ? 3 : 4;

  function chipContent(entry: Entry, segmentStart: boolean) {
    if (entry.kind === "deadline") {
      return <span className="truncate">{entry.title}</span>;
    }
    if (!isBarEntry(entry)) {
      return (
        <>
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: categoryOf(entry.category).color }} />
          <span className="hidden shrink-0 font-semibold text-[var(--text-muted)] sm:inline">{entry.startTime}</span>
          <span className="truncate text-[var(--text)]">{entry.title}</span>
        </>
      );
    }
    return (
      <span className="truncate">
        {!entry.allDay && entry.startTime && segmentStart ? <span className="mr-1 font-semibold">{entry.startTime}</span> : null}
        {entry.title}
      </span>
    );
  }

  function chipStyle(entry: Entry, before: boolean, after: boolean): React.CSSProperties {
    if (entry.kind === "deadline") {
      return { color: "var(--danger)", border: "1px dashed var(--danger-border)", background: "var(--surface)" };
    }
    if (!isBarEntry(entry)) {
      return {};
    }
    const color = categoryOf(entry.category).color;
    return {
      background: `color-mix(in srgb, ${color} 18%, var(--surface))`,
      color,
      borderLeft: before ? undefined : `3px solid ${color}`,
      borderTopLeftRadius: before ? 0 : undefined,
      borderBottomLeftRadius: before ? 0 : undefined,
      borderTopRightRadius: after ? 0 : undefined,
      borderBottomRightRadius: after ? 0 : undefined,
    };
  }

  function renderWeekRow(days: string[], month: string | null, minHeight: number) {
    const segments = weekSegments(entries, days);
    const shown = segments.filter((segment) => segment.lane < laneLimit);
    const hiddenCounts = hiddenPerDay(segments, days.length, laneLimit);
    const lanes = Math.min(laneLimit, Math.max(0, ...segments.map((segment) => segment.lane + 1)));
    return (
      <div
        key={days[0]}
        className="tb-cal-week"
        style={{ gridTemplateRows: `24px ${lanes ? `repeat(${lanes}, 21px) ` : ""}18px 1fr`, minHeight }}
      >
        {days.map((day, index) => {
          const outside = month !== null && day.slice(0, 7) !== month;
          const count = segments.filter((segment) => segment.col <= index && index < segment.col + segment.span).length;
          return (
            <div
              key={day}
              role="button"
              tabIndex={0}
              aria-label={`${dayLabel(day)} 일정 ${count}건`}
              data-date={day}
              data-cal-date={day}
              className="tb-cal-cell"
              data-outside={outside}
              data-today={day === today}
              data-picked={highlighted.has(day)}
              style={{ gridColumn: index + 1, gridRow: "1 / -1" }}
              onPointerDown={(event) => onDayPointerDown(event, day)}
              onClick={(event) => {
                // Touch: a tap opens the quick add (mouse uses pointer up).
                if ((event.nativeEvent as PointerEvent).pointerType === "touch") {
                  openQuick([day], { x: event.clientX, y: event.clientY });
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
                  openQuick([day], { x: rect.left + 8, y: rect.top + 24 });
                }
              }}
            />
          );
        })}
        {days.map((day, index) => {
          const holiday = KOREAN_HOLIDAYS[day];
          const outside = month !== null && day.slice(0, 7) !== month;
          return (
            <div key={`h${day}`} className="tb-cal-dayhead" style={{ gridColumn: index + 1, gridRow: 1 }} data-outside={outside}>
              <button
                type="button"
                className={`tb-cal-daynum ${day === today ? "is-today" : dayTone(day)}`}
                title={`${dayLabel(day)} 일 보기`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => {
                  setCursor(day);
                  changeView("day");
                }}
              >
                {day.slice(8, 10) === "01" && month === null ? `${Number(day.slice(5, 7))}월 1일` : Number(day.slice(8, 10))}
              </button>
              {holiday ? (
                <span className="truncate text-[10px] text-[var(--danger)]" title={holiday}>
                  {holiday}
                </span>
              ) : null}
            </div>
          );
        })}
        {shown.map((segment) => {
          const entry = segment.entry;
          const dragging = monthDrag?.kind === "move" && monthDrag.moved && entry.kind === "event" && monthDrag.event.id === entry.event.id;
          const bar = isBarEntry(entry) || entry.kind === "deadline";
          return (
            <button
              key={`${entry.key}-${days[0]}`}
              type="button"
              className={`tb-cal-chip ${bar ? "is-bar" : "is-dot"} ${dragging ? "opacity-40" : ""}`}
              style={{ gridColumn: `${segment.col + 1} / span ${segment.span}`, gridRow: segment.lane + 2, ...chipStyle(entry, segment.before, segment.after) }}
              title={
                entry.kind === "event"
                  ? `${entry.title} · ${eventTimeLabel(entry.event)}${entry.event.location ? ` · ${entry.event.location}` : ""}`
                  : `${entry.deadline.title} · ${entry.deadline.label} (${entry.deadline.assignee})`
              }
              data-event-id={entry.kind === "event" ? entry.event.id : undefined}
              onPointerDown={(event) => onChipPointerDown(event, entry, days[segment.col])}
              onClick={(event) => onEntryClick(event, entry)}
            >
              {chipContent(entry, !segment.before)}
            </button>
          );
        })}
        {hiddenCounts.map((count, index) =>
          count ? (
            <button
              key={`m${days[index]}`}
              type="button"
              className="tb-cal-more"
              style={{ gridColumn: index + 1, gridRow: lanes + 2 }}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                setQuick(null);
                setPopover(null);
                setDayList({ at: { x: event.clientX, y: event.clientY }, date: days[index] });
              }}
            >
              +{count}개
            </button>
          ) : null
        )}
      </div>
    );
  }

  function renderMonth(month: string) {
    const weeks = monthWeeks(month);
    const count = visible.filter((event) => event.startDate.slice(0, 7) <= month && event.endDate.slice(0, 7) >= month).length;
    return (
      <div key={month} className="tb-card p-2 sm:p-3" data-testid="calendar-month">
        <div className="mb-1.5 flex items-baseline justify-between px-1">
          <h3 className="text-base font-semibold">{monthLabel(month)}</h3>
          <span className="text-[11px] text-[var(--text-faint)]">일정 {count}건</span>
        </div>
        <div className="grid grid-cols-7 pb-1 text-center text-[11px] font-semibold text-[var(--text-faint)]">
          {["일", "월", "화", "수", "목", "금", "토"].map((label, index) => (
            <div key={label} className={index === 0 ? "text-[var(--danger)]" : index === 6 ? "text-[#2563eb]" : ""}>
              {label}
            </div>
          ))}
        </div>
        <div className="tb-cal-month">
          {weeks.map((week) => renderWeekRow(week, month, view === "two" ? 96 : 118))}
        </div>
      </div>
    );
  }

  function renderTimeGrid() {
    const days = gridDays;
    const segments = weekSegments(
      entries.filter((entry) => isBarEntry(entry) || entry.kind === "deadline"),
      days
    );
    const allDayLanes = Math.max(1, ...segments.map((segment) => segment.lane + 1));
    const columns = `52px repeat(${days.length}, minmax(0, 1fr))`;
    return (
      <div className="tb-card overflow-hidden" data-testid="calendar-grid">
        <div className="grid border-b border-[var(--border)]" style={{ gridTemplateColumns: columns }}>
          <div />
          {days.map((day) => (
            <button
              key={day}
              type="button"
              className="flex flex-col items-center py-1.5"
              onClick={() => {
                setCursor(day);
                changeView("day");
              }}
              title={`${dayLabel(day)} 일 보기`}
            >
              <span className={`text-[11px] font-semibold ${dayTone(day) || "text-[var(--text-faint)]"}`}>{weekdayLabel(day)}</span>
              <span className={`tb-cal-daynum !h-8 !min-w-8 !text-lg ${day === today ? "is-today" : dayTone(day)}`}>{Number(day.slice(8, 10))}</span>
              {KOREAN_HOLIDAYS[day] ? <span className="text-[10px] text-[var(--danger)]">{KOREAN_HOLIDAYS[day]}</span> : null}
            </button>
          ))}
        </div>
        <div className="grid border-b border-[var(--border)]" style={{ gridTemplateColumns: columns }}>
          <div className="py-1 pr-1 text-right text-[10px] text-[var(--text-faint)]">종일</div>
          <div className="tb-cal-week !border-0" style={{ gridColumn: `2 / span ${days.length}`, gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${allDayLanes}, 22px) 4px` }}>
            {days.map((day, index) => (
              <div
                key={day}
                className="tb-cal-cell !border-b-0"
                data-cal-date={day}
                data-picked={highlighted.has(day)}
                style={{ gridColumn: index + 1, gridRow: "1 / -1" }}
                onPointerDown={(event) => onDayPointerDown(event, day)}
              />
            ))}
            {segments.map((segment) => (
              <button
                key={`${segment.entry.key}-ad`}
                type="button"
                className="tb-cal-chip is-bar"
                style={{ gridColumn: `${segment.col + 1} / span ${segment.span}`, gridRow: segment.lane + 1, ...chipStyle(segment.entry, segment.before, segment.after) }}
                data-event-id={segment.entry.kind === "event" ? segment.entry.event.id : undefined}
                onPointerDown={(event) => onChipPointerDown(event, segment.entry, days[segment.col])}
                onClick={(event) => onEntryClick(event, segment.entry)}
              >
                {chipContent(segment.entry, !segment.before)}
              </button>
            ))}
          </div>
        </div>
        <div ref={gridScrollRef} className="tb-cal-scroll">
          <div className="grid" style={{ gridTemplateColumns: columns }}>
            <div className="relative" style={{ height: 24 * HOUR_PX }}>
              {Array.from({ length: 23 }, (_, index) => (
                <span key={index} className="absolute right-1.5 -translate-y-1/2 text-[10px] text-[var(--text-faint)]" style={{ top: (index + 1) * HOUR_PX }}>
                  {clockLabel(fromMinutes((index + 1) * 60))}
                </span>
              ))}
            </div>
            {days.map((day) => {
              const timed = entries.filter(
                (entry): entry is Extract<Entry, { kind: "event" }> =>
                  entry.kind === "event" && !isBarEntry(entry) && entry.startDate === day
              );
              const boxes = timedLayout(timed);
              const creating = gridDrag?.kind === "create" && gridDrag.date === day ? gridDrag : null;
              const moving = gridDrag?.kind === "move" && gridDrag.moved && gridDrag.date === day ? gridDrag : null;
              return (
                <div
                  key={day}
                  className="tb-cal-col"
                  data-cal-col={day}
                  data-today={day === today}
                  style={{ height: 24 * HOUR_PX }}
                  onPointerDown={(event) => onColumnPointerDown(event, day)}
                >
                  {boxes.map((box) => {
                    const calendarEvent = box.entry.event;
                    const resizing = gridDrag?.kind === "resize" && gridDrag.event.id === calendarEvent.id ? gridDrag : null;
                    const movingThis = gridDrag?.kind === "move" && gridDrag.moved && gridDrag.event.id === calendarEvent.id;
                    const end = resizing ? resizing.end : box.end;
                    const color = categoryOf(calendarEvent.category).color;
                    const editable = canEditEvent(calendarEvent);
                    return (
                      <div
                        key={calendarEvent.id}
                        role="button"
                        tabIndex={0}
                        className={`tb-cal-timed ${movingThis ? "opacity-40" : ""}`}
                        data-event-id={calendarEvent.id}
                        style={{
                          top: (box.start / 60) * HOUR_PX,
                          height: Math.max(18, ((end - box.start) / 60) * HOUR_PX - 2),
                          left: `calc(${(box.column / box.columns) * 100}% + 1px)`,
                          width: `calc(${100 / box.columns}% - 3px)`,
                          background: `color-mix(in srgb, ${color} 22%, var(--surface))`,
                          borderLeft: `3px solid ${color}`,
                          cursor: editable ? "grab" : "pointer",
                        }}
                        title={`${calendarEvent.title} · ${eventTimeLabel(calendarEvent)}`}
                        onPointerDown={(event) => onTimedPointerDown(event, calendarEvent, "move")}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (!suppressClick.active) {
                            openPopover(calendarEvent, { x: event.clientX, y: event.clientY });
                          }
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
                            openPopover(calendarEvent, { x: rect.left, y: rect.top });
                          }
                        }}
                      >
                        <div className="truncate text-[11px] font-semibold" style={{ color }}>
                          {calendarEvent.title}
                        </div>
                        <div className="truncate text-[10px] text-[var(--text-muted)]">
                          {calendarEvent.startTime}
                          {resizing ? `~${fromMinutes(Math.min(end, 23 * 60 + 59))}` : calendarEvent.endTime ? `~${calendarEvent.endTime}` : ""}
                          {calendarEvent.location ? ` · ${calendarEvent.location}` : ""}
                        </div>
                        {editable ? (
                          <span
                            className="tb-cal-resize"
                            title="끌어서 끝나는 시간 바꾸기"
                            onPointerDown={(event) => onTimedPointerDown(event, calendarEvent, "resize")}
                          />
                        ) : null}
                      </div>
                    );
                  })}
                  {moving ? (
                    <div
                      className="tb-cal-ghost"
                      style={{ top: (moving.start / 60) * HOUR_PX, height: (moving.duration / 60) * HOUR_PX - 2 }}
                    >
                      {moving.event.title} · {fromMinutes(moving.start)}
                    </div>
                  ) : null}
                  {creating ? (
                    <div
                      className="tb-cal-ghost"
                      style={{
                        top: (Math.min(creating.from, creating.to) / 60) * HOUR_PX,
                        height: (Math.abs(creating.to - creating.from) / 60) * HOUR_PX,
                      }}
                    >
                      {fromMinutes(Math.min(creating.from, creating.to))} ~ {fromMinutes(Math.min(Math.max(creating.from, creating.to), 23 * 60 + 59))}
                    </div>
                  ) : null}
                  {quick && quick.startTime && quick.dates[0] === day ? (
                    <div
                      className="tb-cal-ghost"
                      style={{
                        top: (toMinutes(quick.startTime) / 60) * HOUR_PX,
                        height: Math.max(12, ((toMinutes(quick.endTime ?? quick.startTime) - toMinutes(quick.startTime)) / 60) * HOUR_PX),
                      }}
                    >
                      (제목 없음)
                    </div>
                  ) : null}
                  {day === today && nowMinutes !== null ? (
                    <div className="tb-cal-now" style={{ top: (nowMinutes / 60) * HOUR_PX }} aria-hidden="true" />
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  function renderAgenda() {
    const days = datesBetween(range.from, range.to);
    const rows = days
      .map((day) => ({
        day,
        list: entries
          .filter((entry) => entry.startDate <= day && entry.endDate >= day)
          .sort(
            (a, b) =>
              Number(!isBarEntry(a)) - Number(!isBarEntry(b)) ||
              (a.startTime ?? "").localeCompare(b.startTime ?? "") ||
              a.title.localeCompare(b.title, "ko-KR")
          ),
      }))
      .filter((row) => row.list.length || row.day === today);
    return (
      <div className="tb-card divide-y divide-[var(--border)]" data-testid="calendar-agenda">
        {rows.map(({ day, list }) => (
          <div key={day} className="flex gap-3 px-3 py-2.5 sm:px-4" data-date={day}>
            <button
              type="button"
              className="w-[74px] shrink-0 text-left"
              onClick={() => {
                setCursor(day);
                changeView("day");
              }}
            >
              <span className={`tb-cal-daynum !text-base ${day === today ? "is-today" : dayTone(day)}`}>{Number(day.slice(8, 10))}</span>
              <span className={`ml-1 text-[11px] ${dayTone(day) || "text-[var(--text-faint)]"}`}>
                {Number(day.slice(5, 7))}월, {weekdayLabel(day)}
              </span>
            </button>
            <div className="min-w-0 flex-1 space-y-1">
              {list.length ? (
                list.map((entry) => (
                  <button
                    key={entry.key}
                    type="button"
                    className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-sm hover:bg-[var(--surface-3)]"
                    onClick={(event) => onEntryClick(event, entry)}
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: entry.kind === "event" ? categoryOf(entry.category).color : "var(--danger)" }}
                    />
                    <span className="w-[92px] shrink-0 text-xs text-[var(--text-muted)]">
                      {entry.kind === "deadline"
                        ? entry.deadline.label
                        : entry.allDay || !entry.startTime
                          ? entry.startDate === entry.endDate
                            ? "종일"
                            : `${shortDay(entry.startDate)}~${shortDay(entry.endDate)}`
                          : `${entry.startTime}${entry.endTime ? `~${entry.endTime}` : ""}`}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{entry.title}</span>
                    {entry.kind === "event" && entry.event.location ? (
                      <span className="hidden shrink-0 truncate text-xs text-[var(--text-faint)] sm:inline">📍 {entry.event.location}</span>
                    ) : null}
                  </button>
                ))
              ) : (
                <div className="px-1.5 py-1 text-sm text-[var(--text-faint)]">일정 없음</div>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ------------------------------------------------------------ toolbar text

  const title =
    view === "month"
      ? monthLabel(months[0])
      : view === "two"
        ? `${monthLabel(months[0])} – ${Number(months[1].slice(5, 7))}월`
        : view === "week"
          ? gridDays[0].slice(0, 7) === gridDays[6].slice(0, 7)
            ? `${gridDays[0].slice(0, 4)}년 ${Number(gridDays[0].slice(5, 7))}월 ${Number(gridDays[0].slice(8, 10))}일 – ${Number(gridDays[6].slice(8, 10))}일`
            : `${gridDays[0].slice(0, 4)}년 ${shortDay(gridDays[0])} – ${shortDay(gridDays[6])}`
          : view === "day"
            ? `${cursor.slice(0, 4)}년 ${koreanDay(cursor)}`
            : `${koreanDay(range.from)}부터 ${AGENDA_DAYS}일`;
  const unit = view === "day" ? "날" : view === "week" ? "주" : "달";
  const linkedMinutes = draft?.id ? minutes.filter((minute) => minute.eventId === draft.id) : [];
  const draftEvent = draft?.id ? (events.find((event) => event.id === draft.id) ?? upcoming.find((event) => event.id === draft.id) ?? null) : null;

  return (
    <div className="space-y-3" data-testid="calendar-view">
      <div className="tb-card flex flex-wrap items-center gap-2 p-2.5">
        <button type="button" className="tb-btn" onClick={goToday} title="오늘 (T)">
          오늘
        </button>
        <div className="flex items-center">
          <button type="button" className="tb-iconbtn h-8 w-8" aria-label={`이전 ${unit}`} title={`이전 ${unit} (K)`} onClick={() => step(-1)}>
            ‹
          </button>
          <button type="button" className="tb-iconbtn h-8 w-8" aria-label={`다음 ${unit}`} title={`다음 ${unit} (J)`} onClick={() => step(1)}>
            ›
          </button>
        </div>
        <h2 className="min-w-0 text-base font-semibold sm:text-lg" data-testid="calendar-range">
          {title}
        </h2>
        {loading ? <span className="text-[11px] text-[var(--text-faint)]">불러오는 중…</span> : null}
        <div className="tb-seg ml-auto" role="group" aria-label="보기">
          {VIEWS.map((entry) => (
            <button
              key={entry.key}
              type="button"
              className="tb-seg-btn"
              data-active={view === entry.key}
              aria-pressed={view === entry.key}
              title={`${entry.label} 보기 (${entry.shortcut})`}
              onClick={() => changeView(entry.key)}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <button type="button" className="tb-btn tb-btn-primary" onClick={() => openEditor(newDraft(cursor))} title="일정 만들기 (C)">
          + 만들기
        </button>
        <div className="flex w-full flex-wrap items-center gap-1">
          {EVENT_CATEGORIES.map((category) => {
            const off = hidden.has(category.key);
            return (
              <button
                key={category.key}
                type="button"
                aria-pressed={!off}
                title={off ? `${category.label} 표시` : `${category.label} 숨기기`}
                onClick={() =>
                  setHidden((current) => {
                    const next = new Set(current);
                    if (next.has(category.key)) {
                      next.delete(category.key);
                    } else {
                      next.add(category.key);
                    }
                    return next;
                  })
                }
                className="tb-chip tb-chip-btn"
                style={off ? { opacity: 0.45 } : undefined}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: category.color }} />
                {category.label}
              </button>
            );
          })}
          <label className="ml-1 flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
            <input type="checkbox" checked={showDeadlines} onChange={(event) => setShowDeadlines(event.target.checked)} />
            업무 마감 표시
          </label>
          <span
            className="ml-auto hidden text-[11px] text-[var(--text-faint)] lg:inline"
            title="T 오늘 · J/K 다음/이전 · D 일 · W 주 · M 월 · X 두 달 · A 일정 목록 · C 만들기 · Esc 닫기"
          >
            날짜를 클릭·드래그해 추가 · Ctrl+클릭으로 여러 날 · 일정을 끌어 옮기기 · 단축키(여기에 마우스)
          </span>
        </div>
      </div>

      {error ? (
        <div className="rounded-[var(--radius)] border border-[var(--danger-border)] bg-[var(--danger-soft)] px-4 py-2 text-sm text-[var(--danger)]">
          {error}
        </div>
      ) : null}

      {picked.length ? (
        <div className="tb-card flex flex-wrap items-center gap-2 px-3 py-2 text-sm" role="status" data-testid="calendar-picked">
          <b>{picked.length}일 선택</b>
          <span className="min-w-0 truncate text-xs text-[var(--text-muted)]">{[...picked].sort().map(shortDay).join(", ")}</span>
          <button
            type="button"
            className="tb-btn tb-btn-primary ml-auto !py-1 text-xs"
            onClick={(event) => openQuick(picked, { x: event.clientX, y: event.clientY }, { contiguous: false })}
          >
            선택한 날마다 일정 만들기
          </button>
          <button type="button" className="tb-btn !py-1 text-xs" onClick={() => setPicked([])}>
            선택 해제
          </button>
        </div>
      ) : null}

      <div aria-busy={loading}>
        {view === "month" || view === "two" ? (
          <div className={`grid gap-3 ${view === "two" ? "lg:grid-cols-2" : ""}`}>{months.map(renderMonth)}</div>
        ) : view === "agenda" ? (
          renderAgenda()
        ) : (
          renderTimeGrid()
        )}
      </div>

      {view !== "agenda" ? (
        <div className="tb-card tb-section p-4">
          <h3 className="mb-2 text-sm font-semibold">다가오는 일정 (2주)</h3>
          <EventList
            events={upcoming.slice(0, 12)}
            members={members}
            onOpen={(event) => openEditor(draftFromEvent(event))}
            empty="2주 안에 예정된 일정이 없습니다."
          />
        </div>
      ) : null}

      {quick ? (
        <QuickCreatePopup
          key={`${quick.dates.join(",")}-${quick.startTime ?? ""}`}
          quick={quick}
          onSave={async (next) => {
            const message = await saveDraft(next);
            if (!message) {
              setQuick(null);
              setPicked([]);
            }
            return message;
          }}
          onMore={(next) => {
            setPicked([]);
            openEditor(next);
          }}
          onClose={() => setQuick(null)}
        />
      ) : null}

      {popover ? (
        <EventPopup
          at={popover.at}
          event={popover.event}
          members={members}
          editable={canEditEvent(popover.event)}
          linkedMinutes={minutes.filter((minute) => minute.eventId === popover.event.id)}
          onEdit={() => openEditor(draftFromEvent(popover.event))}
          onDuplicate={() => duplicate(popover.event)}
          onDelete={async () => {
            if (await removeEvent(popover.event)) {
              setPopover(null);
            }
          }}
          onWriteMinutes={
            popover.event.category === "meeting"
              ? () => {
                  const event = popover.event;
                  setPopover(null);
                  onWriteMinutes(event);
                }
              : null
          }
          onOpenMinutes={(id) => {
            setPopover(null);
            onOpenMinutes(id);
          }}
          onClose={() => setPopover(null)}
        />
      ) : null}

      {dayList ? (
        <div className="tb-cal-pop" role="dialog" aria-label={`${dayLabel(dayList.date)} 일정`} style={popupStyle(dayList.at, { width: 260, height: 300 })}>
          <div className="mb-1.5 flex items-center justify-between">
            <span className={`text-sm font-semibold ${dayTone(dayList.date)}`}>{dayLabel(dayList.date)}</span>
            <button type="button" className="tb-iconbtn h-7 w-7" aria-label="닫기" onClick={() => setDayList(null)}>
              ×
            </button>
          </div>
          <div className="max-h-[260px] space-y-1 overflow-auto">
            {entries
              .filter((entry) => entry.startDate <= dayList.date && entry.endDate >= dayList.date)
              .map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  className={`tb-cal-chip ${isBarEntry(entry) || entry.kind === "deadline" ? "is-bar" : "is-dot"} w-full`}
                  style={chipStyle(entry, false, false)}
                  onClick={(event) => onEntryClick(event, entry)}
                >
                  {chipContent(entry, true)}
                </button>
              ))}
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className="tb-cal-toast" role="status">
          <span className="min-w-0 flex-1">{toast.text}</span>
          {toast.undo ? (
            <button
              type="button"
              className="font-semibold text-[#9be3d4] hover:underline"
              onClick={() => {
                toast.undo?.();
                setToast(null);
              }}
            >
              되돌리기
            </button>
          ) : null}
        </div>
      ) : null}

      {draft ? (
        <EventEditor
          draft={draft}
          editable={canEditDraft(draft)}
          saving={saving}
          error={draftError}
          members={members}
          linkedMinutes={linkedMinutes}
          onChange={setDraft}
          onSave={() => void saveEditor()}
          onDelete={async () => {
            if (draft.id && (await removeEvent({ id: draft.id, title: draft.title }))) {
              setDraft(null);
            }
          }}
          onDuplicate={draftEvent ? () => duplicate(draftEvent) : null}
          onWriteMinutes={
            draftEvent && draftEvent.category === "meeting"
              ? () => {
                  setDraft(null);
                  onWriteMinutes(draftEvent);
                }
              : null
          }
          onOpenMinutes={(id) => {
            setDraft(null);
            onOpenMinutes(id);
          }}
          onClose={closeEditor}
        />
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------ pop-ups

function QuickCreatePopup({
  quick,
  onSave,
  onMore,
  onClose,
}: {
  quick: QuickCreate;
  onSave: (draft: EventDraft) => Promise<string>;
  onMore: (draft: EventDraft) => void;
  onClose: () => void;
}) {
  const several = quick.dates.length > 1;
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<EventCategory>(quick.startTime ? "meeting" : "etc");
  const [allDay, setAllDay] = useState(!quick.startTime);
  const [startTime, setStartTime] = useState(quick.startTime ?? "10:00");
  const [endTime, setEndTime] = useState(quick.endTime ?? "11:00");
  const [each, setEach] = useState(!quick.contiguous);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const first = quick.dates[0];
  const last = quick.dates[quick.dates.length - 1];
  const build = (): EventDraft =>
    newDraft(first, category, {
      title: title.trim(),
      endDate: several && !each ? last : first,
      allDay,
      startTime,
      endTime,
      reminderMinutes: category === "meeting" && !allDay ? 10 : null,
      dates: several && each ? quick.dates : null,
    });

  async function submit() {
    if (!title.trim()) {
      setError("제목을 입력해 주세요.");
      return;
    }
    setSaving(true);
    setError("");
    const message = await onSave(build());
    setSaving(false);
    setError(message);
  }

  const summary = several
    ? each
      ? `${quick.dates.length}일에 각각: ${quick.dates.slice(0, 5).map(shortDay).join(", ")}${quick.dates.length > 5 ? " …" : ""}`
      : `${koreanDay(first)} ~ ${koreanDay(last)} (${quick.dates.length}일)`
    : koreanDay(first);

  return (
    <div
      className="tb-cal-pop"
      role="dialog"
      aria-label="빠른 일정 추가"
      data-testid="quick-create"
      style={popupStyle(quick.at, { width: 340, height: 300 })}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        className="space-y-2.5"
      >
        <div className="flex items-start gap-2">
          <input
            autoFocus
            className="tb-field !text-base"
            placeholder="제목 추가"
            aria-label="제목"
            value={title}
            maxLength={120}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                onClose();
              }
            }}
          />
          <button type="button" className="tb-iconbtn h-8 w-8 shrink-0" aria-label="닫기" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="text-sm text-[var(--text-muted)]" data-testid="quick-summary">
          🗓 {summary}
        </div>
        {several && quick.contiguous ? (
          <div className="tb-seg w-full" role="radiogroup" aria-label="만드는 방식">
            <button type="button" role="radio" aria-checked={!each} className="tb-seg-btn flex-1" data-active={!each} onClick={() => setEach(false)}>
              기간 일정 1개
            </button>
            <button type="button" role="radio" aria-checked={each} className="tb-seg-btn flex-1" data-active={each} onClick={() => setEach(true)}>
              날마다 {quick.dates.length}개
            </button>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={allDay} onChange={(event) => setAllDay(event.target.checked)} />
            종일
          </label>
          {!allDay ? (
            <>
              <input type="time" className="tb-field !w-auto !py-1" aria-label="시작 시간" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
              <span>~</span>
              <input type="time" className="tb-field !w-auto !py-1" aria-label="종료 시간" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
            </>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="분류">
          {EVENT_CATEGORIES.map((entry) => (
            <button
              key={entry.key}
              type="button"
              role="radio"
              aria-checked={category === entry.key}
              onClick={() => setCategory(entry.key)}
              className="rounded-full border px-2 py-0.5 text-[11px] font-semibold"
              style={
                category === entry.key
                  ? { background: entry.color, color: "#fff", borderColor: entry.color }
                  : { color: entry.color, borderColor: "var(--border)" }
              }
            >
              {entry.label}
            </button>
          ))}
        </div>
        {error ? (
          <div role="alert" className="rounded bg-[var(--danger-soft)] px-2 py-1 text-xs text-[var(--danger)]">
            {error}
          </div>
        ) : null}
        <div className="flex items-center gap-2 pt-0.5">
          <button type="button" className="tb-btn !py-1 text-xs" onClick={() => onMore(build())}>
            옵션 더보기
          </button>
          <button type="submit" className="tb-btn tb-btn-primary ml-auto !py-1 text-xs" disabled={saving}>
            {saving ? "저장 중…" : several && each ? `${quick.dates.length}개 저장` : "저장"}
          </button>
        </div>
      </form>
    </div>
  );
}

function EventPopup({
  at,
  event,
  members,
  editable,
  linkedMinutes,
  onEdit,
  onDuplicate,
  onDelete,
  onWriteMinutes,
  onOpenMinutes,
  onClose,
}: {
  at: Point;
  event: CalendarEvent;
  members: TeamMember[];
  editable: boolean;
  linkedMinutes: MeetingMinutes[];
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onWriteMinutes: (() => void) | null;
  onOpenMinutes: (id: number) => void;
  onClose: () => void;
}) {
  const category = categoryOf(event.category);
  const when =
    event.startDate === event.endDate
      ? `${koreanDay(event.startDate)} · ${event.allDay || !event.startTime ? "종일" : `${event.startTime}${event.endTime ? `~${event.endTime}` : ""}`}`
      : `${koreanDay(event.startDate)} ~ ${koreanDay(event.endDate)}${event.allDay || !event.startTime ? "" : ` · ${eventTimeLabel(event)}`}`;
  return (
    <div
      className="tb-cal-pop"
      role="dialog"
      aria-label={`일정 ${event.title}`}
      data-testid="event-popup"
      style={popupStyle(at, { width: 340, height: 260 })}
      onPointerDown={(pointerEvent) => pointerEvent.stopPropagation()}
    >
      <div className="flex items-center justify-end gap-0.5">
        <button type="button" className="tb-iconbtn h-7 w-7 text-xs" title={editable ? "수정" : "자세히"} aria-label={editable ? "수정" : "자세히"} onClick={onEdit}>
          ✎
        </button>
        <button type="button" className="tb-iconbtn h-7 w-7 text-xs" title="복제" aria-label="복제" onClick={onDuplicate}>
          ⧉
        </button>
        {editable ? (
          <button type="button" className="tb-iconbtn h-7 w-7 text-xs text-[var(--danger)]" title="삭제" aria-label="삭제" onClick={onDelete}>
            🗑
          </button>
        ) : null}
        <button type="button" className="tb-iconbtn h-7 w-7" aria-label="닫기" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="flex items-start gap-2.5">
        <span className="mt-1.5 h-3 w-3 shrink-0 rounded" style={{ background: category.color }} />
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold leading-snug">{event.title}</div>
          <div className="text-sm text-[var(--text-muted)]">{when}</div>
        </div>
      </div>
      <div className="mt-2 space-y-1 pl-[22px] text-xs text-[var(--text-muted)]">
        <div>
          <span className="font-semibold" style={{ color: category.color }}>
            {category.label}
          </span>
          {" · "}
          {attendeeLabel(event, members)}
        </div>
        {event.location ? <div>📍 {event.location}</div> : null}
        {event.description ? <div className="max-h-24 overflow-auto whitespace-pre-wrap text-[var(--text)]">{event.description}</div> : null}
        <div className="text-[11px] text-[var(--text-faint)]">등록 {event.createdByName}</div>
      </div>
      {onWriteMinutes || linkedMinutes.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5 pl-[22px]">
          {linkedMinutes.map((minute) => (
            <button key={minute.id} type="button" className="tb-chip tb-chip-btn" onClick={() => onOpenMinutes(minute.id)}>
              📝 {minute.title}
            </button>
          ))}
          {onWriteMinutes ? (
            <button type="button" className="tb-btn !px-2.5 !py-1 text-xs" onClick={onWriteMinutes}>
              📝 회의록 작성
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
