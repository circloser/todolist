"use client";

import { useEffect, useMemo, useState } from "react";

import {
  EVENT_CATEGORIES,
  KOREAN_HOLIDAYS,
  REMINDER_CHOICES,
  addMonths,
  categoryOf,
  eventTimeLabel,
  eventsOnDay,
  monthWeeks,
  type CalendarEvent,
  type EventCategory,
  type EventsResponse,
  type MeetingMinutes,
} from "./lib/schedule";
import {
  kstToday,
  weekdayLabel,
  type TeamMember,
  type Viewer,
} from "./lib/team";
import {
  assigneeName,
  isItemDone,
  nextStep,
  type WorkflowItem,
} from "./lib/workflow";

// 업무일정: one shared calendar for the whole board, shown two months side by
// side (or one month larger). Everyone sees every event; the person who added
// an event or a 부서장 may change it.

type ApiRequest = (path: string, init?: RequestInit) => Promise<Response>;

type EventDraft = {
  id: number | null;
  title: string;
  category: EventCategory;
  startDate: string;
  endDate: string;
  allDay: boolean;
  startTime: string;
  endTime: string;
  location: string;
  description: string;
  attendeeIds: number[];
  reminderMinutes: number | null;
  createdByMemberId: number | null;
  createdByName: string;
};

