"use client";

import { DragEvent, FormEvent, useEffect, useMemo, useState } from "react";

type StepStatus = "todo" | "done";
type TaskFilter = "all" | "open" | "done";
type SortMode = "manual" | "assignee" | "progress" | "updated";

type WorkflowStep = {
  id: number;
  itemId: number;
  stageKey: string;
  title: string;
  description: string;
  phaseGroup: string;
  position: number;
  progressValue: number | null;
  status: StepStatus;
  completedAt: string | null;
  updatedBy: string;
  updatedAt: string;
  createdAt: string;
};

type WorkflowItem = {
  id: number;
  title: string;
  assignee: string;
  memo: string;
  position: number;
  updatedBy: string;
  updatedAt: string;
  createdAt: string;
  steps: WorkflowStep[];
};

type TaskResponse = {
  item?: WorkflowItem | null;
  items?: WorkflowItem[];
  viewer?: string;
  error?: string;
};

const filters: Array<{ key: TaskFilter; label: string }> = [
  { key: "all", label: "전체" },
  { key: "open", label: "진행" },
  { key: "done", label: "완료" },
];

const sortOptions: Array<{ key: SortMode; label: string }> = [
  { key: "manual", label: "수동" },
  { key: "assignee", label: "담당자" },
  { key: "progress", label: "진도" },
  { key: "updated", label: "최근" },
];

const compactStageLabels: Record<string, string> = {
  "plan-draft": "초안",
  estimate: "견적",
  "plan-approval": "결재",
  "purchase-request": "구매",
  contract: "계약",
  kickoff: "착수",
  "progress-25": "25%",
  "progress-50": "50%",
  "progress-75": "75%",
  "progress-100": "100%",
  "completion-receipt": "완료계",
  inspection: "검수",
  "payment-request": "지급",
  "result-report": "보고",
};

function compactStageTitle(step: Pick<WorkflowStep, "stageKey" | "title">) {
  return compactStageLabels[step.stageKey] ?? step.title;
}

