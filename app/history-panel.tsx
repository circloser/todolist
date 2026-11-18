"use client";

import { useEffect, useMemo, useState } from "react";

import type { HistoryEntry } from "./lib/workflow";

// 변경 이력: the board's activity log, opened from the header menu instead of
// sitting at the bottom of every screen.

const KINDS: Array<[string, string]> = [
  ["all", "전체"],
  ["item", "업무"],
  ["worklog", "업무일지"],
  ["event", "업무일정"],
  ["minutes", "회의록"],
  ["place", "지도 장소"],
  ["member", "구성원·설정"],
];

function kindOf(entry: HistoryEntry) {
  if (
    entry.entityType === "worklog" ||
    entry.entityType === "event" ||
    entry.entityType === "minutes" ||
    entry.entityType === "place"
  ) {
    return entry.entityType;
  }
  if (entry.entityType === "member" || /설정|옵션|웹훅|발송|가입|부서장/.test(entry.summary)) {
    return "member";
  }
  return "item";
}

function stamp(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function HistoryPanel({ history, onClose }: { history: HistoryEntry[]; onClose: () => void }) {
  const [kind, setKind] = useState("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return history.filter(
      (entry) =>
        (kind === "all" || kindOf(entry) === kind) &&
        (!needle || `${entry.summary} ${entry.actor}`.toLowerCase().includes(needle))
    );
  }, [history, kind, query]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-title"
        className="tb-card my-6 w-full max-w-[680px] !bg-[var(--surface)] shadow-[var(--shadow-lg)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-5 py-3.5">
          <h2 id="history-title" className="mr-auto text-base font-semibold">
            🕘 변경 이력
          </h2>
          <span className="text-xs text-[var(--text-faint)]">최근 {history.length}건</span>
          <button type="button" onClick={onClose} className="tb-iconbtn h-8 w-8" aria-label="닫기">
            ×
          </button>
        </div>
        <div className="space-y-2 border-b border-[var(--border)] px-5 py-3">
          <input
            className="tb-field"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="이력 검색 (내용·작성자)"
            aria-label="이력 검색"
          />
          <div className="flex flex-wrap gap-1.5">
            {KINDS.map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={kind === key}
                onClick={() => setKind(key)}
                className="tb-chip tb-chip-btn"
                style={kind === key ? { borderColor: "var(--accent)", background: "var(--accent-soft)", color: "var(--accent)" } : undefined}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <ol className="max-h-[62vh] space-y-2.5 overflow-auto px-5 py-4" data-testid="history-list">
          {shown.map((entry) => (
            <li key={entry.id} className="border-l-2 border-[var(--accent-soft-2)] pl-3 text-sm leading-5 text-[var(--text-muted)]">
              <div className="text-[11px] font-semibold text-[var(--text-faint)]">{stamp(entry.createdAt)}</div>
              {entry.summary}
            </li>
          ))}
          {!shown.length ? (
            <li className="py-8 text-center text-sm text-[var(--text-faint)]">
              {history.length ? "조건에 맞는 이력이 없습니다." : "아직 변경 이력이 없습니다."}
            </li>
          ) : null}
        </ol>
      </div>
    </div>
  );
}
