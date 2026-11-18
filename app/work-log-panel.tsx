"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  dailyActivityLines,
  dailyStatus,
  formatLogDate,
  isWeekend,
  kstToday,
  monthRange,
  shiftDate,
  workLogsToCsv,
  type TeamMember,
  type WorkLog,
  type WorkLogsResponse,
} from "./lib/team";
import { assigneeName, isItemDone, type WorkflowItem } from "./lib/workflow";

type ApiRequest = (path: string, init?: RequestInit) => Promise<Response>;
type Tab = "write" | "team" | "history";

type Draft = {
  content: string;
  plan: string;
  issues: string;
  itemIds: number[];
};

const EMPTY_DRAFT: Draft = { content: "", plan: "", issues: "", itemIds: [] };

type WorkLogPanelProps = {
  members: TeamMember[];
  items: WorkflowItem[];
  currentActor: string;
  organizationName: string;
  request: ApiRequest;
  onOpenMembers: () => void;
  onClose: () => void;
};

function draftFrom(log: WorkLog | null): Draft {
  return log
    ? {
        content: log.content,
        plan: log.plan,
        issues: log.issues,
        itemIds: log.itemIds,
      }
    : EMPTY_DRAFT;
}

function sameDraft(first: Draft, second: Draft) {
  return (
    first.content.trim() === second.content.trim() &&
    first.plan.trim() === second.plan.trim() &&
    first.issues.trim() === second.issues.trim() &&
    first.itemIds.join(",") === second.itemIds.join(",")
  );
}

