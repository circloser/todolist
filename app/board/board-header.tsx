"use client";

import {
  dueFilters,
  filters,
  sortOptions,
} from "../lib/board-config";
import {
  rowAccentColor,
  type DueFilter,
  type SortMode,
  type TaskFilter,
} from "../lib/workflow";
import {
  workspaceYear,
  workspaceTeam,
} from "./board-utils";
import { useBoard } from "./board-context";

export default function BoardHeader() {
  const {
    items,
    templates,
    assigneeSettings,
    boardTitle,
    setBoardTitle,
    activeWorkspace,
    setWorkspacePasswordInput,
    setLandingOpen,
    filter,
    setFilter,
    dueFilter,
    setDueFilter,
    sortMode,
    setSortMode,
    viewMode,
    setViewMode,
    showFilters,
    setShowFilters,
    setNotifOpen,
    setReportOpen,
    assigneeFilter,
    setAssigneeFilter,
    categoryFilter,
    setCategoryFilter,
    templateFilter,
    setTemplateFilter,
    stageFilter,
    setStageFilter,
    keyword,
    setKeyword,
    setNewTemplateKey,
    savingSettings,
    savingOrder,
    saveBoardSettings,
    assignees,
    categories,
    stages,
    overallProgress,
    openItemCount,
    bottlenecks,
    assigneeStats,
    notifications,
    openDocuments,
    openTemplateEditor,
  } = useBoard();

  return (
    <header className="tb-topbar z-30">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            {savingSettings ? (
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-[var(--accent)]">
                  저장 중…
                </span>
              </div>
            ) : null}
            <input
              value={boardTitle}
              onChange={(event) => setBoardTitle(event.target.value)}
              onBlur={(event) =>
                void saveBoardSettings({ boardTitle: event.target.value })
              }
              className="tb-title-field tb-ghost text-2xl font-bold tracking-tight sm:text-[28px]"
            />
          </div>

          <div className="flex flex-wrap gap-2.5">
            <div className="tb-stat">
              <div className="tb-stat-label">전체 진행률</div>
              <div className="tb-stat-value text-[var(--accent)]">
                {overallProgress}%
              </div>
              <div className="tb-progress mt-2 w-[88px]">
                <span
                  style={{
                    width: `${overallProgress}%`,
                    background: "var(--accent)",
                  }}
                />
              </div>
            </div>
            <div className="tb-stat">
              <div className="tb-stat-label">전체 업무</div>
              <div className="tb-stat-value">{items.length}</div>
            </div>
            <div className="tb-stat">
              <div className="tb-stat-label">진행 중</div>
              <div className="tb-stat-value">{openItemCount}</div>
            </div>
          </div>
        </div>

        <div className="tb-filter-strip flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="tb-label">현재 보드</span>
            <div className="text-sm font-semibold">
              {workspaceYear(activeWorkspace)} · {workspaceTeam(activeWorkspace)}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setWorkspacePasswordInput("");
              setLandingOpen(true);
            }}
            className="tb-btn"
          >
            다른 연도/조직
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <svg
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)]"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                className="tb-field pl-9"
                placeholder="업무·메모·세부 체크리스트 검색"
              />
            </div>

            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value as TaskFilter)}
              className="tb-field hidden w-auto md:block"
              title="상태"
            >
              {filters.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>

            <select
              value={assigneeFilter}
              onChange={(event) => setAssigneeFilter(event.target.value)}
              className="tb-field hidden w-auto md:block"
              title="담당자"
            >
              <option value="all">모든 담당자</option>
              {assignees.map((assignee) => (
                <option key={assignee} value={assignee}>
                  {assignee}
                </option>
              ))}
            </select>

            <select
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value as SortMode)}
              className="tb-field hidden w-auto md:block"
              title="정렬"
            >
              {sortOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  정렬: {option.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setShowFilters((value) => !value)}
              data-active={showFilters}
              className="tb-btn"
              title="상세 필터"
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
              </svg>
              필터
              {(() => {
                const n = [
                  templateFilter,
                  categoryFilter,
                  stageFilter,
                  dueFilter,
                  filter,
                  assigneeFilter,
                ].filter((value) => value !== "all").length;
                return n ? (
                  <span className="tb-badge tb-badge-muted">{n}</span>
                ) : null;
              })()}
            </button>

            <button
              type="button"
              onClick={() => setNotifOpen(true)}
              className="tb-btn relative"
              title="담당자별 마감 알림"
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
              </svg>
              알림
              {notifications.total ? (
                <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--danger)] px-1 text-[11px] font-bold text-white">
                  {notifications.total}
                </span>
              ) : null}
            </button>

            <button
              type="button"
              onClick={() => void openDocuments()}
              className="tb-btn hidden md:inline-flex"
              title="기안문 등 공용 양식 보관함"
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
              양식
            </button>

            <button
              type="button"
              onClick={() => setReportOpen(true)}
              className="tb-btn hidden md:inline-flex"
              title="월간 보고서 (CSV/인쇄)"
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
                <path d="M16 13H8" />
                <path d="M16 17H8" />
              </svg>
              보고서
            </button>

            <button
              type="button"
              onClick={() => openTemplateEditor(null)}
              className="tb-btn hidden md:inline-flex"
              title="업무 유형과 단계 관리"
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
              유형·단계
            </button>

            <div className="tb-seg ml-auto">
              {(["list", "dashboard", "map", "gantt"] as const).map(
                (mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setViewMode(mode)}
                    data-active={viewMode === mode}
                    className="tb-seg-btn"
                  >
                    {mode === "list"
                      ? "목록"
                      : mode === "dashboard"
                        ? "대시보드"
                        : mode === "map"
                          ? "지도"
                          : "간트"}
                  </button>
                )
              )}
            </div>
          </div>

          {showFilters ? (
            <div className="tb-filter-strip hidden flex-wrap items-center gap-2 md:flex">
              <select
                value={templateFilter}
                onChange={(event) => {
                  const value = event.target.value;
                  setTemplateFilter(value);
                  setStageFilter("all");
                  if (value !== "all") {
                    setNewTemplateKey(value);
                  }
                }}
                className="tb-field w-auto min-w-[140px]"
                title="업무 유형"
              >
                <option value="all">모든 유형</option>
                {templates.map((template) => (
                  <option key={template.key} value={template.key}>
                    {template.name}
                  </option>
                ))}
              </select>

              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                className="tb-field w-auto"
                title="업무 위계"
              >
                <option value="all">모든 위계</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>

              <select
                value={stageFilter}
                onChange={(event) => setStageFilter(event.target.value)}
                className="tb-field w-auto"
                title="단계"
              >
                <option value="all">모든 단계</option>
                {stages.map((stage) => (
                  <option key={stage.stageKey} value={stage.stageKey}>
                    {stage.title}
                  </option>
                ))}
              </select>

              <select
                value={dueFilter}
                onChange={(event) => setDueFilter(event.target.value as DueFilter)}
                className="tb-field w-auto"
                title="일정"
              >
                {dueFilters.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => {
                  setTemplateFilter("all");
                  setCategoryFilter("all");
                  setStageFilter("all");
                  setDueFilter("all");
                }}
                className="tb-btn ml-auto"
              >
                초기화
              </button>
            </div>
          ) : null}

          {bottlenecks.length || assigneeStats.length ? (
            <div className="hidden flex-wrap items-center gap-2 md:flex">
              {savingOrder ? (
                <span className="text-xs font-medium text-[var(--accent)]">
                  순서 저장 중…
                </span>
              ) : null}
              {bottlenecks.slice(0, 3).map((bottleneck) => (
                <button
                  key={bottleneck.title}
                  type="button"
                  onClick={() => {
                    const stage = stages.find(
                      (item) => item.title === bottleneck.title
                    );
                    setStageFilter(stage?.stageKey ?? "all");
                  }}
                  className="tb-chip tb-chip-btn"
                >
                  <span className="text-[var(--text-faint)]">병목</span>
                  {bottleneck.title}
                  <span className="tb-badge tb-badge-muted">
                    {bottleneck.count}
                  </span>
                </button>
              ))}
              {assigneeStats.slice(0, 4).map((stat) => (
                <button
                  key={stat.assignee}
                  type="button"
                  onClick={() => setAssigneeFilter(stat.assignee)}
                  className="tb-chip tb-chip-btn"
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{
                      backgroundColor: rowAccentColor(
                        assigneeSettings[stat.assignee]
                      ),
                    }}
                  />
                  {stat.assignee}
                  <span className="text-[var(--text-faint)]">
                    {stat.count}건 · {stat.progress}%
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
