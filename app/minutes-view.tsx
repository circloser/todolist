"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import Highlight from "./highlight";
import { renderMinutesHtml } from "./lib/minutes-report";
import {
  minutesAudience,
  type ActionItem,
  type CalendarEvent,
  type MeetingMinutes,
  type MinutesResponse,
} from "./lib/schedule";
import {
  kstToday,
  weekdayLabel,
  type TeamMember,
  type Viewer,
} from "./lib/team";

// 회의록: minutes shared with the whole board. Attendees are picked from the
// board's members (at least one); every member who was not there confirms
// afterwards that they have read the minutes, and everyone can see who has.

type ApiRequest = (path: string, init?: RequestInit) => Promise<Response>;
type ListFilter = "all" | "unread" | "mine" | "actions";

type Draft = {
  id: number | null;
  title: string;
  meetingDate: string;
  startTime: string;
  endTime: string;
  location: string;
  attendeeIds: number[];
  guests: string;
  agenda: string;
  content: string;
  decisions: string;
  actionItems: ActionItem[];
  eventId: number | null;
};

function emptyDraft(viewer: Viewer | null): Draft {
  return {
    id: null,
    title: "",
    meetingDate: kstToday(),
    startTime: "",
    endTime: "",
    location: "",
    attendeeIds: viewer ? [viewer.memberId] : [],
    guests: "",
    agenda: "",
    content: "",
    decisions: "",
    actionItems: [],
    eventId: null,
  };
}

function draftFromMinute(minute: MeetingMinutes): Draft {
  return {
    id: minute.id,
    title: minute.title,
    meetingDate: minute.meetingDate,
    startTime: minute.startTime ?? "",
    endTime: minute.endTime ?? "",
    location: minute.location,
    attendeeIds: minute.attendeeIds,
    guests: minute.guests,
    agenda: minute.agenda,
    content: minute.content,
    decisions: minute.decisions,
    actionItems: minute.actionItems,
    eventId: minute.eventId,
  };
}

function draftFromEvent(event: CalendarEvent, viewer: Viewer | null): Draft {
  return {
    ...emptyDraft(viewer),
    title: event.title,
    meetingDate: event.startDate,
    startTime: event.allDay ? "" : (event.startTime ?? ""),
    endTime: event.allDay ? "" : (event.endTime ?? ""),
    location: event.location,
    attendeeIds: event.attendeeIds.length
      ? event.attendeeIds
      : viewer
        ? [viewer.memberId]
        : [],
    agenda: event.description,
    eventId: event.id,
  };
}

function dateLabel(
  minute: Pick<MeetingMinutes, "meetingDate" | "startTime" | "endTime">,
) {
  const date = minute.meetingDate;
  const time = minute.startTime
    ? ` ${minute.startTime}${minute.endTime ? `~${minute.endTime}` : ""}`
    : "";
  return `${date.slice(0, 4)}.${Number(date.slice(5, 7))}.${Number(date.slice(8, 10))} (${weekdayLabel(date)})${time}`;
}

