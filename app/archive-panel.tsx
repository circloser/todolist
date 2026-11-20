"use client";

import { useEffect, useMemo, useState } from "react";

import { archiveFolders, completionYear } from "./lib/archive";
import { assigneeName, type WorkflowItem } from "./lib/workflow";

// 연도별 보관함: work finished in an earlier year, kept out of the board.
// Folders by year (newest first), then by 업무 위계; open an item to see its
// steps, and take it back to the board with 목록으로 복원.

function finishedOn(item: WorkflowItem) {
  const dates = item.steps.map((step) => step.completedAt).filter((value): value is string => Boolean(value));
  if (!dates.length) {
    return "";
  }
  const latest = dates.sort().at(-1) as string;
  const kst = new Date(Date.parse(latest) + 9 * 3600_000);
  return Number.isNaN(kst.getTime()) ? latest.slice(0, 10) : kst.toISOString().slice(0, 10);
}

function won(value: number | null) {
  return value ? `${value.toLocaleString("ko-KR")}원` : "";
}

export default function ArchivePanel({
  items,
  focusId,
  canRestore,
  onRestore,
  onClose,
}: {
  items: WorkflowItem[];
  focusId: number | null;
  canRestore: (item: WorkflowItem) => boolean;
  onRestore: (item: WorkflowItem) => Promise<void>;
  onClose: () => void;
}) {
  const folders = useMemo(() => archiveFolders(items), [items]);
  const [query, setQuery] = useState("");
  const [openIds, setOpenIds] = useState<Set<number>>(() => new Set(focusId ? [focusId] : []));
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!focusId) {
      return;
    }
    const timer = window.setTimeout(() => {
      document.getElementById(`archived-${focusId}`)?.scrollIntoView({ block: "center" });
    }, 50);
    return () => window.clearTimeout(timer);
  }, [focusId]);

  const needle = query.trim().toLocaleLowerCase("ko-KR");
  const matches = (item: WorkflowItem) =>
    !needle || `${item.title} ${item.category} ${item.assignee} ${item.memo}`.toLocaleLowerCase("ko-KR").includes(needle);
  const focusYear = focusId ? (items.find((item) => item.id === focusId)?.archivedYear ?? null) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/40 p-3 backdrop-blur-sm sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="보관함"
        data-testid="archive-panel"
        className="tb-card my-4 w-full max-w-[760px] !bg-[var(--surface)] shadow-[var(--shadow-lg)] sm:my-8"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3 sm:px-5">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">📦 보관함</h2>
            <p className="text-xs text-[var(--text-muted)]">
              지난해에 완료된 업무는 해가 바뀌면 그 연도 폴더로 자동 보관되어 목록·대시보드·달력·지도에서 빠집니다.
            </p>
          </div>
          <button type="button" onClick={onClose} className="tb-iconbtn h-8 w-8 shrink-0" aria-label="닫기">
            ×
          </button>
        </div>
        <div className="px-4 py-3 sm:px-5">
          <input
            className="tb-field"
            placeholder="보관된 업무 검색 (업무명·분류·담당·메모)"
            aria-label="보관함 검색"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="max-h-[70vh] space-y-2 overflow-auto px-4 pb-4 sm:px-5">
          {!folders.length ? (
            <div className="py-10 text-center text-sm text-[var(--text-muted)]">
              보관된 업무가 없습니다.
              <br />
              완료된 업무는 해가 바뀌면 자동으로 이곳에 연도별로 보관됩니다.
            </div>
          ) : null}
          {folders.map((folder, index) => {
            const shown = folder.items.filter(matches);
            const groups = new Map<string, WorkflowItem[]>();
            for (const item of shown) {
              const key = item.category.trim() || "미분류";
              groups.set(key, [...(groups.get(key) ?? []), item]);
            }
            return (
              <details
                key={folder.year}
                open={index === 0 || folder.year === focusYear || Boolean(needle)}
                className="rounded-[var(--radius)] border border-[var(--border)]"
                data-testid={`archive-year-${folder.year}`}
              >
                <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
                  <span aria-hidden="true">🗂</span>
                  <span className="font-semibold">{folder.year}년</span>
                  <span className="text-xs text-[var(--text-muted)]">
                    업무 {folder.items.length}건{needle ? ` · 검색 ${shown.length}건` : ""}
                  </span>
                  <span className="ml-auto text-[var(--text-faint)]" aria-hidden="true">
                    ▾
                  </span>
                </summary>
                <div className="border-t border-[var(--border)] px-2 pb-2">
                  {!shown.length ? <div className="px-2 py-3 text-sm text-[var(--text-faint)]">검색에 맞는 업무가 없습니다.</div> : null}
                  {[...groups.entries()]
                    .sort((a, b) => a[0].localeCompare(b[0], "ko-KR"))
                    .map(([category, list]) => (
                      <div key={category} className="pt-2">
                        <div className="px-2 pb-1 text-[11px] font-semibold text-[var(--text-faint)]">{category.replace(/\s*>\s*/g, " › ")}</div>
                        {list.map((item) => {
                          const open = openIds.has(item.id);
                          return (
                            <div
                              key={item.id}
                              id={`archived-${item.id}`}
                              className={`rounded-[var(--radius)] ${item.id === focusId ? "ring-2 ring-[var(--accent)]" : ""}`}
                            >
                              <div className="flex items-center gap-2 px-2 py-1.5 hover:bg-[var(--surface-3)]">
                                <button
                                  type="button"
                                  className="min-w-0 flex-1 text-left"
                                  aria-expanded={open}
                                  onClick={() =>
                                    setOpenIds((current) => {
                                      const next = new Set(current);
                                      if (next.has(item.id)) {
                                        next.delete(item.id);
                                      } else {
                                        next.add(item.id);
                                      }
                                      return next;
                                    })
                                  }
                                >
                                  <span className="block text-sm font-medium leading-snug">✓ {item.title || "제목 없음"}</span>
                                  <span className="block truncate text-[11px] text-[var(--text-faint)]">
                                    {assigneeName(item.assignee)}
                                    {finishedOn(item) ? ` · 완료 ${finishedOn(item)}` : ""}
                                    {won(item.allocatedBudget) ? ` · 예산 ${won(item.allocatedBudget)}` : ""}
                                  </span>
                                </button>
                                {canRestore(item) ? (
                                  <button
                                    type="button"
                                    className="tb-btn shrink-0 !px-2.5 !py-1 text-xs"
                                    disabled={busyId === item.id}
                                    onClick={async () => {
                                      setBusyId(item.id);
                                      try {
                                        await onRestore(item);
                                      } finally {
                                        setBusyId(null);
                                      }
                                    }}
                                    title="목록으로 되돌리기 (다시 자동 보관되지 않습니다)"
                                  >
                                    {busyId === item.id ? "복원 중…" : "목록으로 복원"}
                                  </button>
                                ) : null}
                              </div>
                              {open ? (
                                <div className="mb-1 ml-2 space-y-1 border-l-2 border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-muted)]">
                                  {item.memo ? <div className="whitespace-pre-wrap text-[var(--text)]">{item.memo}</div> : null}
                                  {item.contractVendor ? (
                                    <div>
                                      계약 {item.contractVendor}
                                      {won(item.contractAmount) ? ` · ${won(item.contractAmount)}` : ""}
                                    </div>
                                  ) : null}
                                  {item.location ? <div>📍 {item.location}</div> : null}
                                  <ol className="space-y-0.5">
                                    {item.steps.map((step) => (
                                      <li key={step.id} className="flex gap-2">
                                        <span className="text-[var(--accent)]">✓</span>
                                        <span className="min-w-0 flex-1">{step.title}</span>
                                        <span className="shrink-0 text-[var(--text-faint)]">
                                          {step.completedAt ? finishedOn({ ...item, steps: [step] }) : ""}
                                        </span>
                                      </li>
                                    ))}
                                  </ol>
                                  <div className="text-[11px] text-[var(--text-faint)]">{completionYear(item)}년 완료 · 보관 폴더 {item.archivedYear}년</div>
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                </div>
              </details>
            );
          })}
        </div>
      </div>
    </div>
  );
}
