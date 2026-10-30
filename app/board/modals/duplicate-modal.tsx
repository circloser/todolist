"use client";

import { useBoard } from "../board-context";

export default function DuplicateModal() {
  const {
    duplicateTarget,
    setDuplicateTarget,
    duplicateItem,
  } = useBoard();

  if (!duplicateTarget) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={() => setDuplicateTarget(null)}
    >
      <div
        className="tb-card w-full max-w-[380px] shadow-[var(--shadow-lg)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-[var(--border)] px-5 py-3.5">
          <h2 className="text-base font-semibold">업무 복제</h2>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            &lsquo;{duplicateTarget.title}&rsquo;의 단계·체크리스트 구조를
            복사합니다. 진행 상태는 항상 초기화됩니다.
          </p>
        </div>
        <div className="space-y-2 p-5">
          <button
            type="button"
            onClick={() => void duplicateItem(duplicateTarget, false)}
            className="tb-btn tb-btn-primary w-full"
          >
            일정 초기화 복제
            <span className="text-xs font-normal opacity-80">
              (마감·목표일 비움)
            </span>
          </button>
          <button
            type="button"
            onClick={() => void duplicateItem(duplicateTarget, true)}
            className="tb-btn w-full"
          >
            일정 유지 복제
            <span className="text-xs font-normal text-[var(--text-faint)]">
              (마감·목표일 그대로)
            </span>
          </button>
          <button
            type="button"
            onClick={() => setDuplicateTarget(null)}
            className="tb-btn w-full"
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
}
