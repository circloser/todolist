"use client";

import {
  Fragment,
} from "react";
import {
  assigneeName,
  canToggleStep,
  formatBudget,
  formatDate,
  formatDay,
  isItemDone,
  itemProgress,
  nextStepTitle,
  rowAccentColor,
  shortDueLabel,
  subtaskProgress,
  urgency,
} from "../../lib/workflow";
import { useBoard } from "../board-context";

export default function GridView() {
  const {
    templates,
    history,
    assigneeSettings,
    setStageFilter,
    newTitle,
    setNewTitle,
    newAssignee,
    setNewAssignee,
    newMemo,
    setNewMemo,
    newAllocatedBudget,
    setNewAllocatedBudget,
    newRequiredBudget,
    setNewRequiredBudget,
    newDueDate,
    setNewDueDate,
    newTemplateKey,
    setNewTemplateKey,
    expandedIds,
    subtaskDrafts,
    setSubtaskDrafts,
    newGroup,
    setNewGroup,
    setDropIndicator,
    loading,
    adding,
    draggedId,
    setDraggedId,
    savingItemIds,
    deletingItemIds,
    savingStepIds,
    savingSubtaskIds,
    visibleItems,
    gridGroups,
    updateLocalItem,
    updateLocalSubtask,
    updateItem,
    deleteItem,
    updateStep,
    updateStepDueDate,
    updateSubtask,
    addSubtask,
    addItem,
    saveAssigneeColor,
    openTemplateEditor,
    handleDrop,
    handleDragOver,
    toggleExpanded,
    progressColor,
  } = useBoard();

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="tb-card px-4 py-16 text-center text-sm text-[var(--text-muted)]">
          불러오는 중…
        </div>
      ) : null}

      {!loading && !visibleItems.length ? (
        <div className="tb-card px-4 py-16 text-center text-sm text-[var(--text-muted)]">
          표시할 업무가 없습니다.
        </div>
      ) : null}

      {!loading &&
        gridGroups.map((group) => (
          <div key={group.templateKey} className="tb-card tb-grid-sheet overflow-hidden">
            {gridGroups.length > 1 ? (
              <div className="tb-grid-heading flex items-center gap-2 border-b border-[var(--border)] px-4 py-2.5 text-sm font-semibold text-[var(--text)]">
                {group.templateName}
                <span className="tb-badge tb-badge-muted">
                  {group.items.length}건
                </span>
              </div>
            ) : null}
            <div className="overflow-x-auto">
              <table className="tb-table table-fixed text-[11px] xl:text-xs">
                <colgroup>
                  <col className="w-[9%]" />
                  <col className="w-[44px]" />
                  <col className="w-[14%]" />
                  <col className="w-[8%]" />
                  <col className="w-[8%]" />
                  {group.stages.map((stage) => (
                    <col key={stage.stageKey} className="w-[3%]" />
                  ))}
                  <col className="w-[21%]" />
                </colgroup>
          <thead>
            <tr className="text-left">
              <th className="px-3 py-3">업무 위계</th>
              <th className="px-1 py-3" />
              <th className="px-3 py-3">업무</th>
              <th className="px-3 py-3">담당</th>
              <th className="px-3 py-3">진도</th>
              {group.stages.map((stage) => (
                <th
                  key={stage.stageKey}
                  className="px-0.5 py-2 text-center"
                  title={`${stage.title} · ${stage.description}`}
                >
                  <span
                    className="mx-auto flex min-h-[88px] items-center justify-center whitespace-nowrap text-[11px] font-medium leading-none text-[var(--text-muted)]"
                    style={{ writingMode: "vertical-rl" }}
                  >
                    {stage.title}
                  </span>
                </th>
              ))}
              <th className="px-3 py-3">메모 / 예산 / 일정</th>
            </tr>
          </thead>

          <tbody>
            {group.items.map((item) => {
                const progress = itemProgress(item);
                const done = isItemDone(item);
                const expanded = expandedIds.has(item.id);
                const rowColor = rowAccentColor(
                  assigneeSettings[assigneeName(item.assignee)]
                );
                const subProgress = subtaskProgress(item);

                return (
                  <Fragment key={item.id}>
                    <tr
                      onDragOver={handleDragOver}
                      onDrop={(event) => handleDrop(event, item.id)}
                      className={`tb-row ${
                        draggedId === item.id ? "bg-[var(--accent-soft)]" : ""
                      }`}
                    >
                      <td
                        className="px-2 py-2.5 align-top"
                        style={{ boxShadow: `inset 3px 0 0 ${rowColor}` }}
                      >
                        <input
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
                          className="tb-ghost text-xs font-semibold text-[var(--accent)]"
                          placeholder="업무 위계"
                        />
                      </td>
                      <td className="px-1 py-2.5 align-top">
                        <div className="flex flex-col items-center gap-1">
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
                            className="tb-iconbtn h-6 w-6 cursor-grab active:cursor-grabbing"
                            title="드래그로 순서 변경"
                          >
                            ⋮⋮
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleExpanded(item.id)}
                            className="tb-iconbtn h-6 w-6"
                            title="세부 체크리스트"
                          >
                            {expanded ? "−" : "+"}
                          </button>
                          <button
                            aria-label="업무 삭제"
                            type="button"
                            disabled={deletingItemIds.has(item.id)}
                            onClick={() => void deleteItem(item)}
                            className="tb-iconbtn tb-iconbtn-danger h-6 w-6 disabled:cursor-not-allowed disabled:opacity-40"
                            title="업무 삭제"
                          >
                            ×
                          </button>
                        </div>
                      </td>
                      <td className="px-2 py-2.5 align-top">
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
                          className="tb-ghost text-xs font-semibold xl:text-sm"
                        />
                        <div className="mt-1 flex flex-wrap items-center gap-1 px-2 text-[11px] text-[var(--text-muted)] xl:text-[11px]">
                          {done ? (
                            <span className="tb-badge tb-badge-complete">완료</span>
                          ) : (
                            <span className="tb-badge tb-badge-muted">
                              {nextStepTitle(item)}
                            </span>
                          )}
                          {subProgress !== null ? (
                            <span>세부 {subProgress}%</span>
                          ) : null}
                          {savingItemIds.has(item.id) ? (
                            <span className="text-[var(--accent)]">저장 중…</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-2 py-2.5 align-top">
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
                          className="tb-ghost text-xs"
                        />
                        <input
                          type="color"
                          value={assigneeSettings[assigneeName(item.assignee)] ?? "#e6f4ef"}
                          onChange={(event) =>
                            saveAssigneeColor(
                              assigneeName(item.assignee),
                              event.target.value
                            )
                          }
                          className="mt-1.5 h-5 w-full cursor-pointer rounded border border-[var(--border)] bg-transparent p-0"
                          title="담당자 색상"
                        />
                      </td>
                      <td className="px-2 py-2.5 align-top">
                        <div className="flex items-center gap-1.5">
                          <div className="tb-progress flex-1">
                            <span
                              style={{
                                width: `${progress}%`,
                                background: progressColor(item),
                              }}
                            />
                          </div>
                          <span className="w-8 text-right text-[11px] font-bold">
                            {progress}%
                          </span>
                        </div>
                        <label
                          className="tb-stage-due relative mt-2 h-7 px-2 font-semibold"
                          title="최종 마감일"
                        >
                          {item.dueDate ? `마감 ${formatDay(item.dueDate)}` : "+ 마감일"}
                          <input
                            type="date"
                            value={item.dueDate ?? ""}
                            onChange={(event) =>
                              updateItem(item.id, {
                                dueDate: event.target.value,
                              })
                            }
                            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                          />
                        </label>
                      </td>
                      {item.steps.map((step, index) => {
                        const checked = step.status === "done";
                        const saving = savingStepIds.has(step.id);
                        const allowed = canToggleStep(item, index);
                        const state = urgency(step.dueDate);
                        const disabled = !allowed || saving;
                        const stageClass = checked
                          ? "is-done"
                          : !allowed
                            ? "is-locked"
                            : state === "overdue" || state === "danger"
                              ? "is-danger"
                              : state === "warning"
                                ? "is-warning"
                                : "is-available";

                        return (
                          <td
                            key={step.id}
                            className="px-0.5 py-1.5 text-center align-middle"
                            title={`${step.title} · ${step.description}${
                              step.dueDate ? ` · 목표일 ${formatDay(step.dueDate)}` : ""
                            }`}
                          >
                            <div className="flex flex-col items-center gap-1">
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
                                className={`tb-stage ${stageClass}`}
                              >
                                {saving
                                  ? "…"
                                  : checked
                                    ? "✓"
                                    : step.dueDate
                                      ? shortDueLabel(step.dueDate)
                                      : ""}
                              </button>
                              <label
                                className="tb-stage-due relative"
                                title={`${step.title} 목표일 설정`}
                              >
                                +
                                <input
                                  type="date"
                                  value={step.dueDate ?? ""}
                                  onChange={(event) =>
                                    updateStepDueDate(step, event.target.value)
                                  }
                                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                                />
                              </label>
                            </div>
                          </td>
                        );
                      })}
                      <td className="px-3 py-2.5 align-top">
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
                          className="tb-ghost min-h-[52px] resize-y text-xs leading-5 xl:text-sm"
                          placeholder="메모를 입력하세요"
                        />
                        <div className="mt-2 grid grid-cols-2 gap-1.5">
                          <label className="text-[11px] font-semibold text-[var(--text-muted)]">
                            편성 예산
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
                              className="tb-field mt-1 px-2 py-1.5 text-xs font-normal"
                              placeholder="원"
                            />
                          </label>
                          <label className="text-[11px] font-semibold text-[var(--text-muted)]">
                            소요 예산
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
                              className="tb-field mt-1 px-2 py-1.5 text-xs font-normal"
                              placeholder="원"
                            />
                          </label>
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-x-2 text-[11px] text-[var(--text-faint)]">
                          <span>
                            {item.allocatedBudget || item.requiredBudget
                              ? `편성 ${formatBudget(item.allocatedBudget)} / 소요 ${formatBudget(item.requiredBudget)}`
                              : "예산 미입력"}
                          </span>
                          <span>· 수정 {formatDate(item.updatedAt)}</span>
                        </div>
                      </td>
                    </tr>

                    {expanded ? (
                      <tr className="tb-grid-expanded">
                        <td colSpan={2} />
                        <td colSpan={group.stages.length + 4} className="px-4 py-4">
                          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
                            <div>
                              <div className="mb-2.5 text-sm font-semibold">
                                세부 체크리스트
                              </div>
                              <div className="space-y-1.5">
                                <div className="hidden grid-cols-[34px_minmax(180px,1.2fr)_130px_minmax(180px,1fr)_44px] gap-2 px-2 text-[11px] font-semibold text-[var(--text-faint)] md:grid">
                                  <span />
                                  <span>내용</span>
                                  <span>기한</span>
                                  <span>애로사항</span>
                                  <span />
                                </div>
                                {item.subtasks.map((subtask) => (
                                  <div
                                    key={subtask.id}
                                    className="tb-subtask-row grid gap-2 p-2 md:grid-cols-[34px_minmax(180px,1.2fr)_130px_minmax(180px,1fr)_44px] md:items-center"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={subtask.status === "done"}
                                      onChange={(event) => {
                                        updateLocalSubtask(subtask.id, {
                                          status: event.target.checked
                                            ? "done"
                                            : "todo",
                                        });
                                        void updateSubtask(subtask.id, {
                                          status: event.target.checked
                                            ? "done"
                                            : "todo",
                                        });
                                      }}
                                      className="h-4 w-4 accent-[var(--accent)] md:mx-auto"
                                    />
                                    <label className="grid gap-1 text-[11px] font-semibold text-[var(--text-faint)] md:block">
                                      <span className="md:hidden">내용</span>
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
                                        className={`tb-ghost text-sm font-normal ${
                                          subtask.status === "done"
                                            ? "text-[var(--text-faint)] line-through"
                                            : "text-[var(--text)]"
                                        }`}
                                      />
                                    </label>
                                    <label className="grid gap-1 text-[11px] font-semibold text-[var(--text-faint)] md:block">
                                      <span className="md:hidden">기한</span>
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
                                        className="tb-field px-2 py-1.5 text-xs font-normal"
                                      />
                                    </label>
                                    <label className="grid gap-1 text-[11px] font-semibold text-[var(--text-faint)] md:block">
                                      <span className="md:hidden">애로사항</span>
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
                                        className="tb-ghost text-sm font-normal"
                                        placeholder="없음"
                                      />
                                    </label>
                                    <span className="text-center text-[11px] text-[var(--accent)]">
                                      {savingSubtaskIds.has(subtask.id) ? "저장" : ""}
                                    </span>
                                  </div>
                                ))}
                              </div>
                              <form
                                onSubmit={(event) => {
                                  event.preventDefault();
                                  void addSubtask(item.id);
                                }}
                                className="mt-2.5 grid gap-2 md:grid-cols-[minmax(180px,1.2fr)_130px_minmax(180px,1fr)_84px]"
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
                                  className="tb-field"
                                  placeholder="새 체크리스트 내용"
                                />
                                <input
                                  type="date"
                                  value={subtaskDrafts[item.id]?.dueDate ?? ""}
                                  onChange={(event) =>
                                    setSubtaskDrafts((current) => ({
                                      ...current,
                                      [item.id]: {
                                        title: current[item.id]?.title ?? "",
                                        dueDate: event.target.value,
                                        blockers: current[item.id]?.blockers ?? "",
                                      },
                                    }))
                                  }
                                  className="tb-field"
                                />
                                <input
                                  value={subtaskDrafts[item.id]?.blockers ?? ""}
                                  onChange={(event) =>
                                    setSubtaskDrafts((current) => ({
                                      ...current,
                                      [item.id]: {
                                        title: current[item.id]?.title ?? "",
                                        dueDate: current[item.id]?.dueDate ?? "",
                                        blockers: event.target.value,
                                      },
                                    }))
                                  }
                                  className="tb-field"
                                  placeholder="애로사항"
                                />
                                <button type="submit" className="tb-btn tb-btn-primary">
                                  추가
                                </button>
                              </form>
                            </div>

                            <div className="tb-side-panel p-3.5">
                              <div className="text-sm font-semibold">최근 이력</div>
                              <div className="mt-2.5 max-h-44 space-y-2.5 overflow-auto">
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
                                {!history.some(
                                  (entry) => entry.itemId === item.id
                                ) ? (
                                  <div className="text-xs text-[var(--text-faint)]">
                                    아직 기록이 없습니다.
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
          </tbody>
              </table>
            </div>
          </div>
        ))}

      <div className="tb-card tb-add-strip p-3.5">
        <div className="mb-2.5 flex items-center gap-2 text-sm font-semibold text-[var(--text-muted)]">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
            +
          </span>
          새 업무 추가
        </div>
        <form
          onSubmit={addItem}
          className="grid gap-2 md:grid-cols-2 xl:grid-cols-[130px_150px_minmax(150px,1fr)_100px_120px_100px_100px_minmax(140px,1fr)_84px]"
        >
          <input
            list="group-list"
            value={newGroup}
            onChange={(event) => setNewGroup(event.target.value)}
            className="tb-field"
            placeholder="업무 위계"
          />
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
            title="유형 (단계 세트)"
          >
            {templates.map((template) => (
              <option key={template.key} value={template.key}>
                {template.name} ({template.stages.length}단계)
              </option>
            ))}
            <option value="__new__">＋ 새 유형 만들기…</option>
          </select>
          <input
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
          <input
            type="number"
            min="0"
            step="1000"
            value={newAllocatedBudget}
            onChange={(event) => setNewAllocatedBudget(event.target.value)}
            className="tb-field"
            placeholder="편성 예산"
          />
          <input
            type="number"
            min="0"
            step="1000"
            value={newRequiredBudget}
            onChange={(event) => setNewRequiredBudget(event.target.value)}
            className="tb-field"
            placeholder="소요 예산"
          />
          <input
            value={newMemo}
            onChange={(event) => setNewMemo(event.target.value)}
            className="tb-field"
            placeholder="메모"
          />
          <button
            type="submit"
            disabled={!newTitle.trim() || adding}
            className="tb-btn tb-btn-primary"
          >
            {adding ? "추가 중…" : "+ 추가"}
          </button>
        </form>
      </div>
    </div>
  );
}
