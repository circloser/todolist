"use client";

import ManualContent from "../../manual-content";
import { useBoard } from "../board-context";

export default function ManualModal() {
  const {
    organizationName,
    boardTitle,
    setManualOpen,
  } = useBoard();

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/40 p-4 backdrop-blur-sm"
      onClick={() => setManualOpen(false)}
    >
      <div
        className="tb-card my-6 w-full max-w-[720px] shadow-[var(--shadow-lg)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3.5">
          <h2 className="text-base font-semibold">📖 사용자 매뉴얼</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="tb-btn text-sm"
            >
              인쇄 / PDF
            </button>
            <button
              aria-label="닫기"
              type="button"
              onClick={() => setManualOpen(false)}
              className="tb-iconbtn h-8 w-8"
            >
              ×
            </button>
          </div>
        </div>
        <div id="manual-print" className="max-h-[76vh] overflow-auto p-6">
          <div className="mb-1 text-lg font-bold">
            {organizationName} — {boardTitle} 사용자 매뉴얼
          </div>
          <div className="mb-5 text-xs text-[var(--text-faint)]">
            업무 진행 보드의 모든 기능 안내
          </div>
          <ManualContent />
        </div>
      </div>
    </div>
  );
}
