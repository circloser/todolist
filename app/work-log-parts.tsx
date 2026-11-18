"use client";

import { useState } from "react";

import { WORK_LOG_STATUS_LABEL, type WorkLog } from "./lib/team";
import type { WorkflowItem } from "./lib/workflow";

// Small pieces shared by the 업무일지 tabs.

export type Decision = "approve" | "reject" | "reopen";
export type ReviewFn = (ids: number[], decision: Decision, comment?: string) => Promise<WorkLog[] | null>;
export type FetchLogs = (query: string) => Promise<WorkLog[]>;

export function formatTime(iso: string | null) {
  if (!iso) {
    return "";
  }
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

export function statusLabel(log: WorkLog, approval: boolean) {
  return !approval && log.status === "submitted" ? "제출" : WORK_LOG_STATUS_LABEL[log.status];
}

export const STATUS_TONE: Record<WorkLog["status"], { badge: string; color: string }> = {
  submitted: { badge: "tb-badge-warning", color: "var(--warning)" },
  approved: { badge: "tb-badge-complete", color: "var(--complete)" },
  rejected: { badge: "tb-badge-danger", color: "var(--danger)" },
};

export function StatusBadge({ log, approval = true }: { log: WorkLog | null; approval?: boolean }) {
  if (!log) {
    return <span className="tb-badge tb-badge-muted">미작성</span>;
  }
  const tone = !approval && log.status === "submitted" ? "tb-badge-success" : STATUS_TONE[log.status].badge;
  return <span className={`tb-badge ${tone}`}>{statusLabel(log, approval)}</span>;
}

export function mergeLogs(current: WorkLog[], updates: WorkLog[]) {
  const byId = new Map(updates.map((log) => [log.id, log] as const));
  return current.map((log) => byId.get(log.id) ?? log);
}

export function groupByDate(logs: WorkLog[]) {
  const groups = new Map<string, WorkLog[]>();
  for (const log of logs) {
    groups.set(log.logDate, [...(groups.get(log.logDate) ?? []), log]);
  }
  return [...groups.entries()].sort(([first], [second]) => second.localeCompare(first));
}

export function ReviewActions({
  log,
  busy,
  onReview,
}: {
  log: WorkLog;
  busy: boolean;
  onReview: ReviewFn;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  return (
    <div className="mt-3 border-t border-[var(--border)] pt-2">
      {log.status !== "submitted" && log.reviewerName ? (
        <p className="mb-2 text-xs text-[var(--text-muted)]">
          {log.reviewerName} {log.status === "approved" ? "승인" : "반려"} · {formatTime(log.reviewedAt)}
          {log.reviewComment ? ` — ${log.reviewComment}` : ""}
        </p>
      ) : null}
      {rejecting ? (
        <div className="flex flex-wrap gap-2">
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="tb-field min-w-[180px] flex-1 !py-1.5 text-sm"
            placeholder="반려 사유 (작성자에게 표시됩니다)"
            aria-label={`${log.memberName} 반려 사유`}
            maxLength={500}
            autoFocus
          />
          <button
            type="button"
            disabled={busy || !reason.trim()}
            onClick={() =>
              void onReview([log.id], "reject", reason).then((updated) => {
                if (updated) {
                  setRejecting(false);
                  setReason("");
                }
              })
            }
            className="tb-btn !px-3 !py-1.5 text-xs text-[var(--danger)]"
          >
            반려하기
          </button>
          <button type="button" onClick={() => setRejecting(false)} className="tb-btn !px-3 !py-1.5 text-xs">
            취소
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {log.status !== "approved" ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void onReview([log.id], "approve")}
              className="tb-btn tb-btn-primary !px-3 !py-1.5 text-xs"
            >
              승인
            </button>
          ) : null}
          {log.status !== "rejected" ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => setRejecting(true)}
              className="tb-btn !px-3 !py-1.5 text-xs"
            >
              반려
            </button>
          ) : null}
          {log.status !== "submitted" ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void onReview([log.id], "reopen")}
              className="tb-btn !px-3 !py-1.5 text-xs"
            >
              승인 취소
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

export function LogBody({
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

/** Toggleable member chips; `selected` empty means "everyone". */
export function MemberPicker({
  members,
  selected,
  onChange,
}: {
  members: Array<{ id: number; name: string; color: string; active: boolean }>;
  selected: number[];
  onChange: (ids: number[]) => void;
}) {
  const all = selected.length === 0;
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="구성원 선택">
      <button
        type="button"
        onClick={() => onChange([])}
        aria-pressed={all}
        className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
          all
            ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
            : "border-[var(--border)] text-[var(--text-muted)]"
        }`}
      >
        전체
      </button>
      {members.map((member) => {
        const on = !all && selected.includes(member.id);
        return (
          <button
            key={member.id}
            type="button"
            aria-pressed={on}
            onClick={() =>
              onChange(
                on ? selected.filter((id) => id !== member.id) : [...selected, member.id]
              )
            }
            className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${
              on
                ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text)]"
                : "border-[var(--border)] text-[var(--text-muted)]"
            } ${member.active ? "" : "opacity-60"}`}
          >
            <span
              className="h-2.5 w-2.5 rounded-full border border-[var(--border-strong)]"
              style={{ background: member.color }}
              aria-hidden="true"
            />
            {member.name}
          </button>
        );
      })}
    </div>
  );
}