function formatTime(iso: string) {
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

export default function WorkLogPanel({
  members,
  items,
  currentActor,
  organizationName,
  request,
  onOpenMembers,
  onClose,
}: WorkLogPanelProps) {
  const activeMembers = useMemo(
    () => members.filter((member) => member.active),
    [members]
  );
  const me = activeMembers.find((member) => member.name === currentActor) ?? null;
  const [tab, setTab] = useState<Tab>(me || !activeMembers.length ? "write" : "team");
  const [date, setDate] = useState(kstToday);
  const [memberId, setMemberId] = useState<number | null>(
    () => me?.id ?? activeMembers[0]?.id ?? null
  );
  const [dayLogs, setDayLogs] = useState<WorkLog[]>([]);
  const [dayLoading, setDayLoading] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [itemQuery, setItemQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [historyMonth, setHistoryMonth] = useState(() => kstToday().slice(0, 7));
  const [historyMemberId, setHistoryMemberId] = useState<number | "all">(
    () => me?.id ?? "all"
  );
  const [historyLogs, setHistoryLogs] = useState<WorkLog[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const member = members.find((entry) => entry.id === memberId) ?? null;
  const savedLog =
    dayLogs.find((log) => log.memberId === memberId && log.logDate === date) ?? null;
  const dirty = !sameDraft(draft, draftFrom(savedLog));
  const itemsById = useMemo(
    () => new Map(items.map((item) => [item.id, item] as const)),
    [items]
  );
  const today = kstToday();

  const loadDay = useCallback(
    async (targetDate: string) => {
      setDayLoading(true);
      setError("");

      try {
        const response = await request(
          `/api/work-logs?date=${encodeURIComponent(targetDate)}`,
          { cache: "no-store" }
        );
        const data = (await response.json()) as WorkLogsResponse;

        if (!response.ok) {
          throw new Error(data.error ?? "업무일지를 불러오지 못했습니다.");
        }

        setDayLogs(data.logs ?? []);
        return data.logs ?? [];
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "업무일지를 불러오지 못했습니다."
        );
        return null;
      } finally {
        setDayLoading(false);
      }
    },
    [request]
  );

  const loadHistory = useCallback(async () => {
    const range = monthRange(historyMonth);

    if (!range) {
      return;
    }

    setHistoryLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({ from: range.from, to: range.to });
      if (historyMemberId !== "all") {
        params.set("memberId", String(historyMemberId));
      }
      const response = await request(`/api/work-logs?${params.toString()}`, {
        cache: "no-store",
      });
      const data = (await response.json()) as WorkLogsResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "업무일지를 불러오지 못했습니다.");
      }

      setHistoryLogs(data.logs ?? []);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "업무일지를 불러오지 못했습니다."
      );
    } finally {
      setHistoryLoading(false);
    }
  }, [historyMemberId, historyMonth, request]);

  // Fetch the selected day and reset the editor to what is saved for it.
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void loadDay(date).then((logs) => {
        if (cancelled || !logs) {
          return;
        }
        setDraft(
          draftFrom(logs.find((log) => log.memberId === memberId && log.logDate === date) ?? null)
        );
      });
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // memberId changes are handled by selectMember without a refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, loadDay]);

  useEffect(() => {
    if (tab === "history") {
      const timer = window.setTimeout(() => void loadHistory(), 0);
      return () => window.clearTimeout(timer);
    }
  }, [tab, loadHistory]);

  function confirmDiscard() {
    return !dirty || window.confirm("저장하지 않은 내용이 있습니다. 버리고 이동할까요?");
  }

  function selectDate(next: string) {
    if (!next || next === date || !confirmDiscard()) {
      return;
    }
    setNotice("");
    setDate(next);
  }

  function selectMember(nextId: number) {
    if (nextId === memberId || !confirmDiscard()) {
      return;
    }
    setNotice("");
    setMemberId(nextId);
    setDraft(
      draftFrom(dayLogs.find((log) => log.memberId === nextId && log.logDate === date) ?? null)
    );
  }

  function openEditor(targetMemberId: number, targetDate: string) {
    if (!confirmDiscard()) {
      return;
    }
    setTab("write");
    setNotice("");
    setMemberId(targetMemberId);

    if (targetDate !== date) {
      setDate(targetDate);
    } else {
      setDraft(
        draftFrom(
          dayLogs.find((log) => log.memberId === targetMemberId && log.logDate === date) ??
            null
        )
      );
    }
  }

  async function saveLog() {
    if (!member) {
      setError("작성할 구성원을 선택해 주세요.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await request("/api/work-logs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memberId: member.id,
          logDate: date,
          actor: currentActor,
          ...draft,
        }),
      });
      const data = (await response.json()) as WorkLogsResponse;

      if (!response.ok || !data.log) {
        throw new Error(data.error ?? "업무일지를 저장하지 못했습니다.");
      }

      const saved = data.log;
      setDayLogs((current) => [
        saved,
        ...current.filter((log) => log.id !== saved.id),
      ]);
      setDraft(draftFrom(saved));
      setNotice(`${member.name}님의 ${formatLogDate(date)} 업무일지를 저장했습니다.`);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "업무일지를 저장하지 못했습니다."
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteLog(log: WorkLog) {
    if (!window.confirm(`${log.memberName}님의 ${formatLogDate(log.logDate)} 업무일지를 삭제할까요?`)) {
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      const response = await request("/api/work-logs", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: log.id, actor: currentActor }),
      });
      const data = (await response.json()) as WorkLogsResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "업무일지를 삭제하지 못했습니다.");
      }

      setDayLogs((current) => current.filter((entry) => entry.id !== log.id));
      setHistoryLogs((current) => current.filter((entry) => entry.id !== log.id));
      if (log.memberId === memberId && log.logDate === date) {
        setDraft(EMPTY_DRAFT);
      }
      setNotice("업무일지를 삭제했습니다.");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "업무일지를 삭제하지 못했습니다."
      );
    } finally {
      setSaving(false);
    }
  }

  function fillFromBoard() {
    if (!member) {
      return;
    }

    const lines = dailyActivityLines(items, member.name, date).filter(
      (line) => !draft.content.includes(line)
    );

    if (!lines.length) {
      setNotice(`${formatLogDate(date)}에 ${member.name}님이 보드에서 완료 처리한 단계가 없습니다.`);
      return;
    }

    setDraft((current) => ({
      ...current,
      content: [current.content.trim(), ...lines.map((line) => `- ${line}`)]
        .filter(Boolean)
        .join("\n"),
    }));
    setNotice(`보드 활동 ${lines.length}건을 불러왔습니다. 확인 후 저장해 주세요.`);
  }

  function toggleItem(id: number) {
    setDraft((current) => ({
      ...current,
      itemIds: current.itemIds.includes(id)
        ? current.itemIds.filter((entry) => entry !== id)
        : [...current.itemIds, id],
    }));
  }

  function downloadCsv() {
    const titles = new Map(items.map((item) => [item.id, item.title] as const));
    const blob = new Blob([workLogsToCsv(historyLogs, titles)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const who =
      historyMemberId === "all"
        ? "전체"
        : members.find((entry) => entry.id === historyMemberId)?.name ?? "구성원";
    anchor.href = url;
    anchor.download = `${organizationName}_업무일지_${historyMonth}_${who}.csv`
      .replace(/[\\/:*?"<>|]+/g, "_")
      .replace(/\s+/g, " ");
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Suggested links: the member's own open items first, then search hits.
  const suggestedItems = useMemo(() => {
    if (!member) {
      return [];
    }

    const query = itemQuery.trim().toLowerCase();
    const pool = query
      ? items.filter(
          (item) =>
            item.title.toLowerCase().includes(query) ||
            item.category.toLowerCase().includes(query)
        )
      : items.filter(
          (item) => assigneeName(item.assignee) === member.name && !isItemDone(item)
        );

    return pool.filter((item) => !draft.itemIds.includes(item.id)).slice(0, 12);
  }, [draft.itemIds, itemQuery, items, member]);

  const status = useMemo(() => dailyStatus(members, dayLogs, date), [members, dayLogs, date]);

  const historyGroups = useMemo(() => {
    const groups = new Map<string, WorkLog[]>();
    for (const log of historyLogs) {
      groups.set(log.logDate, [...(groups.get(log.logDate) ?? []), log]);
    }
    return [...groups.entries()].sort(([first], [second]) => second.localeCompare(first));
  }, [historyLogs]);

  const historyStats = useMemo(() => {
    const range = monthRange(historyMonth);
    if (!range || historyMemberId === "all") {
      return null;
    }
    const lastDay = historyMonth === today.slice(0, 7) ? today : range.to;
    let workdays = 0;
    for (let day = range.from; day <= lastDay; day = shiftDate(day, 1)) {
      if (!isWeekend(day)) {
        workdays += 1;
      }
    }
    return { written: historyLogs.length, workdays };
  }, [historyLogs.length, historyMemberId, historyMonth, today]);

  const dateNav = (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={() => selectDate(shiftDate(date, -1))}
        className="tb-iconbtn h-8 w-8"
        aria-label="이전 날"
      >
        ‹
      </button>
      <input
        type="date"
        value={date}
        onChange={(event) => selectDate(event.target.value)}
        className="tb-field w-auto !py-1.5 text-sm"
        aria-label="날짜"
      />
      <button
        type="button"
        onClick={() => selectDate(shiftDate(date, 1))}
        className="tb-iconbtn h-8 w-8"
        aria-label="다음 날"
      >
        ›
      </button>
      {date !== today ? (
        <button type="button" onClick={() => selectDate(today)} className="tb-btn !py-1.5 text-xs">
          오늘
        </button>
      ) : null}
      <span className="text-sm font-medium text-[var(--text-muted)]">
        {formatLogDate(date)}
      </span>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/40 p-4 backdrop-blur-sm"
      onClick={() => {
        if (confirmDiscard()) {
          onClose();
        }
      }}
    >
      <div
        className="tb-card my-6 w-full max-w-[920px] shadow-[var(--shadow-lg)]"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="worklog-title"
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-5 py-3.5">
          <h2 id="worklog-title" className="mr-2 text-base font-semibold">
            📝 업무일지
          </h2>
          <div className="tb-seg" role="tablist">
            {(
              [
                ["write", "작성"],
                ["team", "팀 현황"],
                ["history", "기록"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                data-active={tab === key}
                onClick={() => setTab(key)}
                className="tb-seg-btn"
              >
                {label}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={onOpenMembers} className="tb-btn text-sm">
              👥 구성원
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirmDiscard()) {
                  onClose();
                }
              }}
              className="tb-iconbtn h-8 w-8"
              aria-label="닫기"
            >
              ×
            </button>
          </div>
        </div>

        <div className="space-y-4 p-5">
          {error ? (
            <div
              role="alert"
              className="rounded-[var(--radius)] border border-[var(--danger-border)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]"
            >
              {error}
            </div>
          ) : notice ? (
            <div
              role="status"
              className="rounded-[var(--radius)] border border-[var(--success-border)] bg-[var(--success-soft)] px-3 py-2 text-sm text-[var(--success)]"
            >
              {notice}
            </div>
          ) : null}

          {!activeMembers.length ? (
            <div className="py-10 text-center">
              <p className="text-sm text-[var(--text-muted)]">
                업무일지는 등록된 구성원이 작성합니다. 먼저 구성원을 등록해 주세요.
              </p>
              <button
                type="button"
                onClick={onOpenMembers}
                className="tb-btn tb-btn-primary mt-3"
              >
                구성원 등록하기
              </button>
            </div>
          ) : tab === "write" ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={memberId ?? ""}
                  onChange={(event) => selectMember(Number(event.target.value))}
                  className="tb-field w-auto !py-1.5 text-sm"
                  aria-label="작성 구성원"
                >
                  {member && !member.active ? (
                    <option value={member.id}>{member.name} (비활성)</option>
                  ) : null}
                  {activeMembers.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                      {entry.role ? ` · ${entry.role}` : ""}
                      {entry.name === currentActor ? " (나)" : ""}
                    </option>
                  ))}
                </select>
                {dateNav}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
                {dayLoading ? (
                  <span>불러오는 중…</span>
                ) : savedLog ? (
                  <>
                    <span className="tb-badge tb-badge-success">작성됨</span>
                    <span>
                      마지막 수정 {savedLog.updatedBy} · {formatTime(savedLog.updatedAt)}
                    </span>
                  </>
                ) : (
                  <span className="tb-badge tb-badge-muted">미작성</span>
                )}
                {dirty ? <span className="tb-badge tb-badge-warning">저장 안 됨</span> : null}
                {member && member.name !== currentActor ? (
                  <span className="text-[var(--warning)]">
                    {currentActor}님이 {member.name}님의 일지를 대신 작성 중입니다.
                  </span>
                ) : null}
              </div>

              <label className="block">
                <span className="tb-label flex items-center justify-between gap-2">
                  <span>오늘 한 일</span>
                  <button
                    type="button"
                    onClick={fillFromBoard}
                    className="text-xs font-medium text-[var(--accent)] hover:underline"
                  >
                    ↻ 보드 활동 불러오기
                  </button>
                </span>
                <textarea
                  value={draft.content}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, content: event.target.value }))
                  }
                  className="tb-field min-h-[140px] resize-y"
                  placeholder={"- 현장 조사 진행\n- 견적서 검토"}
                  maxLength={4000}
                />
              </label>

              <div>
                <span className="tb-label">관련 업무</span>
                <div className="flex flex-wrap gap-1.5">
                  {draft.itemIds.map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => toggleItem(id)}
                      className="tb-chip tb-chip-accent"
                      title="연결 해제"
                    >
                      {itemsById.get(id)?.title ?? `삭제된 업무 #${id}`} ×
                    </button>
                  ))}
                  {!draft.itemIds.length ? (
                    <span className="text-xs text-[var(--text-faint)]">
                      아래에서 오늘 다룬 업무를 선택하세요.
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 rounded-[var(--radius)] border border-dashed border-[var(--border-strong)] p-2">
                  <input
                    value={itemQuery}
                    onChange={(event) => setItemQuery(event.target.value)}
                    className="tb-field !py-1.5 text-sm"
                    placeholder="업무명·분류로 검색 (비우면 내 담당 진행 업무)"
                    aria-label="관련 업무 검색"
                  />
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {suggestedItems.length ? (
                      suggestedItems.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => toggleItem(item.id)}
                          className="tb-chip"
                        >
                          + {item.title}
                        </button>
                      ))
                    ) : (
                      <span className="text-xs text-[var(--text-faint)]">
                        {itemQuery.trim()
                          ? "검색 결과가 없습니다."
                          : "더 제안할 담당 진행 업무가 없습니다. 검색해서 다른 업무를 추가할 수 있습니다."}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="tb-label">다음 계획</span>
                  <textarea
                    value={draft.plan}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, plan: event.target.value }))
                    }
                    className="tb-field min-h-[88px] resize-y"
                    placeholder="내일(다음 근무일) 할 일"
                    maxLength={4000}
                  />
                </label>
                <label className="block">
                  <span className="tb-label">특이사항·이슈</span>
                  <textarea
                    value={draft.issues}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, issues: event.target.value }))
                    }
                    className="tb-field min-h-[88px] resize-y"
                    placeholder="막힌 점, 공유할 내용, 요청 사항"
                    maxLength={4000}
                  />
                </label>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border)] pt-3">
                {savedLog ? (
                  <button
                    type="button"
                    onClick={() => void deleteLog(savedLog)}
                    disabled={saving}
                    className="tb-btn mr-auto text-sm text-[var(--danger)]"
                  >
                    삭제
                  </button>
                ) : null}
                {dirty ? (
                  <button
                    type="button"
                    onClick={() => setDraft(draftFrom(savedLog))}
                    disabled={saving}
                    className="tb-btn text-sm"
                  >
                    되돌리기
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void saveLog()}
                  disabled={saving || dayLoading || !dirty}
                  className="tb-btn tb-btn-primary text-sm"
                >
                  {saving ? "저장 중…" : savedLog ? "수정 저장" : "일지 저장"}
                </button>
              </div>
            </div>
          ) : tab === "team" ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                {dateNav}
                <span className="ml-auto text-sm">
                  작성{" "}
                  <strong className="text-[var(--success)]">{status.written}</strong>/
                  {status.rows.length}명
                </span>
              </div>
              {status.missing.length && !dayLoading ? (
                <div className="rounded-[var(--radius)] border border-[var(--warning-border)] bg-[var(--warning-soft)] px-3 py-2 text-sm">
                  미작성: {status.missing.map((entry) => entry.name).join(", ")}
                </div>
              ) : null}
              <div className="grid gap-3 md:grid-cols-2">
                {status.rows.map(({ member: rowMember, log }) => (
                  <article
                    key={rowMember.id}
                    className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-3"
                    style={{ borderLeft: `4px solid ${rowMember.color}` }}
                  >
                    <header className="mb-2 flex items-center gap-2">
                      <span className="font-semibold">{rowMember.name}</span>
                      {rowMember.role ? (
                        <span className="text-xs text-[var(--text-faint)]">{rowMember.role}</span>
                      ) : null}
                      <span
                        className={`tb-badge ml-auto ${log ? "tb-badge-success" : "tb-badge-muted"}`}
                      >
                        {log ? "작성" : "미작성"}
                      </span>
                      <button
                        type="button"
                        onClick={() => openEditor(rowMember.id, date)}
                        className="tb-btn !px-2 !py-1 text-xs"
                      >
                        {log ? "수정" : "작성"}
                      </button>
                    </header>
                    {log ? (
                      <LogBody log={log} itemsById={itemsById} />
                    ) : (
                      <p className="text-xs text-[var(--text-faint)]">아직 작성하지 않았습니다.</p>
                    )}
                  </article>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={historyMemberId}
                  onChange={(event) =>
                    setHistoryMemberId(
                      event.target.value === "all" ? "all" : Number(event.target.value)
                    )
                  }
                  className="tb-field w-auto !py-1.5 text-sm"
                  aria-label="조회 구성원"
                >
                  <option value="all">전체 구성원</option>
                  {members.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                      {entry.active ? "" : " (비활성)"}
                    </option>
                  ))}
                </select>
                <input
                  type="month"
                  value={historyMonth}
                  onChange={(event) => setHistoryMonth(event.target.value)}
                  className="tb-field w-auto !py-1.5 text-sm"
                  aria-label="조회 월"
                />
                {historyStats ? (
                  <span className="text-sm text-[var(--text-muted)]">
                    평일 {historyStats.workdays}일 중{" "}
                    <strong className="text-[var(--text)]">{historyStats.written}일</strong> 작성
                  </span>
                ) : (
                  <span className="text-sm text-[var(--text-muted)]">
                    {historyLogs.length}건
                  </span>
                )}
                <button
                  type="button"
                  onClick={downloadCsv}
                  disabled={!historyLogs.length}
                  className="tb-btn ml-auto text-sm"
                >
                  CSV 다운로드
                </button>
              </div>
              {historyLoading ? (
                <div className="py-8 text-center text-sm text-[var(--text-muted)]">
                  불러오는 중…
                </div>
              ) : historyGroups.length ? (
                <div className="space-y-4">
                  {historyGroups.map(([logDate, logs]) => (
                    <section key={logDate}>
                      <h3 className="mb-2 text-sm font-semibold text-[var(--text-muted)]">
                        {formatLogDate(logDate)}
                      </h3>
                      <div className="space-y-2">
                        {logs.map((log) => {
                          const logMember = members.find((entry) => entry.id === log.memberId);
                          return (
                            <article
                              key={log.id}
                              className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-3"
                              style={{
                                borderLeft: `4px solid ${logMember?.color ?? "var(--border-strong)"}`,
                              }}
                            >
                              <header className="mb-2 flex items-center gap-2">
                                <span className="font-semibold">{log.memberName}</span>
                                <span className="text-[11px] text-[var(--text-faint)]">
                                  {log.updatedBy} · {formatTime(log.updatedAt)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => openEditor(log.memberId, log.logDate)}
                                  className="tb-btn ml-auto !px-2 !py-1 text-xs"
                                >
                                  열기
                                </button>
                              </header>
                              <LogBody log={log} itemsById={itemsById} />
                            </article>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-sm text-[var(--text-muted)]">
                  이 기간에 작성된 업무일지가 없습니다.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LogBody({
  log,
  itemsById,
}: {
  log: WorkLog;
  itemsById: Map<number, WorkflowItem>;
}) {
  return (
    <div className="space-y-2 text-sm">
      {log.content ? <p className="whitespace-pre-wrap break-words">{log.content}</p> : null}
      {log.itemIds.length ? (
        <div className="flex flex-wrap gap-1">
          {log.itemIds.map((id) => (
            <span key={id} className="tb-chip">
              {itemsById.get(id)?.title ?? `삭제된 업무 #${id}`}
            </span>
          ))}
        </div>
      ) : null}
      {log.plan ? (
        <p className="whitespace-pre-wrap break-words text-[var(--text-muted)]">
          <span className="font-semibold text-[var(--text)]">계획 </span>
          {log.plan}
        </p>
      ) : null}
      {log.issues ? (
        <p className="whitespace-pre-wrap break-words text-[var(--warning)]">
          <span className="font-semibold">이슈 </span>
          {log.issues}
        </p>
      ) : null}
    </div>
  );
}
