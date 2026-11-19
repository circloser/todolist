"use client";

import { useEffect } from "react";

import {
  MAX_BULK_EVENTS,
  REPEAT_CHOICES,
  repeatDates,
  shortDay,
  type RepeatFreq,
} from "./lib/calendar-layout";
import {
  EVENT_CATEGORIES,
  REMINDER_CHOICES,
  type CalendarEvent,
  type EventCategory,
  type MeetingMinutes,
} from "./lib/schedule";
import { daysBetween, shiftDate, type TeamMember } from "./lib/team";

// 업무일정 full editor: every field, plus (for new events) 반복 or one event
// per picked day. The quick pop-up in calendar-view.tsx hands over here with
// "옵션 더보기".

export type EventDraft = {
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
  /** New events only: create one copy on each of these days. */
  dates: string[] | null;
  repeat: RepeatFreq;
  repeatCount: number;
  repeatUntil: string;
};

export function newDraft(date: string, category: EventCategory = "meeting", overrides: Partial<EventDraft> = {}): EventDraft {
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
    dates: null,
    repeat: "none",
    repeatCount: 4,
    repeatUntil: "",
    ...overrides,
  };
}

export function draftFromEvent(event: CalendarEvent): EventDraft {
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
    dates: null,
    repeat: "none",
    repeatCount: 4,
    repeatUntil: "",
  };
}

/** Start dates the draft will create (one for edits and plain events). */
export function draftStartDates(draft: EventDraft) {
  if (draft.id) {
    return [draft.startDate];
  }
  if (draft.dates?.length) {
    return draft.dates;
  }
  return repeatDates(draft.startDate, draft.repeat, {
    count: draft.repeatCount,
    until: draft.repeatUntil || null,
  });
}

/** The request bodies for saving the draft (one per created event). */
export function draftBodies(draft: EventDraft) {
  const length = Math.max(0, daysBetween(draft.startDate, draft.endDate));
  const base = {
    title: draft.title,
    category: draft.category,
    allDay: draft.allDay,
    startTime: draft.allDay ? null : draft.startTime,
    endTime: draft.allDay ? null : draft.endTime || null,
    location: draft.location,
    description: draft.description,
    attendeeIds: draft.attendeeIds,
    reminderMinutes: draft.reminderMinutes,
  };
  return draftStartDates(draft).map((date) => ({ ...base, startDate: date, endDate: shiftDate(date, length) }));
}