function formatDate(value?: string | null) {
  if (!value) {
    return "기록 없음";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function assigneeName(value: string) {
  return value.trim() || "미지정";
}

function completionCount(item: WorkflowItem) {
  return item.steps.filter((step) => step.status === "done").length;
}

function itemProgress(item: WorkflowItem) {
  if (!item.steps.length) {
    return 0;
  }

  return Math.round((completionCount(item) / item.steps.length) * 100);
}

function isItemDone(item: WorkflowItem) {
  return item.steps.length > 0 && completionCount(item) === item.steps.length;
}

function nextStepTitle(item: WorkflowItem) {
  return item.steps.find((step) => step.status !== "done")?.title ?? "완료";
}

function applyManualPositions(items: WorkflowItem[], order: number[]) {
  const positions = new Map(order.map((id, index) => [id, index + 1]));

  return items.map((item) => ({
    ...item,
    position: positions.get(item.id) ?? item.position,
  }));
}

function moveItem<T>(list: T[], from: number, to: number) {
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export default function TaskBoard() {
  const [items, setItems] = useState<WorkflowItem[]>([]);
  const [viewer, setViewer] = useState("팀");
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("manual");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [newTitle, setNewTitle] = useState("");
  const [newAssignee, setNewAssignee] = useState("");
  const [newMemo, setNewMemo] = useState("");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [savingItemIds, setSavingItemIds] = useState<Set<number>>(new Set());
  const [savingStepIds, setSavingStepIds] = useState<Set<number>>(new Set());
  const [error, setError] = useState("");

  async function loadTasks() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/tasks", { cache: "no-store" });
      const data = (await response.json()) as TaskResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "진행 목록을 불러오지 못했습니다.");
      }

      setItems(data.items ?? []);
      setViewer(data.viewer ?? "팀");
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "진행 목록을 불러오지 못했습니다."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTasks();
  }, []);

  const assignees = useMemo(
    () =>
      [...new Set(items.map((item) => assigneeName(item.assignee)))].sort(
        (first, second) => first.localeCompare(second, "ko-KR")
      ),
    [items]
  );

  const baseItems = useMemo(() => {
    return [...items].filter((item) => {
      if (assigneeFilter !== "all" && assigneeName(item.assignee) !== assigneeFilter) {
        return false;
      }

      if (filter === "open") {
        return !isItemDone(item);
      }

      if (filter === "done") {
        return isItemDone(item);
      }

      return true;
    });
  }, [assigneeFilter, filter, items]);

  const visibleItems = useMemo(() => {
    const next = [...baseItems];

    if (sortMode === "assignee") {
      return next.sort((first, second) => {
        const assigneeCompare = assigneeName(first.assignee).localeCompare(
          assigneeName(second.assignee),
          "ko-KR"
        );

        return assigneeCompare || first.position - second.position;
      });
    }

    if (sortMode === "progress") {
      return next.sort(
        (first, second) =>
          itemProgress(first) - itemProgress(second) ||
          first.position - second.position
      );
    }

    if (sortMode === "updated") {
      return next.sort(
        (first, second) =>
          new Date(second.updatedAt).getTime() -
            new Date(first.updatedAt).getTime() || first.position - second.position
      );
    }

    return next.sort((first, second) => first.position - second.position);
  }, [baseItems, sortMode]);

  const stages = visibleItems[0]?.steps ?? items[0]?.steps ?? [];
  const totalSteps = items.reduce((sum, item) => sum + item.steps.length, 0);
  const completedSteps = items.reduce(
    (sum, item) => sum + completionCount(item),
    0
  );
  const overallProgress = totalSteps
    ? Math.round((completedSteps / totalSteps) * 100)
    : 0;
  const openItemCount = items.filter((item) => !isItemDone(item)).length;

  const assigneeStats = useMemo(
    () =>
      assignees.map((assignee) => {
        const assignedItems = items.filter(
          (item) => assigneeName(item.assignee) === assignee
        );
        const progress = assignedItems.length
          ? Math.round(
              assignedItems.reduce((sum, item) => sum + itemProgress(item), 0) /
                assignedItems.length
            )
          : 0;

        return { assignee, count: assignedItems.length, progress };
      }),
    [assignees, items]
  );

  function replaceItem(nextItem: WorkflowItem) {
    setItems((current) =>
      current.map((item) => (item.id === nextItem.id ? nextItem : item))
    );
  }

  function updateLocalItem(
    id: number,
    patch: Partial<Pick<WorkflowItem, "title" | "assignee" | "memo">>
  ) {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  }

  async function updateItem(
    id: number,
    patch: Partial<Pick<WorkflowItem, "title" | "assignee" | "memo">>
  ) {
    const previousItems = items;
    setError("");
    setSavingItemIds((current) => new Set(current).add(id));

    try {
      const response = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: id, ...patch }),
      });
      const data = (await response.json()) as TaskResponse;

      if (!response.ok || !data.item) {
        throw new Error(data.error ?? "업무 정보를 저장하지 못했습니다.");
      }

      replaceItem(data.item);
    } catch (saveError) {
      setItems(previousItems);
      setError(
        saveError instanceof Error
          ? saveError.message
          : "업무 정보를 저장하지 못했습니다."
      );
    } finally {
      setSavingItemIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  }

  async function updateStep(stepId: number, status: StepStatus) {
    const previousItems = items;
    setError("");
    setSavingStepIds((current) => new Set(current).add(stepId));
    setItems((current) =>
      current.map((item) => ({
        ...item,
        steps: item.steps.map((step) =>
          step.id === stepId ? { ...step, status } : step
        ),
      }))
    );

    try {
      const response = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stepId, status }),
      });
      const data = (await response.json()) as TaskResponse;

      if (!response.ok || !data.item) {
        throw new Error(data.error ?? "진도 상태를 저장하지 못했습니다.");
      }

      replaceItem(data.item);
    } catch (saveError) {
      setItems(previousItems);
      setError(
        saveError instanceof Error
          ? saveError.message
          : "진도 상태를 저장하지 못했습니다."
      );
    } finally {
      setSavingStepIds((current) => {
        const next = new Set(current);
        next.delete(stepId);
        return next;
      });
    }
  }

  async function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = newTitle.trim();

    if (!title) {
      return;
    }

    setAdding(true);
    setError("");

    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          assignee: newAssignee,
          memo: newMemo,
        }),
      });
      const data = (await response.json()) as TaskResponse;

      if (!response.ok || !data.item) {
        throw new Error(data.error ?? "업무를 추가하지 못했습니다.");
      }

      setItems((current) => [...current, data.item!]);
      setNewTitle("");
      setNewAssignee("");
      setNewMemo("");
      setSortMode("manual");
    } catch (addError) {
      setError(
        addError instanceof Error ? addError.message : "업무를 추가하지 못했습니다."
      );
    } finally {
      setAdding(false);
    }
  }

  async function persistOrder(order: number[]) {
    const previousItems = items;
    setError("");
    setSavingOrder(true);
    setSortMode("manual");
    setItems((current) => applyManualPositions(current, order));

    try {
      const response = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order }),
      });
      const data = (await response.json()) as TaskResponse;

      if (!response.ok || !data.items) {
        throw new Error(data.error ?? "업무 순서를 저장하지 못했습니다.");
      }

      setItems(data.items);
    } catch (saveError) {
      setItems(previousItems);
      setError(
        saveError instanceof Error
          ? saveError.message
          : "업무 순서를 저장하지 못했습니다."
      );
    } finally {
      setSavingOrder(false);
    }
  }

  function handleDrop(targetId: number) {
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null);
      return;
    }

    const sourceIndex = visibleItems.findIndex((item) => item.id === draggedId);
    const targetIndex = visibleItems.findIndex((item) => item.id === targetId);

    if (sourceIndex < 0 || targetIndex < 0) {
      setDraggedId(null);
      return;
    }

    const reorderedVisible = moveItem(visibleItems, sourceIndex, targetIndex);
    const visibleIds = new Set(visibleItems.map((item) => item.id));
    let visibleIndex = 0;
    const fullOrder = [...items]
      .sort((first, second) => first.position - second.position)
      .map((item) =>
        visibleIds.has(item.id) ? reorderedVisible[visibleIndex++].id : item.id
      );

    setDraggedId(null);
    void persistOrder(fullOrder);
  }

  function handleDragOver(event: DragEvent<HTMLTableRowElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }

  return (
    <main className="min-h-dvh bg-[#f4f6f3] text-[#1d2320]">
      <header className="border-b border-[#d9e1dc] bg-white">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#4f6f68]">
                <span className="rounded bg-[#e6f4ef] px-2.5 py-1">
                  습지복원팀
                </span>
                <span>{viewer}</span>
              </div>
              <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">
                업무 진행표
              </h1>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:min-w-[420px]">
              <div className="border border-[#d8e0db] bg-[#f8faf8] px-3 py-2">
                <p className="text-xs font-semibold text-[#64746d]">전체</p>
                <p className="text-xl font-semibold">{overallProgress}%</p>
              </div>
              <div className="border border-[#d8e0db] bg-[#f8faf8] px-3 py-2">
                <p className="text-xs font-semibold text-[#64746d]">업무</p>
                <p className="text-xl font-semibold">{items.length}</p>
              </div>
              <div className="border border-[#d8e0db] bg-[#f8faf8] px-3 py-2">
                <p className="text-xs font-semibold text-[#64746d]">진행</p>
                <p className="text-xl font-semibold">{openItemCount}</p>
              </div>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto] lg:items-end">
            <div className="grid gap-2 sm:grid-cols-[minmax(180px,260px)_minmax(180px,220px)_1fr]">
              <label className="text-sm font-medium text-[#4b5d56]">
                담당자
                <select
                  value={assigneeFilter}
                  onChange={(event) => setAssigneeFilter(event.target.value)}
                  className="mt-1 min-h-10 w-full border border-[#cbd8d2] bg-white px-3 text-sm text-[#1d2320]"
                >
                  <option value="all">전체</option>
                  {assignees.map((assignee) => (
                    <option key={assignee} value={assignee}>
                      {assignee}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm font-medium text-[#4b5d56]">
                정렬
                <select
                  value={sortMode}
                  onChange={(event) => setSortMode(event.target.value as SortMode)}
                  className="mt-1 min-h-10 w-full border border-[#cbd8d2] bg-white px-3 text-sm text-[#1d2320]"
                >
                  {sortOptions.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex items-end">
                <div className="grid w-full grid-cols-3 overflow-hidden border border-[#cbd8d2] bg-[#f3f6f4] p-1">
                  {filters.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setFilter(item.key)}
                      className={`min-h-9 px-3 text-sm font-semibold transition ${
                        filter === item.key
                          ? "bg-white text-[#1f6f67] shadow-sm"
                          : "text-[#5f6f68] hover:text-[#1d2320]"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {assigneeStats.slice(0, 5).map((stat) => (
                <button
                  key={stat.assignee}
                  type="button"
                  onClick={() => setAssigneeFilter(stat.assignee)}
                  className="min-h-10 border border-[#d4ded8] bg-white px-3 text-left text-sm hover:border-[#8fbfb5]"
                >
                  <span className="font-semibold">{stat.assignee}</span>
                  <span className="ml-2 text-[#66746e]">
                    {stat.count}건 · {stat.progress}%
                  </span>
                </button>
              ))}
            </div>

            <div className="text-sm font-semibold text-[#4f6f68]">
              {savingOrder ? "순서 저장 중" : `${visibleItems.length}건 표시`}
            </div>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-[1600px] px-4 py-4 sm:px-6 lg:px-8">
        {error ? (
          <div className="mb-3 border border-[#e5b5a4] bg-[#fff3ee] px-4 py-3 text-sm font-medium text-[#8c3f2a]">
            {error}
          </div>
        ) : null}

        <div className="overflow-hidden border border-[#cfdad4] bg-white shadow-sm">
          <div className="overflow-x-hidden">
            <table className="w-full table-fixed border-collapse text-[11px] xl:text-xs">
              <colgroup>
                <col className="w-[2.75%]" />
                <col className="w-[15.5%]" />
                <col className="w-[8.5%]" />
                <col className="w-[8%]" />
                {stages.map((stage) => (
                  <col key={stage.stageKey} className="w-[3.2%]" />
                ))}
                <col className="w-[20.45%]" />
              </colgroup>
              <thead>
                <tr className="bg-[#f7faf8] text-left text-xs font-semibold text-[#53625c]">
                  <th className="border-b border-r border-[#dbe4df] bg-[#f7faf8] px-1 py-3" />
                  <th className="border-b border-r border-[#dbe4df] bg-[#f7faf8] px-2 py-3">
                    업무
                  </th>
                  <th className="border-b border-r border-[#dbe4df] bg-[#f7faf8] px-2 py-3">
                    담당
                  </th>
                  <th className="border-b border-r border-[#dbe4df] px-2 py-3">
                    진도
                  </th>
                  {stages.map((stage) => (
                    <th
                      key={stage.stageKey}
                      className="border-b border-r border-[#dbe4df] px-1 py-3 text-center"
                      title={`${stage.title} · ${stage.description}`}
                    >
                      <span className="block truncate leading-4">
                        {compactStageTitle(stage)}
                      </span>
                    </th>
                  ))}
                  <th className="border-b border-[#dbe4df] px-2 py-3">
                    메모
                  </th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={stages.length + 5}
                      className="px-4 py-12 text-center text-[#63716b]"
                    >
                      불러오는 중
                    </td>
                  </tr>
                ) : null}

                {!loading && !visibleItems.length ? (
                  <tr>
                    <td
                      colSpan={stages.length + 5}
                      className="px-4 py-12 text-center text-[#63716b]"
                    >
                      표시할 업무가 없습니다.
                    </td>
                  </tr>
                ) : null}

                {!loading &&
                  visibleItems.map((item) => {
                    const progress = itemProgress(item);
                    const done = isItemDone(item);

                    return (
                      <tr
                        key={item.id}
                        onDragOver={handleDragOver}
                        onDrop={() => handleDrop(item.id)}
                        className={`group border-b border-[#e4ebe7] ${
                          draggedId === item.id ? "bg-[#edf7f4]" : "bg-white"
                        } hover:bg-[#f8fbf9]`}
                      >
                        <td className="border-r border-[#dbe4df] bg-inherit px-1 py-2 align-top">
                          <button
                            type="button"
                            draggable
                            onDragStart={(event) => {
                              setDraggedId(item.id);
                              event.dataTransfer.effectAllowed = "move";
                            }}
                            onDragEnd={() => setDraggedId(null)}
                            className="flex h-8 w-full cursor-grab items-center justify-center border border-[#d2ddd7] bg-white text-[#72817a] active:cursor-grabbing"
                            title="드래그"
                          >
                            ⋮
                          </button>
                        </td>
                        <td className="border-r border-[#dbe4df] bg-inherit px-1.5 py-2 align-top">
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
                            className="min-h-8 w-full border border-transparent bg-transparent px-1.5 text-xs font-semibold text-[#1d2320] hover:border-[#cbd8d2] focus:border-[#77b8ae] focus:bg-white xl:text-sm"
                          />
                          <div className="mt-1 truncate px-1.5 text-[10px] text-[#6b7772] xl:text-xs">
                            {done ? "완료" : nextStepTitle(item)} · 수정{" "}
                            {formatDate(item.updatedAt)}
                          </div>
                        </td>
                        <td className="border-r border-[#dbe4df] bg-inherit px-1.5 py-2 align-top">
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
                            className="min-h-8 w-full border border-transparent bg-transparent px-1.5 text-xs text-[#1d2320] hover:border-[#cbd8d2] focus:border-[#77b8ae] focus:bg-white"
                          />
                          {savingItemIds.has(item.id) ? (
                            <div className="mt-1 px-1.5 text-[10px] font-semibold text-[#1f6f67]">
                              저장 중
                            </div>
                          ) : null}
                        </td>
                        <td className="border-r border-[#dbe4df] px-1.5 py-3 align-top">
                          <div className="flex items-center gap-1.5">
                            <div className="h-2 flex-1 overflow-hidden bg-[#e2e9e5]">
                              <div
                                className="h-full bg-[#248f84]"
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                            <span className="w-8 text-right text-[11px] font-semibold text-[#1f6f67]">
                              {progress}%
                            </span>
                          </div>
                        </td>
                        {item.steps.map((step, index) => {
                          const checked = step.status === "done";
                          const saving = savingStepIds.has(step.id);
                          const previousDone =
                            index === 0 || item.steps[index - 1]?.status === "done";
                          const active = checked || previousDone;

                          return (
                            <td
                              key={step.id}
                              className={`border-r border-[#dbe4df] px-0.5 py-2 text-center align-middle ${
                                checked
                                  ? "bg-[#dff3ee]"
                                  : active
                                    ? "bg-[#fff8dc]"
                                    : "bg-white"
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  updateStep(step.id, checked ? "todo" : "done")
                                }
                                className={`mx-auto flex h-7 w-7 items-center justify-center border text-[11px] font-semibold transition xl:h-8 xl:w-8 ${
                                  checked
                                    ? "border-[#248f84] bg-[#248f84] text-white"
                                    : active
                                      ? "border-[#e2c75e] bg-[#f7e47d] text-[#4d4626] hover:border-[#248f84]"
                                      : "border-[#d7e1dc] bg-white text-[#75837d] hover:border-[#248f84]"
                                }`}
                                title={step.description}
                              >
                                {saving ? "…" : checked ? "✓" : ""}
                              </button>
                            </td>
                          );
                        })}
                        <td className="px-2 py-2 align-top">
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
                            className="min-h-14 w-full resize-y border border-transparent bg-transparent px-1.5 py-1 text-xs leading-5 text-[#1d2320] hover:border-[#cbd8d2] focus:border-[#77b8ae] focus:bg-white xl:text-sm"
                            placeholder="메모"
                          />
                        </td>
                      </tr>
                    );
                  })}
              </tbody>

              <tfoot>
                <tr className="border-t-2 border-[#9fcac1] bg-[#f6fbf8]">
                  <td className="border-r border-[#dbe4df] bg-[#f6fbf8] px-1 py-3" />
                  <td
                    colSpan={stages.length + 4}
                    className="px-3 py-3"
                  >
                    <form
                      onSubmit={addItem}
                      className="grid gap-2 lg:grid-cols-[minmax(220px,1fr)_160px_minmax(220px,1fr)_100px]"
                    >
                      <input
                        value={newTitle}
                        onChange={(event) => setNewTitle(event.target.value)}
                        className="min-h-10 border border-[#cbd8d2] bg-white px-3 text-sm text-[#1d2320]"
                        placeholder="새 업무"
                      />
                      <input
                        value={newAssignee}
                        onChange={(event) => setNewAssignee(event.target.value)}
                        className="min-h-10 border border-[#cbd8d2] bg-white px-3 text-sm text-[#1d2320]"
                        placeholder="담당"
                      />
                      <input
                        value={newMemo}
                        onChange={(event) => setNewMemo(event.target.value)}
                        className="min-h-10 border border-[#cbd8d2] bg-white px-3 text-sm text-[#1d2320]"
                        placeholder="메모"
                      />
                      <button
                        type="submit"
                        disabled={!newTitle.trim() || adding}
                        className="min-h-10 bg-[#1f6f67] px-4 text-sm font-semibold text-white transition hover:bg-[#185951] disabled:cursor-not-allowed disabled:bg-[#9dbbb4]"
                      >
                        {adding ? "추가 중" : "+ 추가"}
                      </button>
                    </form>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
}
