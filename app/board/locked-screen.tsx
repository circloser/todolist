"use client";

import {
  workspaceName,
} from "./board-utils";
import { useBoard } from "./board-context";

export default function LockedScreen() {
  const {
    activeWorkspace,
    workspacePasswordInput,
    setWorkspacePasswordInput,
    error,
    unlockWorkspace,
  } = useBoard();

  return (
    <section className="mx-auto max-w-[720px] px-4 py-10 sm:px-6 lg:px-8">
      <div className="tb-card p-6 shadow-[var(--shadow)]">
        <div className="mb-5">
          <span className="tb-badge tb-badge-muted">잠금 보드</span>
          <h2 className="mt-3 text-xl font-semibold">
            {workspaceName(activeWorkspace)}
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
            이 연도/조직 정보를 보려면 암호를 입력해 주세요. 암호는 현재
            브라우저 세션에만 기억됩니다.
          </p>
        </div>

        {error ? (
          <div className="mb-4 rounded-[var(--radius)] border border-[var(--danger-border)] bg-[var(--danger-soft)] px-4 py-3 text-sm font-medium text-[var(--danger)]">
            {error}
          </div>
        ) : null}

        <form
          onSubmit={unlockWorkspace}
          className="grid gap-2 sm:grid-cols-[1fr_auto]"
        >
          <input
            type="password"
            value={workspacePasswordInput}
            onChange={(event) => setWorkspacePasswordInput(event.target.value)}
            className="tb-field"
            placeholder="연도/조직 암호"
            autoFocus
          />
          <button type="submit" className="tb-btn tb-btn-primary">
            입장
          </button>
        </form>
      </div>
    </section>
  );
}
