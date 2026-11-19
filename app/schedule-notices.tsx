"use client";

import { useEffect } from "react";

import { categoryStyle } from "./calendar-view";
import { categoryOf, eventTimeLabel, type CalendarEvent } from "./lib/schedule";
import type { TeamMember } from "./lib/team";
import { describeEvent, type ScheduleFeed } from "./schedule-feed";

// The schedule part of the 알림 panel, and the small pop-ups that appear when
// a reminder is due or a teammate adds an event or minutes.

function NoticeRow({ event, onOpen, note }: { event: CalendarEvent; onOpen: () => void; note?: string }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-2.5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-left transition hover:border-[var(--accent)] hover:bg-[var(--surface-3)]"
    >
      <span className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold" style={categoryStyle(event.category)}>
        {categoryOf(event.category).label}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{event.title}</span>
        <span className="block truncate text-[11px] text-[var(--text-faint)]">
          {note ?? `${eventTimeLabel(event)}${event.location ? ` · ${event.location}` : ""}`}
        </span>
      </span>
    </button>
  );
}

function Group({ title, count, children, action }: { title: string; count: number; children: React.ReactNode; action?: React.ReactNode }) {
  if (!count) {
    return null;
  }
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold">
        {title}
        <span className="tb-badge tb-badge-muted">{count}</span>
        {action ? <span className="ml-auto">{action}</span> : null}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

export function ScheduleNotices({
  feed,
  members,
  onOpenEvent,
  onOpenMinutes,
}: {
  feed: ScheduleFeed;
  members: TeamMember[];
  onOpenEvent: (id: number) => void;
  onOpenMinutes: (id: number) => void;
}) {
  const { summary, fresh, permission } = feed;
  const nothing =
    !summary.today.length && !summary.tomorrow.length && !fresh.length && !summary.unreadMinutes.length && !summary.myActions.length;
  const nameOf = (id: number | null) => members.find((member) => member.id === id)?.name;

  return (
    <div className="space-y-4" data-testid="schedule-notices">
      {permission !== "unsupported" ? (
        <div className="flex items-center gap-2 rounded-[var(--radius)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--text-muted)]">
          <span className="min-w-0 flex-1">
            {permission === "granted"
              ? "🔔 브라우저 알림이 켜져 있습니다. 일정 시작 전과 새 회의록이 올라오면 알려 드립니다."
              : permission === "denied"
                ? "브라우저 설정에서 이 사이트의 알림이 차단되어 있습니다. 화면 안 알림만 표시됩니다."
                : "브라우저 알림을 켜면 다른 창을 보고 있을 때도 일정 알림을 받습니다."}
          </span>
          {permission === "default" ? (
            <button type="button" className="tb-btn" onClick={() => void feed.requestPermission()}>
              알림 켜기
            </button>
          ) : null}
        </div>
      ) : null}

      <Group title="오늘 일정" count={summary.today.length}>
        {summary.today.map((event) => (
          <NoticeRow key={event.id} event={event} onOpen={() => onOpenEvent(event.id)} />
        ))}
      </Group>
      <Group title="내일 일정" count={summary.tomorrow.length}>
        {summary.tomorrow.map((event) => (
          <NoticeRow key={event.id} event={event} onOpen={() => onOpenEvent(event.id)} />
        ))}
      </Group>
      <Group
        title="새로 등록·변경된 일정"
        count={fresh.length}
        action={
          <button type="button" className="text-xs font-normal text-[var(--accent)] hover:underline" onClick={feed.markEventsSeen}>
            모두 확인
          </button>
        }
      >
        {fresh.map((event) => (
          <NoticeRow
            key={event.id}
            event={event}
            note={`${describeEvent(event)} · ${event.updatedBy || event.createdByName}`}
            onOpen={() => onOpenEvent(event.id)}
          />
        ))}
      </Group>
      <Group title="확인할 회의록" count={summary.unreadMinutes.length}>
        {summary.unreadMinutes.map((minute) => (
          <button
            key={minute.id}
            type="button"
            onClick={() => onOpenMinutes(minute.id)}
            className="flex w-full items-center gap-2.5 rounded-[var(--radius)] border border-[var(--warning-border)] bg-[var(--warning-soft)] px-3 py-2 text-left transition hover:border-[var(--accent)]"
          >
            <span className="text-base">📝</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{minute.title}</span>
              <span className="block truncate text-[11px] text-[var(--text-muted)]">
                {minute.meetingDate} · {minute.authorName} 작성 · 미참석 — 내용 확인 필요
              </span>
            </span>
          </button>
        ))}
      </Group>
      <Group title="내 후속 조치 (3일 이내·지연)" count={summary.myActions.length}>
        {summary.myActions.map((action, index) => (
          <button
            key={`${action.minutesId}-${index}`}
            type="button"
            onClick={() => onOpenMinutes(action.minutesId)}
            className="flex w-full items-center gap-2.5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-left transition hover:border-[var(--accent)]"
          >
            <span className="tb-badge tb-badge-warning">{action.dueDate ? `~${action.dueDate.slice(5).replace("-", "/")}` : "기한 없음"}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{action.text}</span>
              <span className="block truncate text-[11px] text-[var(--text-faint)]">
                {action.minutesTitle}
                {nameOf(action.ownerId) ? ` · ${nameOf(action.ownerId)}` : ""}
              </span>
            </span>
          </button>
        ))}
      </Group>
      {nothing ? <div className="py-2 text-center text-sm text-[var(--text-muted)]">새 일정·회의록 알림이 없습니다.</div> : null}
    </div>
  );
}

const AUTO_HIDE_MS = 15_000;

export function ScheduleToasts({
  feed,
  onOpenEvent,
  onOpenMinutes,
  onOpenCalendar,
}: {
  feed: ScheduleFeed;
  onOpenEvent: (id: number) => void;
  onOpenMinutes: (id: number) => void;
  onOpenCalendar: () => void;
}) {
  const { toasts, dismissToast } = feed;

  // Reminders and minutes stay until dismissed; the rest fade on their own.
  useEffect(() => {
    const timers = toasts
      .filter((toast) => toast.kind === "new-event" || toast.kind === "today")
      .map((toast) => window.setTimeout(() => dismissToast(toast.id), AUTO_HIDE_MS));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [dismissToast, toasts]);

  if (!toasts.length) {
    return null;
  }
  return (
    <div
      className="pointer-events-none fixed bottom-[max(12px,env(safe-area-inset-bottom))] left-3 right-3 z-[60] flex flex-col items-end gap-2 sm:bottom-4 sm:left-auto sm:right-4 sm:w-[360px]"
      aria-live="polite"
      data-testid="schedule-toasts"
    >
      {toasts.map((toast, index) => (
        <div
          key={toast.id}
          role="status"
          // On a phone only the newest pop-up shows; the rest stay in 알림.
          className={`pointer-events-auto w-full rounded-[var(--radius-lg)] border bg-[var(--surface)] px-3 py-2 shadow-[var(--shadow-lg)] sm:p-3 ${
            index < toasts.length - 1 ? "hidden sm:block" : ""
          } ${
            toast.kind === "reminder"
              ? "border-[var(--accent)]"
              : toast.kind === "minutes"
                ? "border-[var(--warning-border)]"
                : "border-[var(--border)]"
          }`}
        >
          <div className="flex items-start gap-2">
            <button
              type="button"
              className="min-w-0 flex-1 text-left"
              onClick={() => {
                dismissToast(toast.id);
                if (toast.minutesId) {
                  onOpenMinutes(toast.minutesId);
                } else if (toast.eventId) {
                  onOpenEvent(toast.eventId);
                } else {
                  onOpenCalendar();
                }
              }}
            >
              <div className="text-sm font-semibold">{toast.title}</div>
              <div className="mt-0.5 line-clamp-2 whitespace-pre-line text-xs leading-5 text-[var(--text-muted)] sm:line-clamp-none">{toast.body}</div>
            </button>
            <button type="button" className="tb-iconbtn h-7 w-7 shrink-0" aria-label="알림 닫기" onClick={() => dismissToast(toast.id)}>
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