type Deadline = {
  key: string;
  itemId: number;
  date: string;
  title: string;
  label: string;
  assignee: string;
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const SPAN_KEY = "wc-calendar-span";

function readSpan(): 1 | 2 {
  try {
    return window.localStorage.getItem(SPAN_KEY) === "1" ? 1 : 2;
  } catch {
    return 2;
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

function newDraft(
  date: string,
  category: EventCategory = "meeting",
): EventDraft {
  return {
    id: null,
    title: "",
    category,
    startDate: date,
    endDate: date,
    allDay: category !== "meeting",
    startTime: "10:00",
    endTime: "11:00",
    location: "",
    description: "",
    attendeeIds: [],
    reminderMinutes: category === "meeting" ? 10 : null,
    createdByMemberId: null,
    createdByName: "",
  };
}

function draftFromEvent(event: CalendarEvent): EventDraft {
  return {
    id: event.id,
    title: event.title,
    category: event.category,
    startDate: event.startDate,
    endDate: event.endDate,
    allDay: event.allDay,
    startTime: event.startTime ?? "10:00",
    endTime: event.endTime ?? "",
    location: event.location,
    description: event.description,
    attendeeIds: event.attendeeIds,
    reminderMinutes: event.reminderMinutes,
    createdByMemberId: event.createdByMemberId,
    createdByName: event.createdByName,
  };
}

function monthLabel(month: string) {
  return `${month.slice(0, 4)}년 ${Number(month.slice(5, 7))}월`;
}

function dayLabel(date: string) {
  return `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일 (${weekdayLabel(date)})`;
}

function dayTone(date: string) {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  if (weekday === 0 || KOREAN_HOLIDAYS[date]) {
    return "text-[var(--danger)]";
  }
  return weekday === 6 ? "text-[#2563eb]" : "";
}

function attendeeLabel(
  event: Pick<CalendarEvent, "attendeeIds">,
  members: TeamMember[],
) {
  if (!event.attendeeIds.length) {
    return "팀 전체";
  }
  const names = event.attendeeIds.map(
    (id) => members.find((member) => member.id === id)?.name ?? `#${id}`,
  );
  return names.length > 4
    ? `${names.slice(0, 4).join(", ")} 외 ${names.length - 4}명`
    : names.join(", ");
}

/** Compact list of events, used by the calendar side panel and the dashboard. */
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
          <span
            className="mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold"
            style={categoryStyle(event.category)}
          >
            {categoryOf(event.category).label}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">
              {event.title}
            </span>
            <span className="block truncate text-[11px] text-[var(--text-faint)]">
              {showDate ? `${dayLabel(event.startDate)} · ` : ""}
              {eventTimeLabel(event)}
              {event.location ? ` · ${event.location}` : ""} ·{" "}
              {attendeeLabel(event, members)}
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
  const [anchor, setAnchor] = useState(today.slice(0, 7));
  const [span, setSpan] = useState<1 | 2>(readSpan);
  const [hidden, setHidden] = useState<Set<EventCategory>>(new Set());
  const [showDeadlines, setShowDeadlines] = useState(true);
  const [selected, setSelected] = useState(today);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [draftError, setDraftError] = useState("");

  const months = useMemo(
    () => Array.from({ length: span }, (_, index) => addMonths(anchor, index)),
    [anchor, span],
  );
  const range = useMemo(() => {
    const first = monthWeeks(months[0]);
    const last = monthWeeks(months[months.length - 1]);
    return { from: first[0][0], to: last[last.length - 1][6] };
  }, [months]);

  // Opening 업무일정 counts as having seen other members' new events.
  useEffect(() => {
    onSeen();
  }, [onSeen]);

  function changeSpan(value: 1 | 2) {
    setSpan(value);
    try {
      window.localStorage.setItem(SPAN_KEY, String(value));
    } catch {
      // Not remembered; fine.
    }
  }

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      void load();
    }, 0);
    const load = async () => {
      try {
        const response = await request(
          `/api/events?from=${range.from}&to=${range.to}`,
          { cache: "no-store" },
        );
        const data = (await response
          .json()
          .catch(() => ({}))) as EventsResponse;
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

  // Open an event chosen elsewhere (dashboard, notifications).
  useEffect(() => {
    if (focusEventId === null) {
      return;
    }
    let cancelled = false;
    const show = (event: CalendarEvent) => {
      setSelected(event.startDate);
      setAnchor(event.startDate.slice(0, 7));
      setDraft(draftFromEvent(event));
      setDraftError("");
    };
    const timer = window.setTimeout(() => {
      onFocusHandled();
      const known = [...events, ...upcoming].find(
        (event) => event.id === focusEventId,
      );
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

  const visible = useMemo(
    () => events.filter((event) => !hidden.has(event.category)),
    [events, hidden],
  );

  const deadlines = useMemo(() => {
    if (!showDeadlines) {
      return new Map<string, Deadline[]>();
    }
    const byDate = new Map<string, Deadline[]>();
    const add = (entry: Deadline) => {
      if (entry.date < range.from || entry.date > range.to) {
        return;
      }
      byDate.set(entry.date, [...(byDate.get(entry.date) ?? []), entry]);
    };
    for (const item of items) {
      if (isItemDone(item)) {
        continue;
      }
      const step = nextStep(item);
      if (step?.dueDate && step.dueDate !== item.dueDate) {
        add({
          key: `s${step.id}`,
          itemId: item.id,
          date: step.dueDate,
          title: item.title,
          label: step.title,
          assignee: assigneeName(item.assignee),
        });
      }
      if (item.dueDate) {
        add({
          key: `i${item.id}`,
          itemId: item.id,
          date: item.dueDate,
          title: item.title,
          label: "최종 마감",
          assignee: assigneeName(item.assignee),
        });
      }
    }
    return byDate;
  }, [items, range.from, range.to, showDeadlines]);

  const canEdit = (entry: EventDraft) =>
    entry.id === null ||
    isManager ||
    (viewer !== null && entry.createdByMemberId === viewer.memberId);

  function openNew(date: string) {
    setSelected(date);
    setDraft(newDraft(date));
    setDraftError("");
  }

  function openEvent(event: CalendarEvent) {
    setSelected(
      event.startDate < range.from || event.startDate > range.to
        ? selected
        : event.startDate,
    );
    setDraft(draftFromEvent(event));
    setDraftError("");
  }

  async function save() {
    if (!draft) {
      return;
    }
    setSaving(true);
    setDraftError("");
    try {
      const response = await request("/api/events", {
        method: draft.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...draft,
          startTime: draft.allDay ? null : draft.startTime,
          endTime: draft.allDay ? null : draft.endTime || null,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as EventsResponse;
      if (!response.ok || !data.event) {
        setDraftError(data.error ?? "저장하지 못했습니다.");
        return;
      }
      const saved = data.event;
      setEvents((current) => [
        ...current.filter((event) => event.id !== saved.id),
        saved,
      ]);
      setSelected(saved.startDate);
      setDraft(null);
      onChanged();
    } catch {
      setDraftError("저장하지 못했습니다. 네트워크를 확인해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (
      !draft?.id ||
      !window.confirm(
        `'${draft.title}' 일정을 삭제할까요? 모든 구성원의 달력에서 사라집니다.`,
      )
    ) {
      return;
    }
    setSaving(true);
    try {
      const response = await request("/api/events", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: draft.id }),
      });
      const data = (await response.json().catch(() => ({}))) as EventsResponse;
      if (!response.ok) {
        setDraftError(data.error ?? "삭제하지 못했습니다.");
        return;
      }
      setEvents((current) => current.filter((event) => event.id !== draft.id));
      setDraft(null);
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!draft) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDraft(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [draft]);

  const selectedEvents = eventsOnDay(visible, selected);
  const selectedDeadlines = deadlines.get(selected) ?? [];
  const chipLimit = span === 2 ? 3 : 5;
  const linkedMinutes = draft?.id
    ? minutes.filter((minute) => minute.eventId === draft.id)
    : [];
  const activeMembers = members.filter((member) => member.active);

  return (
    <div className="space-y-4" data-testid="calendar-view">
      <div className="tb-card flex flex-wrap items-center gap-2 p-3">
        <h2 className="mr-1 text-base font-semibold">업무일정</h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="tb-iconbtn h-8 w-8"
            aria-label="이전 달"
            onClick={() => setAnchor(addMonths(anchor, -1))}
          >
            ‹
          </button>
          <span
            className="min-w-[9.5rem] text-center text-sm font-semibold"
            data-testid="calendar-range"
          >
            {span === 2
              ? `${monthLabel(months[0])} – ${Number(months[1].slice(5, 7))}월`
              : monthLabel(months[0])}
          </span>
          <button
            type="button"
            className="tb-iconbtn h-8 w-8"
            aria-label="다음 달"
            onClick={() => setAnchor(addMonths(anchor, 1))}
          >
            ›
          </button>
        </div>
        <button
          type="button"
          className="tb-btn"
          onClick={() => {
            setAnchor(today.slice(0, 7));
            setSelected(today);
          }}
        >
          오늘
        </button>
        <div className="tb-seg">
          <button
            type="button"
            className="tb-seg-btn"
            data-active={span === 2}
            onClick={() => changeSpan(2)}
          >
            두 달
          </button>
          <button
            type="button"
            className="tb-seg-btn"
            data-active={span === 1}
            onClick={() => changeSpan(1)}
          >
            한 달
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {EVENT_CATEGORIES.map((category) => {
            const off = hidden.has(category.key);
            return (
              <button
                key={category.key}
                type="button"
                aria-pressed={!off}
                title={
                  off ? `${category.label} 표시` : `${category.label} 숨기기`
                }
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
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: category.color }}
                />
                {category.label}
              </button>
            );
          })}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
          <input
            type="checkbox"
            checked={showDeadlines}
            onChange={(event) => setShowDeadlines(event.target.checked)}
          />
          업무 마감 표시
        </label>
        <button
          type="button"
          className="tb-btn tb-btn-primary ml-auto"
          onClick={() => openNew(selected)}
        >
          + 일정 추가
        </button>
      </div>

      {error ? (
        <div className="rounded-[var(--radius)] border border-[var(--danger-border)] bg-[var(--danger-soft)] px-4 py-2 text-sm text-[var(--danger)]">
          {error}
        </div>
      ) : null}

      <div
        className={`grid gap-4 ${span === 2 ? "lg:grid-cols-2" : ""}`}
        aria-busy={loading}
      >
        {months.map((month) => (
          <div
            key={month}
            className="tb-card p-2.5 sm:p-4"
            data-testid="calendar-month"
          >
            <div className="mb-2 flex items-baseline justify-between px-1">
              <h3 className="text-base font-semibold">{monthLabel(month)}</h3>
              <span className="text-[11px] text-[var(--text-faint)]">
                일정{" "}
                {
                  visible.filter(
                    (event) =>
                      event.startDate.slice(0, 7) <= month &&
                      event.endDate.slice(0, 7) >= month,
                  ).length
                }
                건
              </span>
            </div>
            <div className="grid grid-cols-7 pb-1 text-center text-[11px] font-semibold text-[var(--text-faint)]">
              {WEEKDAYS.map((label, index) => (
                <div
                  key={label}
                  className={
                    index === 0
                      ? "text-[var(--danger)]"
                      : index === 6
                        ? "text-[#2563eb]"
                        : ""
                  }
                >
                  {label}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 overflow-hidden rounded-[var(--radius)] border-l border-t border-[var(--border)]">
              {monthWeeks(month)
                .flat()
                .map((day) => {
                  const inMonth = day.slice(0, 7) === month;
                  const dayEvents = inMonth ? eventsOnDay(visible, day) : [];
                  const dayDeadlines = inMonth
                    ? (deadlines.get(day) ?? [])
                    : [];
                  const holiday = KOREAN_HOLIDAYS[day];
                  const more =
                    dayEvents.length + dayDeadlines.length - chipLimit;
                  return (
                    <div
                      key={day}
                      role="button"
                      tabIndex={inMonth ? 0 : -1}
                      aria-label={`${dayLabel(day)} 일정 ${dayEvents.length}건`}
                      data-date={day}
                      onClick={() => setSelected(day)}
                      onDoubleClick={() => openNew(day)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          setSelected(day);
                        }
                      }}
                      className={`relative min-w-0 cursor-pointer border-b border-r border-[var(--border)] p-0.5 transition sm:p-1 ${
                        span === 2
                          ? "min-h-[72px] sm:min-h-[92px]"
                          : "min-h-[84px] sm:min-h-[118px]"
                      } ${inMonth ? "bg-[var(--surface)] hover:bg-[var(--surface-3)]" : "bg-[var(--surface-2)] opacity-50"} ${
                        selected === day
                          ? "outline outline-2 -outline-offset-2 outline-[var(--accent)]"
                          : ""
                      }`}
                    >
                      <div className="flex items-center gap-1 px-0.5">
                        <span
                          className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full text-[11px] font-semibold ${
                            day === today
                              ? "bg-[var(--accent)] text-white"
                              : dayTone(day)
                          }`}
                        >
                          {Number(day.slice(8, 10))}
                        </span>
                        {holiday && inMonth ? (
                          <span
                            className="truncate text-[10px] text-[var(--danger)]"
                            title={holiday}
                          >
                            {holiday}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-0.5 space-y-0.5">
                        {dayEvents.slice(0, chipLimit).map((event) => (
                          <button
                            key={event.id}
                            type="button"
                            title={`${event.title} · ${eventTimeLabel(event)}`}
                            onClick={(clickEvent) => {
                              clickEvent.stopPropagation();
                              openEvent(event);
                            }}
                            className="block w-full truncate rounded-sm px-1 text-left text-[10px] leading-4 sm:text-[11px]"
                            style={categoryStyle(event.category)}
                          >
                            {!event.allDay &&
                            event.startTime &&
                            event.startDate === day ? (
                              <span className="mr-0.5 hidden font-semibold sm:inline">
                                {event.startTime}
                              </span>
                            ) : null}
                            {event.title}
                          </button>
                        ))}
                        {dayDeadlines
                          .slice(0, Math.max(0, chipLimit - dayEvents.length))
                          .map((entry) => (
                            <button
                              key={entry.key}
                              type="button"
                              title={`${entry.title} · ${entry.label} (${entry.assignee})`}
                              onClick={(clickEvent) => {
                                clickEvent.stopPropagation();
                                onOpenItem(entry.itemId);
                              }}
                              className="block w-full truncate rounded-sm border border-dashed border-[var(--danger-border)] px-1 text-left text-[10px] leading-4 text-[var(--danger)] sm:text-[11px]"
                            >
                              ⚑ {entry.title}
                            </button>
                          ))}
                        {more > 0 ? (
                          <div className="px-1 text-[10px] font-semibold text-[var(--text-faint)]">
                            +{more}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="tb-card tb-section p-4" data-testid="calendar-day">
          <div className="mb-2 flex items-center gap-2">
            <h3 className={`text-sm font-semibold ${dayTone(selected)}`}>
              {dayLabel(selected)}
            </h3>
            {KOREAN_HOLIDAYS[selected] ? (
              <span className="tb-badge tb-badge-danger">
                {KOREAN_HOLIDAYS[selected]}
              </span>
            ) : null}
            <button
              type="button"
              className="tb-btn ml-auto"
              onClick={() => openNew(selected)}
            >
              + 이 날 일정
            </button>
          </div>
          <EventList
            events={selectedEvents}
            members={members}
            onOpen={openEvent}
            showDate={false}
            empty="등록된 일정이 없습니다."
          />
          {selectedDeadlines.length ? (
            <div className="mt-3 space-y-1.5">
              <div className="text-[11px] font-semibold text-[var(--text-faint)]">
                업무 마감
              </div>
              {selectedDeadlines.map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  onClick={() => onOpenItem(entry.itemId)}
                  className="flex w-full items-center gap-2 rounded-[var(--radius)] border border-dashed border-[var(--danger-border)] px-3 py-2 text-left text-sm hover:bg-[var(--surface-3)]"
                >
                  <span className="text-[var(--danger)]">⚑</span>
                  <span className="min-w-0 flex-1 truncate">{entry.title}</span>
                  <span className="shrink-0 text-[11px] text-[var(--text-faint)]">
                    {entry.label} · {entry.assignee}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="tb-card tb-section p-4">
          <h3 className="mb-2 text-sm font-semibold">다가오는 일정 (2주)</h3>
          <EventList
            events={upcoming.slice(0, 12)}
            members={members}
            onOpen={openEvent}
            empty="2주 안에 예정된 일정이 없습니다."
          />
        </div>
      </div>

      {draft ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/40 p-4 backdrop-blur-sm"
          onClick={() => setDraft(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="event-editor-title"
            className="tb-card my-6 w-full max-w-[560px] shadow-[var(--shadow-lg)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3.5">
              <h2 id="event-editor-title" className="text-base font-semibold">
                {draft.id
                  ? canEdit(draft)
                    ? "일정 수정"
                    : "일정 보기"
                  : "새 일정"}
              </h2>
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="tb-iconbtn h-8 w-8"
                aria-label="닫기"
              >
                ×
              </button>
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <fieldset
                disabled={!canEdit(draft) || saving}
                className="space-y-3 px-5 py-4"
              >
                <label className="block">
                  <span className="tb-label">제목</span>
                  <input
                    autoFocus
                    className="tb-field"
                    value={draft.title}
                    maxLength={120}
                    placeholder="예: 주간 회의, ○○습지 현장 조사"
                    onChange={(event) =>
                      setDraft({ ...draft, title: event.target.value })
                    }
                  />
                </label>
                <div
                  className="flex flex-wrap gap-1.5"
                  role="radiogroup"
                  aria-label="분류"
                >
                  {EVENT_CATEGORIES.map((category) => (
                    <button
                      key={category.key}
                      type="button"
                      role="radio"
                      aria-checked={draft.category === category.key}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          category: category.key,
                          allDay: draft.id
                            ? draft.allDay
                            : category.key !== "meeting",
                        })
                      }
                      className="rounded-full border px-2.5 py-1 text-xs font-semibold"
                      style={
                        draft.category === category.key
                          ? {
                              background: category.color,
                              color: "#fff",
                              borderColor: category.color,
                            }
                          : {
                              color: category.color,
                              borderColor: "var(--border)",
                            }
                      }
                    >
                      {category.label}
                    </button>
                  ))}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="tb-label">시작일</span>
                    <input
                      type="date"
                      className="tb-field"
                      value={draft.startDate}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          startDate: event.target.value,
                          endDate:
                            draft.endDate < event.target.value
                              ? event.target.value
                              : draft.endDate,
                        })
                      }
                    />
                  </label>
                  <label className="block">
                    <span className="tb-label">종료일</span>
                    <input
                      type="date"
                      className="tb-field"
                      value={draft.endDate}
                      min={draft.startDate}
                      onChange={(event) =>
                        setDraft({ ...draft, endDate: event.target.value })
                      }
                    />
                  </label>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.allDay}
                    onChange={(event) =>
                      setDraft({ ...draft, allDay: event.target.checked })
                    }
                  />
                  종일
                </label>
                {!draft.allDay ? (
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="tb-label">시작 시간</span>
                      <input
                        type="time"
                        className="tb-field"
                        value={draft.startTime}
                        onChange={(event) =>
                          setDraft({ ...draft, startTime: event.target.value })
                        }
                      />
                    </label>
                    <label className="block">
                      <span className="tb-label">종료 시간</span>
                      <input
                        type="time"
                        className="tb-field"
                        value={draft.endTime}
                        onChange={(event) =>
                          setDraft({ ...draft, endTime: event.target.value })
                        }
                      />
                    </label>
                  </div>
                ) : null}
                <label className="block">
                  <span className="tb-label">장소</span>
                  <input
                    className="tb-field"
                    value={draft.location}
                    maxLength={120}
                    onChange={(event) =>
                      setDraft({ ...draft, location: event.target.value })
                    }
                  />
                </label>
                <div>
                  <div className="tb-label">
                    참석 구성원{" "}
                    {draft.attendeeIds.length
                      ? `(${draft.attendeeIds.length}명)`
                      : "· 선택하지 않으면 팀 전체"}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {activeMembers.map((member) => {
                      const on = draft.attendeeIds.includes(member.id);
                      return (
                        <button
                          key={member.id}
                          type="button"
                          aria-pressed={on}
                          onClick={() =>
                            setDraft({
                              ...draft,
                              attendeeIds: on
                                ? draft.attendeeIds.filter(
                                    (id) => id !== member.id,
                                  )
                                : [...draft.attendeeIds, member.id],
                            })
                          }
                          className="tb-chip tb-chip-btn"
                          data-active={on}
                          style={
                            on
                              ? {
                                  borderColor: "var(--accent)",
                                  background: "var(--accent-soft)",
                                  color: "var(--accent)",
                                }
                              : undefined
                          }
                        >
                          {on ? "✓ " : ""}
                          {member.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <label className="block">
                  <span className="tb-label">알림</span>
                  <select
                    className="tb-field"
                    value={
                      draft.reminderMinutes === null
                        ? ""
                        : String(draft.reminderMinutes)
                    }
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        reminderMinutes:
                          event.target.value === ""
                            ? null
                            : Number(event.target.value),
                      })
                    }
                  >
                    {REMINDER_CHOICES.map((choice) => (
                      <option
                        key={choice.label}
                        value={
                          choice.minutes === null ? "" : String(choice.minutes)
                        }
                      >
                        {choice.label}
                        {draft.allDay && choice.minutes !== null
                          ? " (종일은 오전 9시 기준)"
                          : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="tb-label">메모</span>
                  <textarea
                    className="tb-field min-h-[72px]"
                    value={draft.description}
                    maxLength={2000}
                    onChange={(event) =>
                      setDraft({ ...draft, description: event.target.value })
                    }
                  />
                </label>
              </fieldset>
              {draft.id ? (
                <div className="px-5 pb-2 text-[11px] text-[var(--text-faint)]">
                  등록: {draft.createdByName}
                  {!canEdit(draft)
                    ? " · 등록한 사람 또는 부서장만 수정할 수 있습니다."
                    : ""}
                </div>
              ) : null}
              {linkedMinutes.length ? (
                <div className="flex flex-wrap gap-1.5 px-5 pb-2">
                  {linkedMinutes.map((minute) => (
                    <button
                      key={minute.id}
                      type="button"
                      className="tb-chip tb-chip-btn"
                      onClick={() => {
                        setDraft(null);
                        onOpenMinutes(minute.id);
                      }}
                    >
                      📝 회의록: {minute.title}
                    </button>
                  ))}
                </div>
              ) : null}
              {draftError ? (
                <div
                  className="mx-5 mb-2 rounded-[var(--radius)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]"
                  role="alert"
                >
                  {draftError}
                </div>
              ) : null}
              <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] px-5 py-3">
                {canEdit(draft) ? (
                  <button
                    type="submit"
                    className="tb-btn tb-btn-primary"
                    disabled={saving}
                  >
                    {saving ? "저장 중…" : "저장"}
                  </button>
                ) : null}
                {draft.id && draft.category === "meeting" ? (
                  <button
                    type="button"
                    className="tb-btn"
                    onClick={() => {
                      const event =
                        events.find((entry) => entry.id === draft.id) ??
                        upcoming.find((entry) => entry.id === draft.id);
                      if (event) {
                        setDraft(null);
                        onWriteMinutes(event);
                      }
                    }}
                  >
                    📝 회의록 작성
                  </button>
                ) : null}
                {draft.id && canEdit(draft) ? (
                  <button
                    type="button"
                    className="tb-btn ml-auto text-[var(--danger)]"
                    disabled={saving}
                    onClick={() => void remove()}
                  >
                    삭제
                  </button>
                ) : null}
                <button
                  type="button"
                  className={`tb-btn ${draft.id && canEdit(draft) ? "" : "ml-auto"}`}
                  onClick={() => setDraft(null)}
                >
                  닫기
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
