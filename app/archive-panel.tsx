"use client";

import { useEffect, useMemo, useState } from "react";

import { archiveFolders, completionYear } from "./lib/archive";
import { assigneeName, isItemDone, itemProgress, type WorkflowItem } from "./lib/workflow";

// 보관함: the board's 업무 위계 kept alive for archived work. Archiving one
// item puts it under its 대분류 here (the folder appears by itself), with its
// 중분류 inside; the year it was archived for is a filter and a badge.
// Open an item to see its steps; 부서장 restore one item or a whole 분류.

function finishedOn(item: WorkflowItem) {
  const dates = item.steps.map((step) => step.completedAt).filter((value): value is string => Boolean(value));
  if (!dates.length) {
    return "";
  }
  const latest = dates.sort().at(-1) as string;
  const kst = new Date(Date.parse(latest) + 9 * 3600_000);
  return Number.isNaN(kst.getTime()) ? latest.slice(0, 10) : kst.toISOString().slice(0, 10);
}

function categoryParts(category: string) {
  return category
    .split(">")
    .map((part) => part.trim())
    .filter(Boolean);
}

function rootOf(category: string) {
  return categoryParts(category)[0] ?? "미분류";
}

/** "현장조사 › 식생" under the 대분류, or "". */
function subPath(category: string) {
  return categoryParts(category).slice(1).join(" › ");
}

function won(value: number | null) {
  return value ? `${value.toLocaleString("ko-KR")}원` : "";
}

function budgetOf(list: WorkflowItem[]) {
  return list.reduce((sum, item) => sum + (item.allocatedBudget ?? 0), 0);
}

type Tree = Array<{ root: string; items: WorkflowItem[]; subs: Array<{ path: string; items: WorkflowItem[] }> }>;

/** 대분류 → 중분류(·소분류) → items, 대분류 in the board's order. */
function buildTree(items: WorkflowItem[], order: string[]): Tree {
  const roots = new Map<string, WorkflowItem[]>();
  for (const item of items) {
    const root = rootOf(item.category);
    roots.set(root, [...(roots.get(root) ?? []), item]);
  }
  const rank = new Map(order.map((name, index) => [rootOf(name), index]));
  return [...roots.entries()]
    .sort(
      (a, b) =>
        (rank.get(a[0]) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b[0]) ?? Number.MAX_SAFE_INTEGER) ||
        a[0].localeCompare(b[0], "ko-KR")
    )
    .map(([root, list]) => {
      const subs = new Map<string, WorkflowItem[]>();
      for (const item of [...list].sort((a, b) => a.position - b.position)) {
        const path = subPath(item.category);
        subs.set(path, [...(subs.get(path) ?? []), item]);
      }
      return {
        root,
        items: list,
        // Items right under the 대분류 first, then each 중분류.
        subs: [...subs.entries()]
          .sort((a, b) => (a[0] ? 1 : 0) - (b[0] ? 1 : 0) || a[0].localeCompare(b[0], "ko-KR"))
          .map(([path, subItems]) => ({ path, items: subItems })),
      };
    });
}

