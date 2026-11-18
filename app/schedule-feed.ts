"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  categoryOf,
  eventStartMs,
  eventTimeLabel,
  eventsOnDay,
  myOpenActions,
  reminderAtMs,
  remindsMember,
  unreadMinutesFor,
  type CalendarEvent,
  type EventsResponse,
  type MeetingMinutes,
  type MinutesResponse,
} from "./lib/schedule";
import { kstToday, shiftDate, type TeamMember, type Viewer } from "./lib/team";

// Shared 업무일정·회의록 data for the board: the near-term events, the minutes
// list, what other members added since I last looked, and in-page / browser
// reminders. Polled every few minutes so a change by one member reaches the
// others without a reload.

type ApiRequest = (path: string, init?: RequestInit) => Promise<Response>;

export type ScheduleToast = {
  id: string;
  scope: string;
  kind: "reminder" | "new-event" | "minutes" | "today";
  title: string;
  body: string;
  eventId?: number;
  minutesId?: number;
};

const POLL_MS = 5 * 60_000;
/** How late a reminder may still pop (e.g. the tab was asleep). */
const REMINDER_GRACE_MS = 15 * 60_000;
const WINDOW_BEFORE_DAYS = 1;
const WINDOW_AFTER_DAYS = 45;

type FeedState = {
  scope: string;
  events: CalendarEvent[];
  minutes: MeetingMinutes[];
  /** Events other members added or changed since I last opened 업무일정. */
  fresh: CalendarEvent[];
  loaded: boolean;
  version: number;
};

const NO_EVENTS: CalendarEvent[] = [];
const NO_MINUTES: MeetingMinutes[] = [];

function emptyFeed(scope: string): FeedState {
  return {
    scope,
    events: NO_EVENTS,
    minutes: NO_MINUTES,
    fresh: NO_EVENTS,
    loaded: false,
    version: 0,
  };
}

function storageGet(key: string) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private mode etc.: reminders may repeat, which is harmless.
  }
}

function browserNotify(title: string, body: string) {
  try {
    if (
      typeof Notification !== "undefined" &&
      Notification.permission === "granted"
    ) {
      new Notification(title, { body, tag: `${title}-${body}`.slice(0, 120) });
    }
  } catch {
    // Some mobile browsers only allow notifications from a service worker.
  }
}

export function describeEvent(event: CalendarEvent) {
  const day = `${Number(event.startDate.slice(5, 7))}/${Number(event.startDate.slice(8, 10))}`;
  return `[${categoryOf(event.category).label}] ${day} ${eventTimeLabel(event)}${event.location ? ` · ${event.location}` : ""}`;
}