function stamp(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString("ko-KR", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function Section({
  title,
  value,
  terms,
}: {
  title: string;
  value: string;
  terms: string[];
}) {
  return (
    <div>
      <h4 className="mb-1 text-xs font-semibold text-[var(--text-faint)]">
        {title}
      </h4>
      <div className="whitespace-pre-wrap rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm leading-6">
        {value.trim() ? (
          <Highlight text={value.trim()} terms={terms} />
        ) : (
          <span className="text-[var(--text-faint)]">-</span>
        )}
      </div>
    </div>
  );
}

type MinutesViewProps = {
  viewer: Viewer | null;
  isManager: boolean;
  members: TeamMember[];
  minutes: MeetingMinutes[];
  loaded: boolean;
  organizationName: string;
  boardTitle: string;
  request: ApiRequest;
  onChanged: () => void;
  focusMinutesId: number | null;
  onFocusHandled: () => void;
  seed: CalendarEvent | null;
  onSeedHandled: () => void;
  onOpenEvent: (id: number) => void;
  /** Search words to mark in the opened minutes (from 통합 검색). */
  highlight?: string[];
};

export default function MinutesView({
  viewer,
  isManager,
  members,
  minutes,
  loaded,
  organizationName,
  boardTitle,
  request,
  onChanged,
  focusMinutesId,
  onFocusHandled,
  seed,
  onSeedHandled,
  onOpenEvent,
  highlight = [],
}: MinutesViewProps) {
  const [filter, setFilter] = useState<ListFilter>("all");
  const [keyword, setKeyword] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loadedDetail, setLoadedDetail] = useState<MeetingMinutes | null>(
    null,
  );
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [printing, setPrinting] = useState(false);
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  const detail =
    loadedDetail && loadedDetail.id === selectedId ? loadedDetail : null;
  const memberId = viewer?.memberId ?? null;
  const me = members.find((member) => member.id === memberId);
  const activeMembers = members.filter((member) => member.active);
  const nameOf = (id: number) =>
    members.find((member) => member.id === id)?.name ?? `#${id}`;

  const needsMyConfirmation = (minute: MeetingMinutes) =>
    memberId !== null &&
    minutesAudience(minute, members).absentees.some(
      (member) => member.id === memberId && !member.acknowledgedAt,
    );

  // Seeded from a 회의 event in 업무일정.
  useEffect(() => {
    if (!seed) {
      return;
    }
    const timer = window.setTimeout(() => {
      setDraft(draftFromEvent(seed, viewer));
      setSelectedId(null);
      setMessage("");
      onSeedHandled();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [onSeedHandled, seed, viewer]);

  // Opened from a notification, the dashboard or a calendar event.
  useEffect(() => {
    if (focusMinutesId === null) {
      return;
    }
    const timer = window.setTimeout(() => {
      setSelectedId(focusMinutesId);
      setDraft(null);
      setMessage("");
      onFocusHandled();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [focusMinutesId, onFocusHandled]);

  useEffect(() => {
    if (selectedId === null) {
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoadingDetail(true);
      void load();
    }, 0);
    const load = async () => {
      try {
        const response = await request(`/api/minutes?id=${selectedId}`, {
          cache: "no-store",
        });
        const data = (await response
          .json()
          .catch(() => ({}))) as MinutesResponse;
        if (!cancelled) {
          setLoadedDetail(response.ok ? (data.minute ?? null) : null);
          if (!response.ok) {
            setMessage(data.error ?? "회의록을 불러오지 못했습니다.");
          }
        }
      } finally {
        if (!cancelled) {
          setLoadingDetail(false);
        }
      }
    };
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [request, selectedId]);

  const query = keyword.trim().toLowerCase();
  const list = minutes.filter((minute) => {
    if (filter === "unread" && !needsMyConfirmation(minute)) {
      return false;
    }
    if (
      filter === "mine" &&
      minute.authorMemberId !== memberId &&
      !minute.attendeeIds.includes(memberId ?? -1)
    ) {
      return false;
    }
    if (
      filter === "actions" &&
      !minute.actionItems.some(
        (item) => item.ownerId === memberId && !item.done,
      )
    ) {
      return false;
    }
    return (
      !query ||
      [
        minute.title,
        minute.location,
        minute.content,
        minute.decisions,
        minute.guests,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  });

  const unreadCount = minutes.filter(needsMyConfirmation).length;
  const canEdit = (minute: MeetingMinutes) =>
    isManager || minute.authorMemberId === memberId;
  const canToggle = (minute: MeetingMinutes, item: ActionItem) =>
    canEdit(minute) || item.ownerId === memberId;

  async function send(
    method: "POST" | "PATCH" | "DELETE",
    body: Record<string, unknown>,
  ) {
    const response = await request("/api/minutes", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as MinutesResponse;
    return { ok: response.ok, data };
  }

  async function save() {
    if (!draft) {
      return;
    }
    if (!draft.attendeeIds.length) {
      setMessage("참석한 구성원을 한 명 이상 선택해 주세요.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const { ok, data } = await send(draft.id ? "PATCH" : "POST", {
        ...draft,
        startTime: draft.startTime || null,
        endTime: draft.endTime || null,
      });
      if (!ok || !data.minute) {
        setMessage(data.error ?? "저장하지 못했습니다.");
        return;
      }
      setDraft(null);
      setLoadedDetail(data.minute);
      setSelectedId(data.minute.id);
      onChanged();
    } catch {
      setMessage("저장하지 못했습니다. 네트워크를 확인해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(minute: MeetingMinutes) {
    if (!window.confirm(`'${minute.title}' 회의록을 삭제할까요?`)) {
      return;
    }
    const { ok, data } = await send("DELETE", { id: minute.id });
    if (!ok) {
      setMessage(data.error ?? "삭제하지 못했습니다.");
      return;
    }
    setSelectedId(null);
    onChanged();
  }

  async function acknowledge(minute: MeetingMinutes, acknowledged: boolean) {
    setSaving(true);
    try {
      const { ok, data } = await send("PATCH", {
        id: minute.id,
        action: "acknowledge",
        acknowledged,
      });
      if (!ok || !data.minute) {
        setMessage(data.error ?? "처리하지 못했습니다.");
        return;
      }
      setLoadedDetail(data.minute);
      setMessage("");
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function toggleAction(
    minute: MeetingMinutes,
    index: number,
    done: boolean,
  ) {
    const { ok, data } = await send("PATCH", {
      id: minute.id,
      action: "toggle-action",
      index,
      done,
    });
    if (!ok || !data.minute) {
      setMessage(data.error ?? "처리하지 못했습니다.");
      return;
    }
    setLoadedDetail(data.minute);
    onChanged();
  }

  const printHtml = useMemo(
    () =>
      detail
        ? renderMinutesHtml(detail, {
            organizationName,
            boardTitle,
            memberNames: new Map(
              members.map((member) => [member.id, member.name] as const),
            ),
            members,
            generatedAt: new Date().toLocaleString("ko-KR"),
            generatedBy: viewer?.name ?? "",
          })
        : "",
    [boardTitle, detail, members, organizationName, viewer?.name],
  );

  const audience = detail ? minutesAudience(detail, members) : null;
  const myAbsence =
    audience?.absentees.find((member) => member.id === memberId) ?? null;
  const showingPane = draft !== null || selectedId !== null;

  return (
    <div
      className="grid gap-4 lg:grid-cols-[minmax(280px,360px)_1fr]"
      data-testid="minutes-view"
    >
      <div
        className={`tb-card flex min-h-[420px] flex-col ${showingPane ? "hidden lg:flex" : ""}`}
      >
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3">
          <h2 className="text-base font-semibold">회의록</h2>
          {unreadCount ? (
            <span
              className="tb-badge tb-badge-warning"
              title="확인하지 않은 회의록"
            >
              확인 필요 {unreadCount}
            </span>
          ) : null}
          <button
            type="button"
            className="tb-btn tb-btn-primary ml-auto"
            onClick={() => {
              setDraft(emptyDraft(viewer));
              setSelectedId(null);
              setMessage("");
            }}
          >
            + 새 회의록
          </button>
        </div>
        <div className="space-y-2 border-b border-[var(--border)] px-4 py-3">
          <input
            className="tb-field"
            value={keyword}
            placeholder="제목·내용·장소 검색"
            onChange={(event) => setKeyword(event.target.value)}
          />
          <div className="tb-seg w-full">
            {(
              [
                ["all", "전체"],
                ["unread", "확인 필요"],
                ["mine", "내 회의"],
                ["actions", "내 할 일"],
              ] as Array<[ListFilter, string]>
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className="tb-seg-btn flex-1 whitespace-nowrap !px-2"
                data-active={filter === key}
                onClick={() => setFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 space-y-1.5 overflow-auto p-3">
          {!loaded ? (
            <div className="py-10 text-center text-sm text-[var(--text-muted)]">
              불러오는 중…
            </div>
          ) : list.length ? (
            list.map((minute) => {
              const info = minutesAudience(minute, members);
              const unread = needsMyConfirmation(minute);
              const openActions = minute.actionItems.filter(
                (item) => !item.done,
              ).length;
              return (
                <button
                  key={minute.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(minute.id);
                    setDraft(null);
                    setMessage("");
                  }}
                  data-active={selectedId === minute.id}
                  className="block w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-left transition hover:border-[var(--accent)] data-[active=true]:border-[var(--accent)] data-[active=true]:bg-[var(--accent-soft)]"
                >
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                      {minute.title}
                    </span>
                    {unread ? (
                      <span className="tb-badge tb-badge-warning">
                        확인 필요
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-[var(--text-faint)]">
                    {dateLabel(minute)} · 참석 {minute.attendeeIds.length}명
                    {info.absentees.length
                      ? ` · 확인 ${info.confirmed}/${info.absentees.length}`
                      : ""}
                    {openActions ? ` · 할 일 ${openActions}` : ""}
                  </div>
                </button>
              );
            })
          ) : (
            <div className="py-10 text-center text-sm text-[var(--text-muted)]">
              {minutes.length
                ? "조건에 맞는 회의록이 없습니다."
                : "아직 회의록이 없습니다. ‘+ 새 회의록’으로 시작하세요."}
            </div>
          )}
        </div>
      </div>

      <div
        className={`tb-card min-h-[420px] ${showingPane ? "" : "hidden lg:block"}`}
      >
        {message ? (
          <div
            className="m-4 mb-0 rounded-[var(--radius)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]"
            role="alert"
          >
            {message}
          </div>
        ) : null}

        {draft ? (
          <form
            className="space-y-3 p-4 sm:p-5"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="tb-btn lg:hidden"
                onClick={() => setDraft(null)}
              >
                ‹ 목록
              </button>
              <h3 className="text-base font-semibold">
                {draft.id ? "회의록 수정" : "새 회의록"}
              </h3>
              {draft.eventId ? (
                <button
                  type="button"
                  className="tb-chip tb-chip-btn"
                  onClick={() => onOpenEvent(draft.eventId as number)}
                >
                  📅 연결된 일정
                </button>
              ) : null}
            </div>
            <label className="block">
              <span className="tb-label">회의명</span>
              <input
                autoFocus
                className="tb-field"
                value={draft.title}
                maxLength={160}
                placeholder="예: 11월 3주차 주간 회의"
                onChange={(event) =>
                  setDraft({ ...draft, title: event.target.value })
                }
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-[1.3fr_1fr_1fr]">
              <label className="block">
                <span className="tb-label">날짜</span>
                <input
                  type="date"
                  className="tb-field"
                  value={draft.meetingDate}
                  onChange={(event) =>
                    setDraft({ ...draft, meetingDate: event.target.value })
                  }
                />
              </label>
              <label className="block">
                <span className="tb-label">시작</span>
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
                <span className="tb-label">종료</span>
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
                참석자 (구성원) <span className="text-[var(--danger)]">*</span>{" "}
                <span className="font-normal text-[var(--text-faint)]">
                  {draft.attendeeIds.length}명 · 선택하지 않은 구성원은
                  미참석자로 확인 요청을 받습니다
                </span>
              </div>
              <div
                className="flex flex-wrap gap-1.5"
                data-testid="minutes-attendees"
              >
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
                            ? draft.attendeeIds.filter((id) => id !== member.id)
                            : [...draft.attendeeIds, member.id],
                        })
                      }
                      className="tb-chip tb-chip-btn"
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
                      {member.role ? (
                        <span className="text-[var(--text-faint)]">
                          {member.role}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
                <button
                  type="button"
                  className="tb-chip tb-chip-btn"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      attendeeIds:
                        draft.attendeeIds.length === activeMembers.length
                          ? []
                          : activeMembers.map((member) => member.id),
                    })
                  }
                >
                  {draft.attendeeIds.length === activeMembers.length
                    ? "모두 해제"
                    : "전원 참석"}
                </button>
              </div>
            </div>
            <label className="block">
              <span className="tb-label">외부 참석자</span>
              <input
                className="tb-field"
                value={draft.guests}
                maxLength={300}
                placeholder="예: ○○대학교 김교수, 시청 환경과 담당자"
                onChange={(event) =>
                  setDraft({ ...draft, guests: event.target.value })
                }
              />
            </label>
            <label className="block">
              <span className="tb-label">안건</span>
              <textarea
                className="tb-field min-h-[64px]"
                value={draft.agenda}
                onChange={(event) =>
                  setDraft({ ...draft, agenda: event.target.value })
                }
              />
            </label>
            <label className="block">
              <span className="tb-label">회의 내용</span>
              <textarea
                className="tb-field min-h-[160px]"
                value={draft.content}
                onChange={(event) =>
                  setDraft({ ...draft, content: event.target.value })
                }
              />
            </label>
            <label className="block">
              <span className="tb-label">결정 사항</span>
              <textarea
                className="tb-field min-h-[64px]"
                value={draft.decisions}
                onChange={(event) =>
                  setDraft({ ...draft, decisions: event.target.value })
                }
              />
            </label>
            <div>
              <div className="tb-label">후속 조치</div>
              <div className="space-y-1.5">
                {draft.actionItems.map((item, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-[1fr_auto] gap-1.5 sm:grid-cols-[1fr_130px_140px_auto]"
                  >
                    <input
                      className="tb-field"
                      value={item.text}
                      placeholder="할 일"
                      aria-label={`후속 조치 ${index + 1}`}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          actionItems: draft.actionItems.map(
                            (entry, position) =>
                              position === index
                                ? { ...entry, text: event.target.value }
                                : entry,
                          ),
                        })
                      }
                    />
                    <button
                      type="button"
                      className="tb-iconbtn tb-iconbtn-danger h-9 w-9 sm:order-last"
                      aria-label="후속 조치 삭제"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          actionItems: draft.actionItems.filter(
                            (_, position) => position !== index,
                          ),
                        })
                      }
                    >
                      ×
                    </button>
                    <select
                      className="tb-field"
                      aria-label="담당"
                      value={item.ownerId ?? ""}
                      onChange={(event) => {
                        const ownerId = event.target.value
                          ? Number(event.target.value)
                          : null;
                        setDraft({
                          ...draft,
                          actionItems: draft.actionItems.map(
                            (entry, position) =>
                              position === index
                                ? {
                                    ...entry,
                                    ownerId,
                                    ownerName: ownerId ? nameOf(ownerId) : "",
                                  }
                                : entry,
                          ),
                        });
                      }}
                    >
                      <option value="">담당 없음</option>
                      {activeMembers.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="date"
                      className="tb-field"
                      aria-label="기한"
                      value={item.dueDate ?? ""}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          actionItems: draft.actionItems.map(
                            (entry, position) =>
                              position === index
                                ? {
                                    ...entry,
                                    dueDate: event.target.value || null,
                                  }
                                : entry,
                          ),
                        })
                      }
                    />
                  </div>
                ))}
                <button
                  type="button"
                  className="tb-btn"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      actionItems: [
                        ...draft.actionItems,
                        {
                          text: "",
                          ownerId: null,
                          ownerName: "",
                          dueDate: null,
                          done: false,
                        },
                      ],
                    })
                  }
                >
                  + 후속 조치 추가
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2 border-t border-[var(--border)] pt-3">
              <button
                type="submit"
                className="tb-btn tb-btn-primary"
                disabled={saving}
              >
                {saving ? "저장 중…" : "저장"}
              </button>
              <button
                type="button"
                className="tb-btn"
                onClick={() => setDraft(null)}
              >
                취소
              </button>
              <span className="ml-auto text-[11px] text-[var(--text-faint)]">
                저장하면 보드의 모든 구성원이 볼 수 있습니다.
              </span>
            </div>
          </form>
        ) : detail && audience ? (
          <article
            className="space-y-4 p-4 sm:p-5"
            data-testid="minutes-detail"
          >
            <div className="flex flex-wrap items-start gap-2">
              <button
                type="button"
                className="tb-btn lg:hidden"
                onClick={() => setSelectedId(null)}
              >
                ‹ 목록
              </button>
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-semibold leading-7">
                  <Highlight text={detail.title} terms={highlight} />
                </h3>
                <div className="text-xs text-[var(--text-muted)]">
                  {dateLabel(detail)}
                  {detail.location ? ` · ${detail.location}` : ""} · 작성{" "}
                  {detail.authorName}
                  {detail.updatedBy && detail.updatedBy !== detail.authorName
                    ? ` · 수정 ${detail.updatedBy}`
                    : ""}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {detail.eventId ? (
                  <button
                    type="button"
                    className="tb-btn"
                    onClick={() => onOpenEvent(detail.eventId as number)}
                  >
                    📅 일정
                  </button>
                ) : null}
                <button
                  type="button"
                  className="tb-btn"
                  onClick={() => setPrinting(true)}
                >
                  인쇄
                </button>
                {canEdit(detail) ? (
                  <>
                    <button
                      type="button"
                      className="tb-btn"
                      onClick={() => setDraft(draftFromMinute(detail))}
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      className="tb-btn text-[var(--danger)]"
                      onClick={() => void remove(detail)}
                    >
                      삭제
                    </button>
                  </>
                ) : null}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-[var(--radius)] border border-[var(--border)] p-3">
                <h4 className="mb-1.5 text-xs font-semibold text-[var(--text-faint)]">
                  참석자 {audience.attendees.length}명
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {audience.attendees.map((member) => (
                    <span key={member.id} className="tb-chip">
                      {member.name}
                    </span>
                  ))}
                  {detail.guests ? (
                    <span className="tb-chip text-[var(--text-muted)]">
                      외부: {detail.guests}
                    </span>
                  ) : null}
                </div>
              </div>
              <div
                className="rounded-[var(--radius)] border border-[var(--border)] p-3"
                data-testid="minutes-reads"
              >
                <h4 className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-[var(--text-faint)]">
                  미참석자 확인
                  {audience.absentees.length ? (
                    <span
                      className={`tb-badge ${audience.confirmed === audience.absentees.length ? "tb-badge-success" : "tb-badge-muted"}`}
                    >
                      {audience.confirmed}/{audience.absentees.length}
                    </span>
                  ) : null}
                </h4>
                {audience.absentees.length ? (
                  <ul className="space-y-1">
                    {audience.absentees.map((member) => (
                      <li
                        key={member.id}
                        className="flex items-center gap-2 text-sm"
                      >
                        <span
                          className={
                            member.acknowledgedAt
                              ? "text-[var(--success)]"
                              : "text-[var(--text-faint)]"
                          }
                        >
                          {member.acknowledgedAt ? "✓" : "○"}
                        </span>
                        <span className="min-w-0 flex-1 truncate">
                          {member.name}
                        </span>
                        <span className="text-[11px] text-[var(--text-faint)]">
                          {member.acknowledgedAt
                            ? `${stamp(member.acknowledgedAt)} 확인`
                            : "미확인"}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-sm text-[var(--text-faint)]">
                    모든 구성원이 참석했습니다.
                  </div>
                )}
              </div>
            </div>

            {myAbsence ? (
              <div
                className={`flex flex-wrap items-center gap-3 rounded-[var(--radius)] border px-4 py-3 ${
                  myAbsence.acknowledgedAt
                    ? "border-[var(--success-border)] bg-[var(--success-soft)]"
                    : "border-[var(--warning-border)] bg-[var(--warning-soft)]"
                }`}
              >
                <div className="min-w-0 flex-1 text-sm">
                  {myAbsence.acknowledgedAt
                    ? `${stamp(myAbsence.acknowledgedAt)}에 회의 내용을 확인했습니다.`
                    : `${me?.name ?? "회원"}님은 이 회의에 참석하지 않았습니다. 내용을 읽은 뒤 확인을 눌러 주세요.`}
                </div>
                {myAbsence.acknowledgedAt ? (
                  <button
                    type="button"
                    className="tb-btn"
                    disabled={saving}
                    onClick={() => void acknowledge(detail, false)}
                  >
                    확인 취소
                  </button>
                ) : (
                  <button
                    type="button"
                    className="tb-btn tb-btn-primary"
                    disabled={saving}
                    onClick={() => void acknowledge(detail, true)}
                  >
                    ✓ 회의 내용을 확인했습니다
                  </button>
                )}
              </div>
            ) : null}

            <Section title="안건" value={detail.agenda} terms={highlight} />
            <Section title="회의 내용" value={detail.content} terms={highlight} />
            <Section title="결정 사항" value={detail.decisions} terms={highlight} />

            <div>
              <h4 className="mb-1 text-xs font-semibold text-[var(--text-faint)]">
                후속 조치
              </h4>
              {detail.actionItems.length ? (
                <ul className="divide-y divide-[var(--border)] rounded-[var(--radius)] border border-[var(--border)]">
                  {detail.actionItems.map((item, index) => (
                    <li
                      key={index}
                      className="flex items-center gap-2.5 px-3 py-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={item.done}
                        disabled={!canToggle(detail, item)}
                        aria-label={`${item.text} 완료`}
                        onChange={(event) =>
                          void toggleAction(detail, index, event.target.checked)
                        }
                      />
                      <span
                        className={`min-w-0 flex-1 ${item.done ? "text-[var(--text-faint)] line-through" : ""}`}
                      >
                        <Highlight text={item.text} terms={highlight} />
                      </span>
                      <span className="shrink-0 text-[11px] text-[var(--text-faint)]">
                        {item.ownerName || "담당 없음"}
                        {item.dueDate
                          ? ` · ~${Number(item.dueDate.slice(5, 7))}/${Number(item.dueDate.slice(8, 10))}`
                          : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-sm text-[var(--text-faint)]">-</div>
              )}
            </div>
          </article>
        ) : (
          <div className="flex h-full min-h-[420px] flex-col items-center justify-center gap-2 p-6 text-center text-sm text-[var(--text-muted)]">
            {loadingDetail ? (
              "불러오는 중…"
            ) : (
              <>
                <div className="text-3xl">📝</div>
                왼쪽 목록에서 회의록을 고르거나 새 회의록을 작성하세요.
                {unreadCount ? (
                  <div className="text-[var(--warning)]">
                    확인하지 않은 회의록이 {unreadCount}건 있습니다.
                  </div>
                ) : null}
              </>
            )}
          </div>
        )}
      </div>

      {printing && detail ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/40 p-4 backdrop-blur-sm"
          onClick={() => setPrinting(false)}
        >
          <div
            className="tb-card my-6 w-full max-w-[900px] shadow-[var(--shadow-lg)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-[var(--border)] px-5 py-3">
              <h2 className="text-base font-semibold">회의록 인쇄</h2>
              <button
                type="button"
                className="tb-btn tb-btn-primary ml-auto"
                onClick={() => {
                  const frame = frameRef.current?.contentWindow;
                  frame?.focus();
                  frame?.print();
                }}
              >
                인쇄 / PDF
              </button>
              <button
                type="button"
                className="tb-iconbtn h-8 w-8"
                aria-label="닫기"
                onClick={() => setPrinting(false)}
              >
                ×
              </button>
            </div>
            <div className="p-4">
              <iframe
                ref={frameRef}
                title="회의록 미리보기"
                srcDoc={printHtml}
                className="h-[72vh] w-full rounded-[var(--radius)] border border-[var(--border)] bg-[#dfe5df]"
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