export default function EventEditor({
  draft,
  editable,
  saving,
  error,
  members,
  linkedMinutes,
  onChange,
  onSave,
  onDelete,
  onDuplicate,
  onWriteMinutes,
  onOpenMinutes,
  onClose,
}: {
  draft: EventDraft;
  editable: boolean;
  saving: boolean;
  error: string;
  members: TeamMember[];
  linkedMinutes: MeetingMinutes[];
  onChange: (draft: EventDraft) => void;
  onSave: () => void;
  onDelete: () => void;
  onDuplicate: (() => void) | null;
  onWriteMinutes: (() => void) | null;
  onOpenMinutes: (id: number) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const activeMembers = members.filter((member) => member.active);
  const starts = draftStartDates(draft);
  const multi = !draft.id && starts.length > 1;
  const set = (patch: Partial<EventDraft>) => onChange({ ...draft, ...patch });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-editor-title"
        className="tb-card my-6 w-full max-w-[560px] !bg-[var(--surface)] shadow-[var(--shadow-lg)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3.5">
          <h2 id="event-editor-title" className="text-base font-semibold">
            {draft.id ? (editable ? "일정 수정" : "일정 보기") : multi ? `새 일정 ${starts.length}개` : "새 일정"}
          </h2>
          <button type="button" onClick={onClose} className="tb-iconbtn h-8 w-8" aria-label="닫기">
            ×
          </button>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSave();
          }}
        >
          <fieldset disabled={!editable || saving} className="space-y-3 px-5 py-4">
            <label className="block">
              <span className="tb-label">제목</span>
              <input
                autoFocus
                className="tb-field"
                value={draft.title}
                maxLength={120}
                placeholder="예: 주간 회의, ○○습지 현장 조사"
                onChange={(event) => set({ title: event.target.value })}
              />
            </label>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="분류">
              {EVENT_CATEGORIES.map((category) => (
                <button
                  key={category.key}
                  type="button"
                  role="radio"
                  aria-checked={draft.category === category.key}
                  onClick={() =>
                    set({ category: category.key, allDay: draft.id ? draft.allDay : category.key !== "meeting" })
                  }
                  className="rounded-full border px-2.5 py-1 text-xs font-semibold"
                  style={
                    draft.category === category.key
                      ? { background: category.color, color: "#fff", borderColor: category.color }
                      : { color: category.color, borderColor: "var(--border)" }
                  }
                >
                  {category.label}
                </button>
              ))}
            </div>
            {draft.dates?.length && !draft.id ? (
              <div className="rounded-[var(--radius)] bg-[var(--surface-2)] px-3 py-2 text-sm">
                <div className="font-semibold">선택한 {draft.dates.length}일에 각각 만듭니다</div>
                <div className="mt-0.5 text-xs text-[var(--text-muted)]">{draft.dates.map(shortDay).join(", ")}</div>
                <button type="button" className="mt-1 text-xs font-semibold text-[var(--accent)] hover:underline" onClick={() => set({ dates: null })}>
                  날짜를 직접 지정
                </button>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="tb-label">시작일</span>
                  <input
                    type="date"
                    className="tb-field"
                    value={draft.startDate}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (!value) {
                        return;
                      }
                      // Keep the length when the start moves (like the common calendars).
                      const length = Math.max(0, daysBetween(draft.startDate, draft.endDate));
                      set({ startDate: value, endDate: shiftDate(value, length) });
                    }}
                  />
                </label>
                <label className="block">
                  <span className="tb-label">종료일</span>
                  <input
                    type="date"
                    className="tb-field"
                    value={draft.endDate}
                    min={draft.startDate}
                    onChange={(event) => set({ endDate: event.target.value || draft.startDate })}
                  />
                </label>
              </div>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={draft.allDay} onChange={(event) => set({ allDay: event.target.checked })} />
              종일
            </label>
            {!draft.allDay ? (
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="tb-label">시작 시간</span>
                  <input type="time" className="tb-field" value={draft.startTime} onChange={(event) => set({ startTime: event.target.value })} />
                </label>
                <label className="block">
                  <span className="tb-label">종료 시간</span>
                  <input type="time" className="tb-field" value={draft.endTime} onChange={(event) => set({ endTime: event.target.value })} />
                </label>
              </div>
            ) : null}
            {!draft.id && !draft.dates?.length ? (
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <label className="block">
                  <span className="tb-label">반복</span>
                  <select className="tb-field" value={draft.repeat} onChange={(event) => set({ repeat: event.target.value as RepeatFreq })}>
                    {REPEAT_CHOICES.map((choice) => (
                      <option key={choice.key} value={choice.key}>
                        {choice.label}
                      </option>
                    ))}
                  </select>
                </label>
                {draft.repeat !== "none" ? (
                  <div className="flex items-end gap-2">
                    <label className="block w-20">
                      <span className="tb-label">횟수</span>
                      <input
                        type="number"
                        min={1}
                        max={MAX_BULK_EVENTS}
                        className="tb-field"
                        value={draft.repeatUntil ? "" : draft.repeatCount}
                        disabled={Boolean(draft.repeatUntil)}
                        aria-label="반복 횟수"
                        onChange={(event) => set({ repeatCount: Math.max(1, Math.min(MAX_BULK_EVENTS, Number(event.target.value) || 1)) })}
                      />
                    </label>
                    <label className="block">
                      <span className="tb-label">또는 종료일</span>
                      <input
                        type="date"
                        className="tb-field"
                        min={draft.startDate}
                        value={draft.repeatUntil}
                        aria-label="반복 종료일"
                        onChange={(event) => set({ repeatUntil: event.target.value })}
                      />
                    </label>
                  </div>
                ) : null}
              </div>
            ) : null}
            {multi && !draft.dates?.length ? (
              <div className="text-xs text-[var(--text-muted)]" data-testid="repeat-preview">
                일정 {starts.length}개가 만들어집니다: {starts.slice(0, 6).map(shortDay).join(", ")}
                {starts.length > 6 ? ` … ${shortDay(starts[starts.length - 1])}` : ""}
              </div>
            ) : null}
            <label className="block">
              <span className="tb-label">장소</span>
              <input className="tb-field" value={draft.location} maxLength={120} onChange={(event) => set({ location: event.target.value })} />
            </label>
            <div>
              <div className="tb-label">
                참석 구성원 {draft.attendeeIds.length ? `(${draft.attendeeIds.length}명)` : "· 선택하지 않으면 팀 전체"}
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
                        set({ attendeeIds: on ? draft.attendeeIds.filter((id) => id !== member.id) : [...draft.attendeeIds, member.id] })
                      }
                      className="tb-chip tb-chip-btn"
                      data-active={on}
                      style={on ? { borderColor: "var(--accent)", background: "var(--accent-soft)", color: "var(--accent)" } : undefined}
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
                value={draft.reminderMinutes === null ? "" : String(draft.reminderMinutes)}
                onChange={(event) => set({ reminderMinutes: event.target.value === "" ? null : Number(event.target.value) })}
              >
                {REMINDER_CHOICES.map((choice) => (
                  <option key={choice.label} value={choice.minutes === null ? "" : String(choice.minutes)}>
                    {choice.label}
                    {draft.allDay && choice.minutes !== null ? " (종일은 오전 9시 기준)" : ""}
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
                onChange={(event) => set({ description: event.target.value })}
              />
            </label>
          </fieldset>
          {draft.id ? (
            <div className="px-5 pb-2 text-[11px] text-[var(--text-faint)]">
              등록: {draft.createdByName}
              {!editable ? " · 등록한 사람 또는 부서장만 수정할 수 있습니다." : ""}
            </div>
          ) : null}
          {linkedMinutes.length ? (
            <div className="flex flex-wrap gap-1.5 px-5 pb-2">
              {linkedMinutes.map((minute) => (
                <button key={minute.id} type="button" className="tb-chip tb-chip-btn" onClick={() => onOpenMinutes(minute.id)}>
                  📝 회의록: {minute.title}
                </button>
              ))}
            </div>
          ) : null}
          {error ? (
            <div className="mx-5 mb-2 rounded-[var(--radius)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]" role="alert">
              {error}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border)] px-5 py-3">
            {editable ? (
              <button type="submit" className="tb-btn tb-btn-primary" disabled={saving}>
                {saving ? "저장 중…" : multi ? `${starts.length}개 저장` : "저장"}
              </button>
            ) : null}
            {onWriteMinutes ? (
              <button type="button" className="tb-btn" onClick={onWriteMinutes}>
                📝 회의록 작성
              </button>
            ) : null}
            {onDuplicate ? (
              <button type="button" className="tb-btn" onClick={onDuplicate}>
                복제
              </button>
            ) : null}
            {draft.id && editable ? (
              <button type="button" className="tb-btn ml-auto text-[var(--danger)]" disabled={saving} onClick={onDelete}>
                삭제
              </button>
            ) : null}
            <button type="button" className={`tb-btn ${draft.id && editable ? "" : "ml-auto"}`} onClick={onClose}>
              닫기
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