export function useScheduleFeed({
  request,
  workspaceId,
  viewer,
  members,
  enabled,
}: {
  request: ApiRequest;
  workspaceId: string;
  viewer: Viewer | null;
  members: TeamMember[];
  enabled: boolean;
}) {
  const memberId = viewer?.memberId ?? null;
  const scope = `${workspaceId}:${memberId ?? "-"}`;
  const seenKey = `wc-events-seen:${scope}`;
  const myCreatedAt = members.find(
    (member) => member.id === memberId,
  )?.createdAt;

  // Everything is tagged with the board+member it was loaded for, so
  // switching boards never shows the previous board's schedule.
  const [state, setState] = useState<FeedState>(() => emptyFeed(""));
  const [allToasts, setToasts] = useState<ScheduleToast[]>([]);
  const [permission, setPermission] = useState<
    NotificationPermission | "unsupported"
  >(() =>
    typeof Notification === "undefined" ? "unsupported" : Notification.permission,
  );
  const knownMinutes = useRef<Map<string, Set<number>>>(new Map());
  const knownFresh = useRef<Set<string>>(new Set());

  const data = state.scope === scope ? state : emptyFeed(scope);
  const { events, minutes, fresh, loaded, version } = data;
  const toasts = allToasts.filter((toast) => toast.scope === scope);

  const pushToast = useCallback((toast: ScheduleToast) => {
    setToasts((current) =>
      current.some((entry) => entry.id === toast.id)
        ? current
        : [...current, toast].slice(-4),
    );
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const refresh = useCallback(async () => {
    if (!enabled || memberId === null) {
      return;
    }
    const today = kstToday();
    const from = shiftDate(today, -WINDOW_BEFORE_DAYS);
    const to = shiftDate(today, WINDOW_AFTER_DAYS);
    let since = storageGet(seenKey);
    if (!since) {
      // First visit on this device: start counting "new" from now.
      since = new Date().toISOString();
      storageSet(seenKey, since);
    }
    try {
      const [eventResponse, minutesResponse, freshResponse] = await Promise.all(
        [
          request(`/api/events?from=${from}&to=${to}`, { cache: "no-store" }),
          request("/api/minutes", { cache: "no-store" }),
          request(`/api/events?changedSince=${encodeURIComponent(since)}`, {
            cache: "no-store",
          }),
        ],
      );
      const eventData = (await eventResponse
        .json()
        .catch(() => ({}))) as EventsResponse;
      const minutesData = (await minutesResponse
        .json()
        .catch(() => ({}))) as MinutesResponse;
      const freshData = (await freshResponse
        .json()
        .catch(() => ({}))) as EventsResponse;

      const others = freshResponse.ok
        ? (freshData.events ?? []).filter(
            (event) => event.updatedBy !== viewer?.name,
          )
        : null;
      const list = minutesResponse.ok ? (minutesData.minutes ?? []) : null;
      const nextEvents = eventResponse.ok ? (eventData.events ?? []) : null;

      setState((previous) => {
        const base = previous.scope === scope ? previous : emptyFeed(scope);
        return {
          scope,
          events: nextEvents ?? base.events,
          minutes: list ?? base.minutes,
          fresh: others ?? base.fresh,
          loaded: true,
          version: base.version + 1,
        };
      });

      for (const event of others ?? []) {
        const key = `${scope}:${event.id}:${event.updatedAt}`;
        if (!knownFresh.current.has(key)) {
          knownFresh.current.add(key);
          pushToast({
            id: `new-${key}`,
            scope,
            kind: "new-event",
            title: `새 일정 · ${event.title}`,
            body: `${describeEvent(event)} — ${event.updatedBy || event.createdByName}`,
            eventId: event.id,
          });
        }
      }

      const unread = list ? unreadMinutesFor(list, memberId, myCreatedAt) : [];
      if (list) {
        const known = knownMinutes.current.get(scope);
        if (known) {
          for (const minute of unread) {
            if (!known.has(minute.id)) {
              pushToast({
                id: `minutes-${scope}-${minute.id}`,
                scope,
                kind: "minutes",
                title: `새 회의록 · ${minute.title}`,
                body: `${minute.authorName}님이 작성했습니다. 내용을 확인해 주세요.`,
                minutesId: minute.id,
              });
              browserNotify(
                `새 회의록 · ${minute.title}`,
                "회의에 참석하지 않았다면 내용을 확인해 주세요.",
              );
            }
          }
        }
        knownMinutes.current.set(scope, new Set(list.map((minute) => minute.id)));
      }

      // Once a day per board: what's on today.
      const dailyKey = `wc-daily:${scope}`;
      if (nextEvents && list && storageGet(dailyKey) !== today) {
        storageSet(dailyKey, today);
        const todays = eventsOnDay(nextEvents, today);
        if (todays.length || unread.length) {
          pushToast({
            id: `today-${scope}-${today}`,
            scope,
            kind: "today",
            title: todays.length
              ? `오늘 일정 ${todays.length}건`
              : "확인할 회의록",
            body: [
              ...todays
                .slice(0, 3)
                .map((event) => `${eventTimeLabel(event)} ${event.title}`),
              todays.length > 3 ? `외 ${todays.length - 3}건` : "",
              unread.length ? `확인하지 않은 회의록 ${unread.length}건` : "",
            ]
              .filter(Boolean)
              .join("\n"),
          });
        }
      }
    } catch {
      // Offline for a moment: keep what we have and try on the next tick.
    }
  }, [
    enabled,
    memberId,
    myCreatedAt,
    pushToast,
    request,
    scope,
    seenKey,
    viewer?.name,
  ]);

  // Initial load, polling and refresh when the tab becomes visible again.
  useEffect(() => {
    if (!enabled || memberId === null) {
      return;
    }
    const first = window.setTimeout(() => void refresh(), 0);
    const timer = window.setInterval(() => void refresh(), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, memberId, refresh]);

  const today = kstToday();
  const tomorrow = shiftDate(today, 1);

  // Reminders for events starting soon (attendees, or everyone when none picked).
  useEffect(() => {
    if (memberId === null) {
      return;
    }
    const timers: number[] = [];
    const now = Date.now();
    for (const event of events) {
      const at = reminderAtMs(event);
      if (at === null || !remindsMember(event, memberId)) {
        continue;
      }
      const start = eventStartMs(event);
      if (
        at - now > 24 * 60 * 60_000 ||
        now - at > REMINDER_GRACE_MS ||
        now > start + 60_000
      ) {
        continue;
      }
      const key = `wc-reminded:${scope}:${event.id}:${event.startDate}:${event.startTime ?? ""}:${event.reminderMinutes}`;
      if (storageGet(key)) {
        continue;
      }
      timers.push(
        window.setTimeout(
          () => {
            if (storageGet(key)) {
              return;
            }
            storageSet(key, new Date().toISOString());
            const minutesLeft = Math.max(
              0,
              Math.round((start - Date.now()) / 60_000),
            );
            const when = event.allDay
              ? event.startDate === kstToday()
                ? "오늘"
                : "내일"
              : minutesLeft <= 0
                ? "지금 시작"
                : minutesLeft < 60
                  ? `${minutesLeft}분 후`
                  : `${Math.round(minutesLeft / 60)}시간 후`;
            const body = `${when} · ${describeEvent(event)}`;
            pushToast({
              id: `remind-${key}`,
              scope,
              kind: "reminder",
              title: `⏰ ${event.title}`,
              body,
              eventId: event.id,
            });
            browserNotify(`⏰ ${event.title}`, body);
          },
          Math.max(0, at - now),
        ),
      );
    }
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [events, memberId, pushToast, scope]);

  const markEventsSeen = useCallback(() => {
    storageSet(seenKey, new Date().toISOString());
    setState((previous) =>
      previous.scope === scope && previous.fresh.length
        ? { ...previous, fresh: [] }
        : previous,
    );
  }, [scope, seenKey]);

  const requestPermission = useCallback(async () => {
    if (typeof Notification === "undefined") {
      setPermission("unsupported");
      return;
    }
    try {
      setPermission(await Notification.requestPermission());
    } catch {
      setPermission(Notification.permission);
    }
  }, []);

  const summary = useMemo(() => {
    const mine = (event: CalendarEvent) => remindsMember(event, memberId);
    return {
      today: eventsOnDay(events, today),
      tomorrow: eventsOnDay(events, tomorrow),
      upcoming: events
        .filter(
          (event) =>
            event.endDate >= today && event.startDate <= shiftDate(today, 14),
        )
        .sort(
          (first, second) =>
            first.startDate.localeCompare(second.startDate) ||
            Number(first.allDay === false) - Number(second.allDay === false) ||
            (first.startTime ?? "").localeCompare(second.startTime ?? ""),
        ),
      unreadMinutes: unreadMinutesFor(minutes, memberId, myCreatedAt),
      myActions: myOpenActions(minutes, memberId, today),
      mine,
    };
  }, [events, memberId, minutes, myCreatedAt, today, tomorrow]);

  const count =
    summary.today.filter(summary.mine).length +
    fresh.length +
    summary.unreadMinutes.length +
    summary.myActions.length;

  return {
    events,
    minutes,
    fresh,
    loaded,
    toasts,
    version,
    permission,
    summary,
    count,
    refresh,
    markEventsSeen,
    dismissToast,
    requestPermission,
  };
}

export type ScheduleFeed = ReturnType<typeof useScheduleFeed>;
