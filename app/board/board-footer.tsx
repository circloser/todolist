"use client";

import { useBoard } from "./board-context";

export default function BoardFooter() {
  const {
    organizationName,
    boardTitle,
    setReportOpen,
    setManualOpen,
    openDocuments,
  } = useBoard();

  return (
    <footer className="border-t border-[var(--border)] bg-[var(--surface)]">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-[var(--text-faint)] sm:px-6 lg:px-8">
        <span>
          {organizationName} · {boardTitle}
        </span>
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={() => setManualOpen(true)}
            className="font-semibold text-[var(--accent)] hover:underline"
          >
            📖 사용자 매뉴얼
          </button>
          <button
            type="button"
            onClick={() => void openDocuments()}
            className="hover:text-[var(--text-muted)] hover:underline"
          >
            📎 양식함
          </button>
          <button
            type="button"
            onClick={() => setReportOpen(true)}
            className="hover:text-[var(--text-muted)] hover:underline"
          >
            📄 월간 보고서
          </button>
        </div>
      </div>
    </footer>
  );
}
