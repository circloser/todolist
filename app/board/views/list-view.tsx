"use client";

import {
  type CSSProperties,
} from "react";
import {
  categoryDepth,
  categoryKey,
  categoryLeaf,
  categoryLevelLabel,
  categoryTrail,
} from "../../lib/board-config";
import {
  WETLAND_PRESETS,
} from "../../lib/wetlands";
import {
  assigneeName,
  canToggleStep,
  completionCount,
  formatDate,
  formatDay,
  isItemDone,
  itemProgress,
  nextStep,
  rowAccentColor,
  shortDueLabel,
  subtaskProgress,
  urgency,
} from "../../lib/workflow";
import {
  categoryVisual,
} from "../board-utils";
import { useBoard } from "../board-context";

export default function ListView() {
  const {
    templates,
    history,
    assigneeSettings,
    focusItemId,
    linkDrafts,
    setLinkDrafts,
    setDuplicateTarget,
    setStageFilter,
    newTitle,
    setNewTitle,
    newAssignee,
    setNewAssignee,
    newDueDate,
    setNewDueDate,
    newTemplateKey,
    setNewTemplateKey,
    expandedIds,
    expandedStepIds,
    subtaskDrafts,
    setSubtaskDrafts,
    stepDrafts,
    setStepDrafts,
    newCategoryName,
    setNewCategoryName,
    activeAddGroup,
    setActiveAddGroup,
    collapsedGroups,
    setCollapsedGroups,
    draggedGroup,
    setDraggedGroup,
    dropIndicator,
    setDropIndicator,
    editingGroup,
    setEditingGroup,
    groupNameDraft,
    setGroupNameDraft,
    deletingGroups,
    loading,
    adding,
    savingGroup,
    draggedId,
    setDraggedId,
    savingItemIds,
    deletingItemIds,
    savingStepIds,
    setError,
    templatesByKey,
    itemTypeName,
    listGroups,
    updateLocalItem,
    updateLocalSubtask,
    updateItem,
    deleteItem,
    updateStep,
    updateStepDueDate,
    updateSubtask,
    addSubtask,
    addStepSubtask,
    deleteSubtask,
    toggleStepExpanded,
    addItem,
    saveAssigneeColor,
    openTemplateEditor,
    changeItemTemplate,
    handleItemDragOver,
    handleDrop,
    openGroupTaskForm,
    addGroup,
    deleteGroup,
    renameGroup,
    handleGroupDragOver,
    handleGroupDrop,
    toggleExpanded,
    progressColor,
  } = useBoard();

  return (
    <div className="tb-list-view">
      {loading ? (
        <div className="tb-card px-4 py-16 text-center text-sm text-[var(--text-muted)]">
          불러오는 중…
        </div>
      ) : null}

      {!loading && !listGroups.length ? (
        <div className="tb-card px-4 py-16 text-center text-sm text-[var(--text-muted)]">
          표시할 업무가 없습니다.
        </div>
      ) : null}

      {!loading &&
        listGroups.map((group) => {
          const groupCollapsed = collapsedGroups.has(group.name);
          const depth = categoryDepth(group.name);
          const trail = categoryTrail(group.name);
          const indent = Math.min(depth, 4) * 18;
          const itemIndent = Math.min(depth + 1, 5) * 14;
          const groupProgress = group.items.length
            ? Math.round(
                group.items.reduce(
                  (sum, current) => sum + itemProgress(current),
                  0
                ) / group.items.length
              )
            : 0;
          const groupDone = group.items.filter((current) =>
            isItemDone(current)
          ).length;
          const categoryTone = categoryVisual(group.name);
          const categoryStyle = {
            "--category-color": categoryTone.color,
            "--category-soft": categoryTone.soft,
            "--category-softer": categoryTone.softer,
          } as CSSProperties;
          const groupDropIndicator =
            dropIndicator?.kind === "group" &&
            dropIndicator.targetName === group.name
              ? dropIndicator
              : null;

          return (
            <div
              key={`group-${group.name}`}
              className="tb-list-group space-y-1.5"
              style={categoryStyle}
            >
              <div
                onDragOver={(event) =>
                  handleGroupDragOver(event, group.name)
                }
                onDrop={(event) => handleGroupDrop(event, group.name)}
                className={`tb-hierarchy-header tb-list-group-header flex items-center gap-2.5 ${
                  draggedGroup === group.name
                    ? "is-dragging ring-2 ring-[var(--accent-ring)]"
                    : ""
                } ${
                  groupDropIndicator?.edge === "before"
                    ? "is-drop-before"
                    : ""
                } ${
                  groupDropIndicator?.edge === "after"
                    ? "is-drop-after"
                    : ""
                } ${
                  groupDropIndicator?.mode === "append"
                    ? "is-drop-append"
                    : ""
                } ${
                  groupDropIndicator?.mode === "merge"
                    ? "is-drop-merge"
                    : ""
                }`}
                style={{ paddingLeft: `${12 + indent}px` }}
              >
                <button
                  type="button"
                  draggable
                  onDragStart={(event) => {
                    setDraggedGroup(group.name);
                    event.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={() => {
                    setDraggedGroup(null);
                    setDropIndicator(null);
                  }}
                  className="tb-iconbtn h-6 w-6 shrink-0 cursor-grab active:cursor-grabbing"
                  title="드래그해 업무 위계 순서 변경"
                >
                  ⋮⋮
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setCollapsedGroups((current) => {
                      const nextSet = new Set(current);
                      if (nextSet.has(group.name)) {
                        nextSet.delete(group.name);
                      } else {
                        nextSet.add(group.name);
                      }
                      return nextSet;
                    })
                  }
                  className="tb-iconbtn h-6 w-6 shrink-0"
                  title={groupCollapsed ? "펼치기" : "접기"}
                >
                  {groupCollapsed ? "▸" : "▾"}
                </button>
                <span className="tb-badge tb-badge-muted shrink-0">
                  {categoryLevelLabel(depth)}
                </span>
                <div className="min-w-0 flex-1">
                  {editingGroup === group.name ? (
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        void renameGroup(group.name, groupNameDraft);
                      }}
                      className="flex min-w-0 items-center gap-1.5"
                    >
                      <input
                        value={groupNameDraft}
                        onChange={(event) =>
                          setGroupNameDraft(event.target.value)
                        }
                        className="tb-field min-w-0 px-2 py-1 text-sm font-semibold"
                        autoFocus
                      />
                      <button
                        type="submit"
                        disabled={!groupNameDraft.trim() || savingGroup}
                        className="tb-btn !px-2.5 !py-1 text-xs"
                      >
                        저장
                      </button>
                      <button
                        aria-label="취소"
                        type="button"
                        onClick={() => setEditingGroup(null)}
                        className="tb-iconbtn h-7 w-7"
                        title="취소"
                      >
                        ×
                      </button>
                    </form>
                  ) : (
                    <div className="truncate text-sm font-semibold">
                      {categoryLeaf(group.name)}
                    </div>
                  )}
                  {trail && editingGroup !== group.name ? (
                    <div className="truncate text-[11px] text-[var(--text-faint)]">
                      {trail}
                    </div>
                  ) : null}
                  {editingGroup === group.name ? (
                    <div className="mt-1 truncate text-[11px] text-[var(--text-faint)]">
                      현재 경로: {group.name}
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditingGroup(group.name);
                    setGroupNameDraft(group.name);
                  }}
                  className="tb-iconbtn h-7 w-7 shrink-0 text-xs"
                  title="대분류 이름 수정"
                >
                  ✎
                </button>
                <span className="tb-badge tb-badge-muted shrink-0">
                  {groupDone}/{group.items.length}
                </span>
                <div className="hidden min-w-0 max-w-[220px] flex-1 items-center gap-2 sm:flex">
                  <div className="tb-progress flex-1">
                    <span
                      style={{
                        width: `${groupProgress}%`,
                        background: "var(--accent)",
                      }}
                    />
                  </div>
                  <span className="w-9 text-right text-xs font-bold">
                    {groupProgress}%
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => openGroupTaskForm(group.name)}
                  className="tb-btn ml-auto shrink-0 !px-2.5 !py-1 text-xs"
                  title="이 그룹으로 새 업무 추가"
                >
                  ＋ 업무
                </button>
                <button
                  aria-label="대분류 삭제"
                  type="button"
                  disabled={deletingGroups.has(group.name)}
                  onClick={() => void deleteGroup(group.name)}
                  className="tb-iconbtn tb-iconbtn-danger h-7 w-7 shrink-0 disabled:cursor-not-allowed disabled:opacity-40"
                  title="대분류 삭제"
                >
                  ×
                </button>
              </div>

              {groupCollapsed
                ? null
                : group.items.map((item) => {
                    const progress = itemProgress(item);
                    const done = isItemDone(item);
                    const expanded = expandedIds.has(item.id);
          const rowColor = rowAccentColor(
            assigneeSettings[assigneeName(item.assignee)]
          );
          const next = nextStep(item);
          const subProgress = subtaskProgress(item);
          const completed = completionCount(item);
          const itemDue = urgency(item.dueDate);
          const generalSubtasks = item.subtasks.filter(
            (subtask) => subtask.stepId === null
          );
          const itemDropIndicator =
            dropIndicator?.kind === "item" &&
            dropIndicator.targetId === item.id
              ? dropIndicator
              : null;

          return (
            <div
              key={item.id}
              id={`item-${item.id}`}
              onDragOver={(event) =>
                handleItemDragOver(event, item.id, group.name)
              }
              onDrop={(event) => handleDrop(event, item.id, group.name)}
              className={`tb-card tb-work-item tb-list-item overflow-hidden transition-shadow ${
                expanded ? "is-expanded " : ""
              }${
                draggedId === item.id || focusItemId === item.id
                  ? "ring-2 ring-[var(--accent-ring)]"
                  : ""
              } ${
                draggedId === item.id ? "is-dragging" : ""
              } ${
                itemDropIndicator?.edge === "before"
                  ? "is-drop-before"
                  : ""
              } ${
                itemDropIndicator?.edge === "after" ? "is-drop-after" : ""
              }`}
              style={{ marginLeft: `${itemIndent}px` }}
            >
              <div
                className="tb-list-row-main grid gap-3 p-3 md:grid-cols-[28px_minmax(0,1fr)_180px_auto] md:items-center"
              >
                <button
                  type="button"
                  draggable
                  onDragStart={(event) => {
                    setDraggedId(item.id);
                    event.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={() => {
                    setDraggedId(null);
                    setDropIndicator(null);
                  }}
                  className="tb-iconbtn h-8 w-6 shrink-0 cursor-grab active:cursor-grabbing"
                  title="드래그로 순서 변경"
                >
                  ⋮⋮
                </button>

                <button
                  type="button"
                  onClick={() => toggleExpanded(item.id)}
                  className="tb-list-content text-left"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold">
                      {item.title || "제목 없음"}
                    </span>
                    <span className="tb-chip tb-chip-accent tb-list-type">
                      {itemTypeName(item)}
                    </span>
                  </div>
                  <div className="tb-list-meta mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--text-muted)]">
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: rowColor }}
                      />
                      {assigneeName(item.assignee)}
                    </span>
                    {done ? (
                      <span className="tb-badge tb-badge-complete">완료</span>
                    ) : (
                      <span className="tb-badge tb-badge-muted">
                        {completed}/{item.steps.length} · {next?.title ?? "—"}
                      </span>
                    )}
                    {item.dueDate ? (
                      <span
                        className={`tb-badge ${
                          done
                            ? "tb-badge-complete"
                            : itemDue === "overdue" || itemDue === "danger"
                            ? "tb-badge-danger"
                            : itemDue === "warning"
                              ? "tb-badge-warning"
                              : "tb-badge-muted"
                        }`}
                      >
                        마감 {formatDay(item.dueDate)} ·{" "}
                        {done ? "완료" : shortDueLabel(item.dueDate)}
                      </span>
                    ) : null}
                    {item.location ? (
                      <span className="tb-badge tb-badge-muted">
                        📍 {item.location}
                      </span>
                    ) : null}
                    {subProgress !== null ? (
                      <span>세부 {subProgress}%</span>
                    ) : null}
                    {savingItemIds.has(item.id) ? (
                      <span className="text-[var(--accent)]">저장 중…</span>
                    ) : null}
                  </div>
                  <div
                    className="tb-list-step-strip"
                    role="list"
                    aria-label="단계 진행 요약"
                  >
                    {item.steps.map((step) => {
                      const checked = step.status === "done";
                      const state = urgency(step.dueDate);

                      return (
                        <span
                          key={step.id}
                          role="listitem"
                          className={`tb-list-step-dot ${
                            checked
                              ? "is-done"
                              : state === "overdue" || state === "danger"
                                  ? "is-danger"
                                  : state === "warning"
                                    ? "is-warning"
                                    : ""
                          }`}
                          title={step.title}
                        />
                      );
                    })}
                  </div>
                </button>

                <div className="hidden w-44 shrink-0 md:block">
                  <div className="flex items-center gap-2">
                    <div className="tb-progress flex-1">
                      <span
                        style={{
                          width: `${progress}%`,
                          background: progressColor(item),
                        }}
                      />
                    </div>
                    <span className="w-9 text-right text-sm font-bold">
                      {progress}%
                    </span>
                  </div>
                </div>

                <div className="tb-list-actions flex shrink-0 items-center justify-end gap-1 md:justify-start">
                  <button
                    type="button"
                    onClick={() => toggleExpanded(item.id)}
                    className="tb-iconbtn h-8 w-8"
                    title="펼치기"
                  >
                    {expanded ? "▴" : "▾"}
                  </button>
                  <button
                    type="button"
                    disabled={savingItemIds.has(item.id)}
                    onClick={() => setDuplicateTarget(item)}
                    className="tb-iconbtn h-8 w-8 disabled:cursor-not-allowed disabled:opacity-40"
                    title="업무 복제"
                  >
                    ⧉
                  </button>
                  <button
                    aria-label="업무 삭제"
                    type="button"
                    disabled={deletingItemIds.has(item.id)}
                    onClick={() => void deleteItem(item)}
                    className="tb-iconbtn tb-iconbtn-danger h-8 w-8 disabled:cursor-not-allowed disabled:opacity-40"
                    title="업무 삭제"
                  >
                    ×
                  </button>
                </div>
              </div>

              {expanded ? (
                <div className="tb-item-detail tb-list-detail p-4">
                  <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
                    <div className="space-y-4">
                      <div className="tb-list-quick-edit">
                        <label className="block">
                          <span className="tb-label">업무명</span>
                          <input
                            value={item.title}
                            onChange={(event) =>
                              updateLocalItem(item.id, {
                                title: event.target.value,
                              })
                            }
                            onBlur={(event) =>
                              updateItem(item.id, {
                                title: event.target.value,
                              })
                            }
                            className="tb-field"
                            placeholder="업무명"
                          />
                        </label>
                        <label className="block">
                          <span className="tb-label">담당자</span>
                          <input
                            value={item.assignee}
                            onChange={(event) =>
                              updateLocalItem(item.id, {
                                assignee: event.target.value,
                              })
                            }
                            onBlur={(event) =>
                              updateItem(item.id, {
                                assignee: event.target.value,
                              })
                            }
                            className="tb-field"
                          />
                        </label>
                        <label className="block">
                          <span className="tb-label">업무 위계</span>
                          <input
                            list="group-list"
                            value={item.category}
                            onChange={(event) =>
                              updateLocalItem(item.id, {
                                category: event.target.value,
                              })
                            }
                            onBlur={(event) =>
                              updateItem(item.id, {
                                category: event.target.value,
                              })
                            }
                            className="tb-field"
                            placeholder="예: 복원사업 > 현장조사 > 식생"
                          />
                        </label>
                        <label className="block">
                          <span className="tb-label">최종 마감일</span>
                          <input
                            type="date"
                            value={item.dueDate ?? ""}
                            onChange={(event) =>
                              updateItem(item.id, {
                                dueDate: event.target.value,
                              })
                            }
                            className="tb-field"
                          />
                        </label>
                        <label className="block">
                          <span className="tb-label">편성예산</span>
                          <input
                            type="number"
                            min="0"
                            step="1000"
                            value={item.allocatedBudget ?? ""}
                            onChange={(event) =>
                              updateLocalItem(item.id, {
                                allocatedBudget: event.target.value
                                  ? Number(event.target.value)
                                  : null,
                              })
                            }
                            onBlur={(event) =>
                              updateItem(item.id, {
                                allocatedBudget: event.target.value
                                  ? Number(event.target.value)
                                  : null,
                              })
                            }
                            className="tb-field"
                            placeholder="원"
                          />
                        </label>
                        <label className="block">
                          <span className="tb-label">소요예산</span>
                          <input
                            type="number"
                            min="0"
                            step="1000"
                            value={item.requiredBudget ?? ""}
                            onChange={(event) =>
                              updateLocalItem(item.id, {
                                requiredBudget: event.target.value
                                  ? Number(event.target.value)
                                  : null,
                              })
                            }
                            onBlur={(event) =>
                              updateItem(item.id, {
                                requiredBudget: event.target.value
                                  ? Number(event.target.value)
                                  : null,
                              })
                            }
                            className="tb-field"
                            placeholder="원"
                          />
                        </label>
                        <label className="block">
                          <span className="tb-label">계약금액</span>
                          <input
                            type="number"
                            min="0"
                            step="1000"
                            value={item.contractAmount ?? ""}
                            onChange={(event) =>
                              updateLocalItem(item.id, {
                                contractAmount: event.target.value
                                  ? Number(event.target.value)
                                  : null,
                              })
                            }
                            onBlur={(event) =>
                              updateItem(item.id, {
                                contractAmount: event.target.value
                                  ? Number(event.target.value)
                                  : null,
                              })
                            }
                            className="tb-field"
                            placeholder="원"
                          />
                        </label>
                        <label className="block">
                          <span className="tb-label">계약업체</span>
                          <input
                            value={item.contractVendor}
                            onChange={(event) =>
                              updateLocalItem(item.id, {
                                contractVendor: event.target.value,
                              })
                            }
                            onBlur={(event) =>
                              updateItem(item.id, {
                                contractVendor: event.target.value,
                              })
                            }
                            className="tb-field"
                            placeholder="업체명"
                          />
                        </label>
                        <label className="block">
                          <span className="tb-label">업체 담당자</span>
                          <input
                            value={item.contractManager}
                            onChange={(event) =>
                              updateLocalItem(item.id, {
                                contractManager: event.target.value,
                              })
                            }
                            onBlur={(event) =>
                              updateItem(item.id, {
                                contractManager: event.target.value,
                              })
                            }
                            className="tb-field"
                            placeholder="담당자명"
                          />
                        </label>
                        <label className="block">
                          <span className="tb-label">업체 연락처</span>
                          <input
                            value={item.contractPhone}
                            onChange={(event) =>
                              updateLocalItem(item.id, {
                                contractPhone: event.target.value,
                              })
                            }
                            onBlur={(event) =>
                              updateItem(item.id, {
                                contractPhone: event.target.value,
                              })
                            }
                            className="tb-field"
                            placeholder="전화번호 또는 이메일"
                          />
                        </label>
                        <label className="block tb-list-full">
                          <span className="tb-label">메모</span>
                          <textarea
                            value={item.memo}
                            onChange={(event) =>
                              updateLocalItem(item.id, {
                                memo: event.target.value,
                              })
                            }
                            onBlur={(event) =>
                              updateItem(item.id, {
                                memo: event.target.value,
                              })
                            }
                            className="tb-field resize-y"
                            placeholder="핵심 메모만 간단히 남기세요"
                          />
                        </label>
                      </div>
                      <div>
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-sm font-semibold">진행 단계</span>
                          <span className="text-xs text-[var(--text-faint)]">
                            {completed}/{item.steps.length} 완료
                          </span>
                        </div>
                        <div className="tb-list-stage-grid">
                          {item.steps.map((step, index) => {
                            const checked = step.status === "done";
                            const saving = savingStepIds.has(step.id);
                            const allowed = canToggleStep(item, index);
                            const state = urgency(step.dueDate);
                            const disabled = !allowed || saving;
                            const dotClass = checked
                              ? "is-done"
                              : !allowed
                                ? "is-locked"
                                : state === "overdue" || state === "danger"
                                  ? "is-danger"
                                  : state === "warning"
                                    ? "is-warning"
                                    : "is-available";
                            const stepSubs = item.subtasks.filter(
                              (subtask) => subtask.stepId === step.id
                            );
                            const stepSubsDone = stepSubs.filter(
                              (subtask) => subtask.status === "done"
                            ).length;
                            const stepPanelOpen = expandedStepIds.has(
                              step.id
                            );

                            return (
                              <div
                                key={step.id}
                                className="tb-step-row tb-list-step-row tb-list-stage-card overflow-hidden"
                              >
                                <div className="tb-list-stage-main">
                                  <button
                                    type="button"
                                    disabled={disabled}
                                    onClick={() =>
                                      updateStep(
                                        item,
                                        step,
                                        checked ? "todo" : "done"
                                      )
                                    }
                                    className={`tb-stage !h-6 !w-6 shrink-0 rounded-full ${dotClass}`}
                                    title={step.description}
                                  >
                                    {saving ? "…" : checked ? "✓" : index + 1}
                                  </button>
                                  <div className="tb-list-stage-copy min-w-0 flex-1">
                                    <div
                                      className={`text-sm ${
                                        checked
                                          ? "text-[var(--text-faint)] line-through"
                                          : "font-medium"
                                      }`}
                                    >
                                      {step.title}
                                    </div>
                                    {step.phaseGroup ? (
                                      <div className="text-[11px] text-[var(--text-faint)]">
                                        {step.phaseGroup}
                                      </div>
                                    ) : null}
                                  </div>
                                  <div className="tb-list-stage-controls">
                                    <label className="tb-list-stage-date">
                                      <span>목표일</span>
                                      <input
                                        type="date"
                                        value={step.dueDate ?? ""}
                                        onChange={(event) =>
                                          updateStepDueDate(
                                            step,
                                            event.target.value
                                          )
                                        }
                                      />
                                    </label>
                                    {step.dueDate && !checked ? (
                                      <span
                                        className={`tb-badge ${
                                          state === "overdue" ||
                                          state === "danger"
                                            ? "tb-badge-danger"
                                            : state === "warning"
                                              ? "tb-badge-warning"
                                              : "tb-badge-muted"
                                        }`}
                                      >
                                        {shortDueLabel(step.dueDate)}
                                      </span>
                                    ) : null}
                                    <button
                                      type="button"
                                      onClick={() =>
                                        toggleStepExpanded(step.id)
                                      }
                                      data-active={stepPanelOpen}
                                      className={`tb-btn tb-list-subtask-toggle shrink-0 !py-1.5 text-xs ${
                                        stepSubs.length &&
                                        stepSubsDone === stepSubs.length
                                          ? "tb-btn-soft-success"
                                          : ""
                                      }`}
                                      title="이 단계의 세부 체크리스트"
                                    >
                                      세부 체크리스트{" "}
                                      {stepSubs.length
                                        ? `${stepSubsDone}/${stepSubs.length}`
                                        : "추가"}
                                    </button>
                                  </div>
                                </div>

                                {stepPanelOpen ? (
                                  <div className="tb-list-subtask-panel">
                                    {stepSubs.map((subtask) => (
                                      <div
                                        key={subtask.id}
                                        className="tb-list-subtask-row"
                                      >
                                        <input
                                          type="checkbox"
                                          checked={
                                            subtask.status === "done"
                                          }
                                          onChange={(event) => {
                                            updateLocalSubtask(
                                              subtask.id,
                                              {
                                                status: event.target
                                                  .checked
                                                  ? "done"
                                                  : "todo",
                                              }
                                            );
                                            void updateSubtask(
                                              subtask.id,
                                              {
                                                status: event.target
                                                  .checked
                                                  ? "done"
                                                  : "todo",
                                              }
                                            );
                                          }}
                                          className="h-4 w-4 shrink-0 accent-[var(--accent)]"
                                        />
                                        <input
                                          value={subtask.title}
                                          onChange={(event) =>
                                            updateLocalSubtask(
                                              subtask.id,
                                              { title: event.target.value }
                                            )
                                          }
                                          onBlur={(event) =>
                                            updateSubtask(subtask.id, {
                                              title: event.target.value,
                                            })
                                          }
                                          className={`tb-ghost flex-1 text-sm ${
                                            subtask.status === "done"
                                              ? "text-[var(--text-faint)] line-through"
                                              : ""
                                            }`}
                                        />
                                        <label className="tb-list-subtask-date">
                                          <span>기한</span>
                                          <input
                                            type="date"
                                            value={subtask.dueDate ?? ""}
                                            onChange={(event) => {
                                              updateLocalSubtask(
                                                subtask.id,
                                                {
                                                  dueDate:
                                                    event.target.value,
                                                }
                                              );
                                              void updateSubtask(
                                                subtask.id,
                                                {
                                                  dueDate:
                                                    event.target.value,
                                                }
                                              );
                                            }}
                                          />
                                        </label>
                                        <button
                                          aria-label="삭제"
                                          type="button"
                                          onClick={() =>
                                            void deleteSubtask(subtask)
                                          }
                                          className="tb-iconbtn tb-iconbtn-danger h-7 w-7 shrink-0"
                                          title="삭제"
                                        >
                                          ×
                                        </button>
                                      </div>
                                    ))}
                                    <form
                                      onSubmit={(event) => {
                                        event.preventDefault();
                                        void addStepSubtask(
                                          item.id,
                                          step.id
                                        );
                                      }}
                                      className="flex gap-1.5"
                                    >
                                      <input
                                        value={stepDrafts[step.id] ?? ""}
                                        onChange={(event) =>
                                          setStepDrafts((current) => ({
                                            ...current,
                                            [step.id]: event.target.value,
                                          }))
                                        }
                                        className="tb-field flex-1 px-2 py-1.5 text-sm"
                                        placeholder="이 단계에 세부 항목 추가"
                                      />
                                      <button
                                        type="submit"
                                        className="tb-btn tb-btn-primary shrink-0 !px-3 !py-1.5 text-xs"
                                      >
                                        추가
                                      </button>
                                    </form>
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="tb-list-common-checklist">
                        <div className="mb-2 text-sm font-semibold">
                          공통 체크리스트
                        </div>
                        <div className="space-y-1.5">
                          {generalSubtasks.map((subtask) => (
                            <div
                              key={subtask.id}
                              className="tb-inline-panel tb-list-step-row flex items-center gap-2.5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2"
                            >
                              <input
                                type="checkbox"
                                checked={subtask.status === "done"}
                                onChange={(event) => {
                                  updateLocalSubtask(subtask.id, {
                                    status: event.target.checked ? "done" : "todo",
                                  });
                                  void updateSubtask(subtask.id, {
                                    status: event.target.checked ? "done" : "todo",
                                  });
                                }}
                                className="h-4 w-4 shrink-0 accent-[var(--accent)]"
                              />
                              <input
                                value={subtask.title}
                                onChange={(event) =>
                                  updateLocalSubtask(subtask.id, {
                                    title: event.target.value,
                                  })
                                }
                                onBlur={(event) =>
                                  updateSubtask(subtask.id, {
                                    title: event.target.value,
                                  })
                                }
                                className={`tb-ghost flex-1 text-sm ${
                                  subtask.status === "done"
                                    ? "text-[var(--text-faint)] line-through"
                                    : ""
                                }`}
                              />
                              <input
                                value={subtask.blockers}
                                onChange={(event) =>
                                  updateLocalSubtask(subtask.id, {
                                    blockers: event.target.value,
                                  })
                                }
                                onBlur={(event) =>
                                  updateSubtask(subtask.id, {
                                    blockers: event.target.value,
                                  })
                                }
                                className="tb-ghost hidden w-40 text-xs sm:block"
                                placeholder="애로사항"
                              />
                              <label className="tb-stage-due relative !w-auto px-2">
                                {subtask.dueDate ? formatDay(subtask.dueDate) : "+ 기한"}
                                <input
                                  type="date"
                                  value={subtask.dueDate ?? ""}
                                  onChange={(event) => {
                                    updateLocalSubtask(subtask.id, {
                                      dueDate: event.target.value,
                                    });
                                    void updateSubtask(subtask.id, {
                                      dueDate: event.target.value,
                                    });
                                  }}
                                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                                />
                              </label>
                              <button
                                aria-label="삭제"
                                type="button"
                                onClick={() => void deleteSubtask(subtask)}
                                className="tb-iconbtn tb-iconbtn-danger h-7 w-7 shrink-0"
                                title="삭제"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                        <form
                          onSubmit={(event) => {
                            event.preventDefault();
                            void addSubtask(item.id);
                          }}
                          className="mt-2 flex gap-2"
                        >
                          <input
                            value={subtaskDrafts[item.id]?.title ?? ""}
                            onChange={(event) =>
                              setSubtaskDrafts((current) => ({
                                ...current,
                                [item.id]: {
                                  title: event.target.value,
                                  dueDate: current[item.id]?.dueDate ?? "",
                                  blockers: current[item.id]?.blockers ?? "",
                                },
                              }))
                            }
                            className="tb-field flex-1"
                            placeholder="새 체크리스트 추가"
                          />
                          <button type="submit" className="tb-btn tb-btn-primary">
                            추가
                          </button>
                        </form>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="tb-side-panel tb-list-side-panel space-y-3 p-3.5">
                        <div className="text-sm font-semibold">업무 정보</div>
                        <label className="block">
                          <span className="tb-label">담당자</span>
                          <div className="flex items-center gap-2">
                            <input
                              value={item.assignee}
                              onChange={(event) =>
                                updateLocalItem(item.id, {
                                  assignee: event.target.value,
                                })
                              }
                              onBlur={(event) =>
                                updateItem(item.id, {
                                  assignee: event.target.value,
                                })
                              }
                              className="tb-field"
                            />
                            <input
                              type="color"
                              value={
                                assigneeSettings[assigneeName(item.assignee)] ??
                                "#e6f4ef"
                              }
                              onChange={(event) =>
                                saveAssigneeColor(
                                  assigneeName(item.assignee),
                                  event.target.value
                                )
                              }
                              className="h-9 w-10 shrink-0 cursor-pointer rounded border border-[var(--border)] bg-transparent p-0"
                              title="담당자 색상"
                            />
                          </div>
                        </label>
                        <label className="block">
                          <span className="tb-label">업무 위계</span>
                          <input
                            list="group-list"
                            value={item.category}
                            onChange={(event) =>
                              updateLocalItem(item.id, {
                                category: event.target.value,
                              })
                            }
                            onBlur={(event) =>
                              updateItem(item.id, {
                                category: event.target.value,
                              })
                            }
                            className="tb-field"
                            placeholder="예: 복원사업 > 현장조사 > 식생"
                          />
                        </label>
                        <label className="block">
                          <span className="tb-label">유형 (단계 세트)</span>
                          <select
                            value={item.templateKey}
                            onChange={(event) => {
                              if (
                                event.target.value !== item.templateKey &&
                                window.confirm(
                                  "유형을 바꾸면 이 업무의 단계가 새 유형의 단계로 교체됩니다. 계속할까요?"
                                )
                              ) {
                                void changeItemTemplate(
                                  item.id,
                                  event.target.value
                                );
                              }
                            }}
                            className="tb-field"
                          >
                            {!templatesByKey.has(item.templateKey) ? (
                              <option value={item.templateKey}>
                                {itemTypeName(item)} (기타)
                              </option>
                            ) : null}
                            {templates.map((template) => (
                              <option key={template.key} value={template.key}>
                                {template.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block">
                          <span className="tb-label">최종 마감일</span>
                          <input
                            type="date"
                            value={item.dueDate ?? ""}
                            onChange={(event) =>
                              updateItem(item.id, {
                                dueDate: event.target.value,
                              })
                            }
                            className="tb-field"
                          />
                        </label>
                        <label className="block">
                          <span className="tb-label">위치 (습지보호지역)</span>
                          <input
                            list="wetland-presets"
                            value={item.location}
                            onChange={(event) =>
                              updateLocalItem(item.id, {
                                location: event.target.value,
                              })
                            }
                            onBlur={(event) => {
                              const value = event.target.value.trim();
                              const preset = WETLAND_PRESETS.find(
                                (candidate) => candidate.name === value
                              );
                              void updateItem(
                                item.id,
                                preset
                                  ? {
                                      location: preset.name,
                                      lat: preset.lat,
                                      lng: preset.lng,
                                    }
                                  : value
                                    ? { location: value }
                                    : { location: "", lat: null, lng: null }
                              );
                            }}
                            className="tb-field"
                            placeholder="습지보호지역 선택 또는 직접 입력"
                          />
                          {item.lat !== null && item.lng !== null ? (
                            <span className="mt-1 block text-[11px] text-[var(--text-faint)]">
                              좌표 {item.lat.toFixed(3)},{" "}
                              {item.lng.toFixed(3)} · 지도에 표시됨
                            </span>
                          ) : item.location ? (
                            <span className="mt-1 block text-[11px] text-[var(--text-faint)]">
                              좌표 미지정 — 목록의 습지보호지역을 선택하면
                              자동 입력됩니다
                            </span>
                          ) : null}
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <label className="block">
                            <span className="tb-label">편성 예산</span>
                            <input
                              type="number"
                              min="0"
                              step="1000"
                              value={item.allocatedBudget ?? ""}
                              onChange={(event) =>
                                updateLocalItem(item.id, {
                                  allocatedBudget: event.target.value
                                    ? Number(event.target.value)
                                    : null,
                                })
                              }
                              onBlur={(event) =>
                                updateItem(item.id, {
                                  allocatedBudget: event.target.value
                                    ? Number(event.target.value)
                                    : null,
                                })
                              }
                              className="tb-field"
                              placeholder="원"
                            />
                          </label>
                          <label className="block">
                            <span className="tb-label">소요 예산</span>
                            <input
                              type="number"
                              min="0"
                              step="1000"
                              value={item.requiredBudget ?? ""}
                              onChange={(event) =>
                                updateLocalItem(item.id, {
                                  requiredBudget: event.target.value
                                    ? Number(event.target.value)
                                    : null,
                                })
                              }
                              onBlur={(event) =>
                                updateItem(item.id, {
                                  requiredBudget: event.target.value
                                    ? Number(event.target.value)
                                    : null,
                                })
                              }
                              className="tb-field"
                              placeholder="원"
                            />
                          </label>
                        </div>
                        <label className="block">
                          <span className="tb-label">메모</span>
                          <textarea
                            value={item.memo}
                            onChange={(event) =>
                              updateLocalItem(item.id, {
                                memo: event.target.value,
                              })
                            }
                            onBlur={(event) =>
                              updateItem(item.id, {
                                memo: event.target.value,
                              })
                            }
                            className="tb-field min-h-[60px] resize-y"
                            placeholder="메모"
                          />
                        </label>

                        <div>
                          <span className="tb-label">링크 / 자료</span>
                          <div className="space-y-1">
                            {item.links.map((link, linkIndex) => (
                              <div
                                key={`${link.url}-${linkIndex}`}
                                className="flex items-center gap-1.5"
                              >
                                <a
                                  href={link.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="min-w-0 flex-1 truncate rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-xs text-[var(--accent)] hover:border-[var(--accent)]"
                                  title={link.url}
                                >
                                  🔗 {link.title}
                                </a>
                                <button
                                  aria-label="링크 삭제"
                                  type="button"
                                  onClick={() => {
                                    const nextLinks = item.links.filter(
                                      (_, i) => i !== linkIndex
                                    );
                                    updateLocalItem(item.id, {
                                      links: nextLinks,
                                    });
                                    void updateItem(item.id, {
                                      links: nextLinks,
                                    });
                                  }}
                                  className="tb-iconbtn tb-iconbtn-danger h-7 w-7 shrink-0"
                                  title="링크 삭제"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                          <form
                            onSubmit={(event) => {
                              event.preventDefault();
                              const draft = linkDrafts[item.id];
                              const url = draft?.url.trim() ?? "";
                              if (!/^https?:\/\//.test(url)) {
                                setError(
                                  "링크는 http:// 또는 https:// 로 시작해야 합니다."
                                );
                                return;
                              }
                              const nextLinks = [
                                ...item.links,
                                {
                                  title: draft?.title.trim() || url,
                                  url,
                                },
                              ];
                              updateLocalItem(item.id, { links: nextLinks });
                              void updateItem(item.id, { links: nextLinks });
                              setLinkDrafts((current) => ({
                                ...current,
                                [item.id]: { title: "", url: "" },
                              }));
                            }}
                            className="mt-1.5 flex gap-1.5"
                          >
                            <input
                              value={linkDrafts[item.id]?.title ?? ""}
                              onChange={(event) =>
                                setLinkDrafts((current) => ({
                                  ...current,
                                  [item.id]: {
                                    title: event.target.value,
                                    url: current[item.id]?.url ?? "",
                                  },
                                }))
                              }
                              className="tb-field w-24 px-2 py-1.5 text-xs"
                              placeholder="이름"
                            />
                            <input
                              value={linkDrafts[item.id]?.url ?? ""}
                              onChange={(event) =>
                                setLinkDrafts((current) => ({
                                  ...current,
                                  [item.id]: {
                                    title: current[item.id]?.title ?? "",
                                    url: event.target.value,
                                  },
                                }))
                              }
                              className="tb-field min-w-0 flex-1 px-2 py-1.5 text-xs"
                              placeholder="https://…"
                            />
                            <button
                              type="submit"
                              className="tb-btn shrink-0 !px-2.5 !py-1.5 text-xs"
                            >
                              추가
                            </button>
                          </form>
                        </div>

                        <div className="text-[11px] text-[var(--text-faint)]">
                          수정 {formatDate(item.updatedAt)}
                        </div>
                      </div>

                      <div className="tb-side-panel tb-list-side-panel p-3.5">
                        <div className="text-sm font-semibold">최근 이력</div>
                        <div className="mt-2.5 max-h-40 space-y-2.5 overflow-auto">
                          {history
                            .filter((entry) => entry.itemId === item.id)
                            .slice(0, 6)
                            .map((entry) => (
                              <div
                                key={entry.id}
                                className="border-l-2 border-[var(--accent-soft-2)] pl-2.5 text-xs leading-5 text-[var(--text-muted)]"
                              >
                                <div className="text-[11px] font-semibold text-[var(--text-faint)]">
                                  {formatDate(entry.createdAt)}
                                </div>
                                {entry.summary}
                              </div>
                            ))}
                          {!history.some((entry) => entry.itemId === item.id) ? (
                            <div className="text-xs text-[var(--text-faint)]">
                              아직 기록이 없습니다.
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
              {!groupCollapsed && activeAddGroup === group.name ? (
                <div
                  className="tb-card tb-add-strip tb-list-inline-add p-3"
                  style={{ marginLeft: `${itemIndent}px` }}
                >
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="min-w-0 text-sm font-semibold">
                      <span className="text-[var(--accent)]">
                        {categoryLeaf(group.name)}
                      </span>
                      에 업무 추가
                    </div>
                    <button
                      aria-label="닫기"
                      type="button"
                      onClick={() => setActiveAddGroup(null)}
                      className="tb-iconbtn h-7 w-7 shrink-0"
                      title="닫기"
                    >
                      ×
                    </button>
                  </div>
                  <form
                    onSubmit={(event) =>
                      void addItem(
                        event,
                        group.name === categoryKey("") ? "" : group.name
                      )
                    }
                    className="grid gap-2 md:grid-cols-2 xl:grid-cols-[170px_minmax(220px,1fr)_140px_140px_90px]"
                  >
                    <select
                      value={newTemplateKey}
                      onChange={(event) => {
                        if (event.target.value === "__new__") {
                          openTemplateEditor(null);
                          return;
                        }
                        setNewTemplateKey(event.target.value);
                        setStageFilter("all");
                      }}
                      className="tb-field"
                      title="유형"
                    >
                      {templates.map((template) => (
                        <option key={template.key} value={template.key}>
                          {template.name} ({template.stages.length}단계)
                        </option>
                      ))}
                      <option value="__new__">＋ 새 유형 만들기</option>
                    </select>
                    <input
                      id="new-task-title"
                      value={newTitle}
                      onChange={(event) => setNewTitle(event.target.value)}
                      className="tb-field"
                      placeholder="새 업무명"
                    />
                    <input
                      value={newAssignee}
                      onChange={(event) => setNewAssignee(event.target.value)}
                      className="tb-field"
                      placeholder="담당자"
                    />
                    <input
                      type="date"
                      value={newDueDate}
                      onChange={(event) => setNewDueDate(event.target.value)}
                      className="tb-field"
                      title="최종 마감일"
                    />
                    <button
                      type="submit"
                      disabled={!newTitle.trim() || adding}
                      className="tb-btn tb-btn-primary"
                    >
                      {adding ? "추가 중" : "+ 추가"}
                    </button>
                  </form>
                </div>
              ) : null}

              {!groupCollapsed &&
              !group.items.length &&
              activeAddGroup !== group.name ? (
                <div
                  className="tb-list-empty-group text-sm text-[var(--text-faint)]"
                  style={{ marginLeft: `${itemIndent}px` }}
                >
                  아직 업무가 없습니다. 오른쪽의 + 업무 버튼으로 첫 업무를
                  추가하세요.
                </div>
              ) : null}
            </div>
          );
        })}

      <div className="tb-card tb-add-strip tb-category-add p-3.5">
        <div className="mb-2.5 flex items-center gap-2 text-sm font-semibold text-[var(--text-muted)]">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
            +
          </span>
          대분류 추가
        </div>
        <form
          onSubmit={addGroup}
          className="grid gap-2 md:grid-cols-[minmax(220px,1fr)_120px]"
        >
          <input
            list="group-list"
            value={newCategoryName}
            onChange={(event) => setNewCategoryName(event.target.value)}
            className="tb-field"
            placeholder="새 대분류명 예: 2026년도 영산강청"
            title="대분류명"
          />
          <button
            type="submit"
            disabled={!newCategoryName.trim() || savingGroup}
            className="tb-btn tb-btn-primary"
          >
            {savingGroup ? "추가 중…" : "+ 대분류"}
          </button>
        </form>
      </div>
    </div>
  );
}