export default function ArchivePanel({
  items,
  categoryOrder,
  focusId,
  canRestore,
  onRestore,
  onClose,
}: {
  items: WorkflowItem[];
  /** The board's saved 분류 order, to list 대분류 the same way. */
  categoryOrder: string[];
  focusId: number | null;
  canRestore: (item: WorkflowItem) => boolean;
  /** Back to the board: one item, or a whole 분류 (label = its name). */
  onRestore: (items: WorkflowItem[], label: string) => Promise<void>;
  onClose: () => void;
}) {
  const years = useMemo(() => archiveFolders(items).map((folder) => ({ year: folder.year, count: folder.items.length })), [items]);
  const [year, setYear] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [openIds, setOpenIds] = useState<Set<number>>(() => new Set(focusId ? [focusId] : []));
  const [busyKey, setBusyKey] = useState<string | null>(null);

  async function restore(key: string, targets: WorkflowItem[], label: string) {
    setBusyKey(key);
    try {
      await onRestore(targets, label);
    } finally {
      setBusyKey(null);
    }
  }

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
  const shown = items.filter(
    (item) =>
      (year === null || item.archivedYear === year) &&
      (!needle || `${item.title} ${item.category} ${item.assignee} ${item.memo}`.toLocaleLowerCase("ko-KR").includes(needle))
  );
  const tree = buildTree(shown, categoryOrder);
  const focusRoot = focusId ? rootOf(items.find((item) => item.id === focusId)?.category ?? "") : null;

  const restoreButton = (key: string, list: WorkflowItem[], label: string, text: string) =>
    list.length > 1 && list.every(canRestore) ? (
      <button
        type="button"
        className="shrink-0 text-[11px] font-semibold text-[var(--accent)] hover:underline disabled:opacity-50"
        disabled={busyKey !== null}
        onClick={(event) => {
          event.preventDefault();
          if (window.confirm(`'${label}' 분류의 업무 ${list.length}개를 목록으로 되돌릴까요?`)) {
            void restore(key, list, label);
          }
        }}
      >
        {busyKey === key ? "복원 중…" : text}
      </button>
    ) : null;

  const itemRow = (item: WorkflowItem) => {
    const open = openIds.has(item.id);
    const done = isItemDone(item);
    return (
      <div key={item.id} id={`archived-${item.id}`} className={`rounded-[var(--radius)] ${item.id === focusId ? "ring-2 ring-[var(--accent)]" : ""}`}>
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
            <span className="block text-sm font-medium leading-snug">
              {done ? "✓ " : "◔ "}
              {item.title || "제목 없음"}
            </span>
            <span className="block truncate text-[11px] text-[var(--text-faint)]">
              <span className="mr-1 rounded bg-[var(--surface-3)] px-1 font-semibold text-[var(--text-muted)]">{item.archivedYear}</span>
              {assigneeName(item.assignee)}
              {done ? (finishedOn(item) ? ` · 완료 ${finishedOn(item)}` : "") : ` · 미완료 · 진행 ${itemProgress(item)}%`}
              {won(item.allocatedBudget) ? ` · 예산 ${won(item.allocatedBudget)}` : ""}
            </span>
          </button>
          {canRestore(item) ? (
            <button
              type="button"
              className="tb-btn shrink-0 !px-2.5 !py-1 text-xs"
              disabled={busyKey !== null}
              onClick={() => void restore(`i${item.id}`, [item], "")}
              title="목록으로 되돌리기 (다시 자동 보관되지 않습니다)"
            >
              {busyKey === `i${item.id}` ? "복원 중…" : "목록으로 복원"}
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
                  <span className={step.status === "done" ? "text-[var(--accent)]" : "text-[var(--text-faint)]"}>
                    {step.status === "done" ? "✓" : "○"}
                  </span>
                  <span className="min-w-0 flex-1">{step.title}</span>
                  <span className="shrink-0 text-[var(--text-faint)]">{step.completedAt ? finishedOn({ ...item, steps: [step] }) : ""}</span>
                </li>
              ))}
            </ol>
            <div className="text-[11px] text-[var(--text-faint)]">
              {done ? `${completionYear(item)}년 완료` : "진행 중에 보관"} · {item.archivedYear}년 보관
            </div>
          </div>
        ) : null}
      </div>
    );
  };

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
              목록과 같은 대분류·중분류 그대로 보관됩니다. 지난해에 완료된 업무는 해가 바뀌면 자동으로, 부서장은 언제든 업무나 분류 전체를 보관·복원할 수 있습니다.
            </p>
          </div>
          <button type="button" onClick={onClose} className="tb-iconbtn h-8 w-8 shrink-0" aria-label="닫기">
            ×
          </button>
        </div>
        <div className="space-y-2 px-4 py-3 sm:px-5">
          <input
            className="tb-field"
            placeholder="보관된 업무 검색 (업무명·분류·담당·메모)"
            aria-label="보관함 검색"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {years.length ? (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="보관 연도">
              {[{ year: null as number | null, count: items.length }, ...years].map((entry) => (
                <button
                  key={entry.year ?? "all"}
                  type="button"
                  className="tb-chip tb-chip-btn"
                  aria-pressed={year === entry.year}
                  data-active={year === entry.year}
                  style={year === entry.year ? { borderColor: "var(--accent)", background: "var(--accent-soft)", color: "var(--accent)" } : undefined}
                  onClick={() => setYear(entry.year)}
                >
                  {entry.year === null ? "전체" : `${entry.year}년`} {entry.count}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="max-h-[66vh] space-y-2 overflow-auto px-4 pb-4 sm:px-5">
          {!items.length ? (
            <div className="py-10 text-center text-sm text-[var(--text-muted)]">
              보관된 업무가 없습니다.
              <br />
              완료된 업무는 해가 바뀌면 자동으로 이곳에 보관됩니다.
            </div>
          ) : !tree.length ? (
            <div className="py-6 text-center text-sm text-[var(--text-faint)]">조건에 맞는 보관 업무가 없습니다.</div>
          ) : null}
          {tree.map((node) => (
            <details
              key={node.root}
              open={tree.length <= 3 || node.root === focusRoot || Boolean(needle)}
              className="rounded-[var(--radius)] border border-[var(--border)]"
              data-testid={`archive-root-${node.root}`}
            >
              <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
                <span aria-hidden="true">📁</span>
                <span className="min-w-0 truncate font-semibold">{node.root}</span>
                <span className="shrink-0 text-xs text-[var(--text-muted)]">
                  {node.items.length}건{budgetOf(node.items) ? ` · 예산 ${won(budgetOf(node.items))}` : ""}
                </span>
                <span className="ml-auto flex shrink-0 items-center gap-2">
                  {restoreButton(`r-${node.root}`, node.items, node.root, "대분류 모두 복원")}
                  <span className="text-[var(--text-faint)]" aria-hidden="true">
                    ▾
                  </span>
                </span>
              </summary>
              <div className="border-t border-[var(--border)] px-2 pb-2">
                {node.subs.map((sub) => (
                  <div key={sub.path || "_"} className={sub.path ? "ml-3 mt-1 border-l-2 border-[var(--border)] pl-2" : "pt-1"}>
                    {sub.path ? (
                      <div className="flex items-center gap-2 px-2 pb-0.5 pt-1.5">
                        <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-[var(--text-muted)]">
                          📂 {sub.path} · {sub.items.length}건
                        </span>
                        {restoreButton(`s-${node.root}-${sub.path}`, sub.items, `${node.root} > ${sub.path.replace(/ › /g, " > ")}`, "이 분류 모두 복원")}
                      </div>
                    ) : null}
                    {sub.items.map(itemRow)}
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}
