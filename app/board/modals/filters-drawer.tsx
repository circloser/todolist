"use client";

import {
  dueFilters,
  filters,
  sortOptions,
} from "../../lib/board-config";
import {
  type DueFilter,
  type SortMode,
  type TaskFilter,
} from "../../lib/workflow";
import { useBoard } from "../board-context";

export default function FiltersDrawer() {
  const {
    templates,
    filter,
    setFilter,
    dueFilter,
    setDueFilter,
    sortMode,
    setSortMode,
    setShowFilters,
    setReportOpen,
    assigneeFilter,
    setAssigneeFilter,
    categoryFilter,
    setCategoryFilter,
    templateFilter,
    setTemplateFilter,
    stageFilter,
    setStageFilter,
    setNewTemplateKey,
    assignees,
    categories,
    stages,
    openDocuments,
    openTemplateEditor,
  } = useBoard();

  return (
    <div
      className="fixed inset-0 z-50 md:hidden"
      onClick={() => setShowFilters(false)}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="absolute inset-x-0 bottom-0 max-h-[82vh] overflow-auto rounded-t-2xl border-t border-[var(--border)] bg-[var(--surface)] p-4 pb-6 shadow-[var(--shadow-lg)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--border-strong)]" />
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">필터 · 도구</h2>
          <button
            aria-label="닫기"
            type="button"
            onClick={() => setShowFilters(false)}
            className="tb-iconbtn h-8 w-8"
          >
            ×
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <label className="block">
            <span className="tb-label">상태</span>
            <select
              value={filter}
              onChange={(event) =>
                setFilter(event.target.value as TaskFilter)
              }
              className="tb-field"
            >
              {filters.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="tb-label">담당자</span>
            <select
              value={assigneeFilter}
              onChange={(event) => setAssigneeFilter(event.target.value)}
              className="tb-field"
            >
              <option value="all">모든 담당자</option>
              {assignees.map((assignee) => (
                <option key={assignee} value={assignee}>
                  {assignee}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="tb-label">정렬</span>
            <select
              value={sortMode}
              onChange={(event) =>
                setSortMode(event.target.value as SortMode)
              }
              className="tb-field"
            >
              {sortOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="tb-label">유형</span>
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
              className="tb-field"
            >
              <option value="all">모든 유형</option>
              {templates.map((template) => (
                <option key={template.key} value={template.key}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="tb-label">업무 위계</span>
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="tb-field"
            >
              <option value="all">모든 위계</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="tb-label">단계</span>
            <select
              value={stageFilter}
              onChange={(event) => setStageFilter(event.target.value)}
              className="tb-field"
            >
              <option value="all">모든 단계</option>
              {stages.map((stage) => (
                <option key={stage.stageKey} value={stage.stageKey}>
                  {stage.title}
                </option>
              ))}
            </select>
          </label>
          <label className="col-span-2 block">
            <span className="tb-label">일정</span>
            <select
              value={dueFilter}
              onChange={(event) =>
                setDueFilter(event.target.value as DueFilter)
              }
              className="tb-field"
            >
              {dueFilters.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              setShowFilters(false);
              setReportOpen(true);
            }}
            className="tb-btn"
          >
            📄 월간 보고서
          </button>
          <button
            type="button"
            onClick={() => {
              setShowFilters(false);
              void openDocuments();
            }}
            className="tb-btn"
          >
            📎 기안문 양식
          </button>
          <button
            type="button"
            onClick={() => {
              setShowFilters(false);
              openTemplateEditor(null);
            }}
            className="tb-btn"
          >
            ✏️ 유형·단계 관리
          </button>
          <button
            type="button"
            onClick={() => {
              setFilter("all");
              setAssigneeFilter("all");
              setSortMode("manual");
              setTemplateFilter("all");
              setCategoryFilter("all");
              setStageFilter("all");
              setDueFilter("all");
            }}
            className="tb-btn"
          >
            초기화
          </button>
          <button
            type="button"
            onClick={() => setShowFilters(false)}
            className="tb-btn tb-btn-primary"
          >
            적용
          </button>
        </div>
      </div>
    </div>
  );
}
