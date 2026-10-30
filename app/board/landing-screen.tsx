"use client";

import {
  workspaceName,
  workspaceYear,
  workspaceTeam,
} from "./board-utils";
import { useBoard } from "./board-context";

export default function LandingScreen() {
  const {
    workspacePasswordInput,
    setWorkspacePasswordInput,
    newWorkspaceDepartment,
    setNewWorkspaceDepartment,
    newWorkspaceTeam,
    setNewWorkspaceTeam,
    newWorkspacePassword,
    setNewWorkspacePassword,
    copyPreviousYear,
    setCopyPreviousYear,
    sourceWorkspacePassword,
    setSourceWorkspacePassword,
    creatingWorkspace,
    userName,
    setUserName,
    landingPasswordRef,
    loading,
    error,
    createWorkspace,
    landingWorkspaces,
    selectedLandingWorkspace,
    landingYears,
    landingTeams,
    recentLandingWorkspaces,
    chooseLandingYear,
    chooseRecentWorkspace,
    chooseLandingTeam,
    enterLanding,
  } = useBoard();

  return (
    <main className="tb-app flex min-h-dvh items-center justify-center px-4 py-8">
      <section className="w-full max-w-[440px]">
        <div className="mb-5 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">
            Workflow Command Center
          </h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            연도와 조직/팀을 선택하고 암호를 입력해 주세요.
          </p>
        </div>

        <div className="tb-card p-5 shadow-[var(--shadow)]">
          <label className="mb-3 block">
            <span className="tb-label">사용자명</span>
            <input
              value={userName}
              onChange={(event) => setUserName(event.target.value)}
              className="tb-field"
              placeholder="이름"
            />
          </label>

          {recentLandingWorkspaces.length ? (
            <div className="mb-4 grid gap-2">
              <span className="tb-label">최근 접속</span>
              <div className="grid gap-2">
                {recentLandingWorkspaces.map((workspace) => {
                  const selected = workspace.id === selectedLandingWorkspace?.id;

                  return (
                    <button
                      key={workspace.id}
                      type="button"
                      onClick={() => chooseRecentWorkspace(workspace)}
                      className={`flex w-full items-center justify-between rounded-[calc(var(--radius)-2px)] border px-3 py-2 text-left text-sm transition ${
                        selected
                          ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--text)]"
                          : "border-[var(--border)] bg-transparent text-[var(--text-muted)] hover:border-[var(--accent-border)] hover:text-[var(--text)]"
                      }`}
                    >
                      <span className="font-semibold">
                        {workspaceName(workspace)}
                      </span>
                      <span className="text-xs text-[var(--text-faint)]">
                        선택
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <form onSubmit={enterLanding} className="grid gap-3">
            <label>
              <span className="tb-label">연도</span>
              <select
                value={workspaceYear(selectedLandingWorkspace)}
                onChange={(event) => chooseLandingYear(event.target.value)}
                className="tb-field"
                disabled={!landingWorkspaces.length}
              >
                {landingYears.length ? (
                  landingYears.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))
                ) : (
                  <option>불러오는 중</option>
                )}
              </select>
            </label>

            <label>
              <span className="tb-label">조직/팀</span>
              <select
                value={workspaceTeam(selectedLandingWorkspace)}
                onChange={(event) => chooseLandingTeam(event.target.value)}
                className="tb-field"
                disabled={!landingTeams.length}
              >
                {landingTeams.length ? (
                  landingTeams.map((team) => (
                    <option key={team} value={team}>
                      {team}
                    </option>
                  ))
                ) : (
                  <option>팀 없음</option>
                )}
              </select>
            </label>

            <label>
              <span className="tb-label">암호</span>
              <input
                ref={landingPasswordRef}
                type="password"
                value={workspacePasswordInput}
                onChange={(event) => setWorkspacePasswordInput(event.target.value)}
                className="tb-field"
                placeholder="암호"
                autoFocus
              />
            </label>

            {error ? (
              <div className="rounded-[var(--radius)] border border-[var(--danger-border)] bg-[var(--danger-soft)] px-3 py-2 text-sm font-medium text-[var(--danger)]">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              className="tb-btn tb-btn-primary w-full justify-center"
              disabled={!selectedLandingWorkspace || loading}
            >
              {loading ? "확인 중" : "입장"}
            </button>
          </form>

          <form
            onSubmit={createWorkspace}
            className="mt-5 grid gap-3 border-t border-[var(--border)] pt-5"
          >
            <div className="text-sm font-semibold">새 연도/조직 생성</div>
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                value={newWorkspaceDepartment}
                onChange={(event) => setNewWorkspaceDepartment(event.target.value)}
                className="tb-field"
                placeholder="연도 예: 2027"
              />
              <input
                value={newWorkspaceTeam}
                onChange={(event) => setNewWorkspaceTeam(event.target.value)}
                className="tb-field"
                placeholder="조직/팀명"
              />
            </div>
            <input
              type="password"
              value={newWorkspacePassword}
              onChange={(event) => setNewWorkspacePassword(event.target.value)}
              className="tb-field"
              placeholder="새 보드 암호"
            />
            <label className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
              <input
                type="checkbox"
                checked={copyPreviousYear}
                onChange={(event) => setCopyPreviousYear(event.target.checked)}
                className="h-4 w-4 accent-[var(--accent)]"
              />
              전년도 같은 팀 데이터 가져오기
            </label>
            {copyPreviousYear ? (
              <input
                type="password"
                value={sourceWorkspacePassword}
                onChange={(event) =>
                  setSourceWorkspacePassword(event.target.value)
                }
                className="tb-field"
                placeholder="전년도 보드 암호"
              />
            ) : null}
            <button
              type="submit"
              className="tb-btn w-full justify-center"
              disabled={creatingWorkspace}
            >
              {creatingWorkspace ? "생성 중" : "생성 후 입장"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
