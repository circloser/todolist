"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type StepStatus = "todo" | "done";
type TaskFilter = "all" | "open" | "done";

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
  { key: "open", label: "진행 중" },
  { key: "done", label: "완료" },
];

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
  return item.steps.find((step) => step.status !== "done")?.title ?? "전체 완료";
}

function assigneeName(value: string) {
  return value.trim() || "미지정";
}

export default function TaskBoard() {
  const [items, setItems] = useState<WorkflowItem[]>([]);
  const [viewer, setViewer] = useState("팀");
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [newTitle, setNewTitle] = useState("");
  const [newAssignee, setNewAssignee] = useState("");
  const [newMemo, setNewMemo] = useState("");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
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

  const sortedItems = useMemo(
    () =>
      [...items].sort((first, second) => {
        const assigneeCompare = assigneeName(first.assignee).localeCompare(
          assigneeName(second.assignee),
          "ko-KR"
        );

        if (assigneeCompare !== 0) {
          return assigneeCompare;
        }

        return first.position - second.position || first.id - second.id;
      }),
    [items]
  );

  const visibleItems = sortedItems.filter((item) => {
    if (filter === "open") {
      return !isItemDone(item);
    }

    if (filter === "done") {
      return isItemDone(item);
    }

    return true;
  });

  const groups = useMemo(() => {
    const byAssignee = new Map<string, WorkflowItem[]>();

    for (const item of visibleItems) {
      const key = assigneeName(item.assignee);
      byAssignee.set(key, [...(byAssignee.get(key) ?? []), item]);
    }

    return [...byAssignee.entries()].map(([assignee, groupItems]) => ({
      assignee,
      items: groupItems,
      progress: groupItems.length
        ? Math.round(
            groupItems.reduce((sum, item) => sum + itemProgress(item), 0) /
              groupItems.length
          )
        : 0,
    }));
  }, [visibleItems]);

  const totalSteps = items.reduce((sum, item) => sum + item.steps.length, 0);
  const completedSteps = items.reduce(
    (sum, item) => sum + completionCount(item),
    0
  );
  const overallProgress = totalSteps
    ? Math.round((completedSteps / totalSteps) * 100)
    : 0;
  const openItemCount = items.filter((item) => !isItemDone(item)).length;

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
    } catch (addError) {
      setError(
        addError instanceof Error ? addError.message : "업무를 추가하지 못했습니다."
      );
    } finally {
      setAdding(false);
    }
  }

  return (
    <main className="min-h-dvh bg-[#f5f7f4] text-[#1d2320]">
      <section className="border-b border-[#dce4df] bg-white">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_360px] lg:px-8">
          <div className="flex flex-col justify-between gap-6">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#4f6f68]">
                <span className="rounded-full bg-[#e6f4ef] px-3 py-1">
                  담당자별 보드
                </span>
                <span>{viewer}</span>
              </div>
              <div className="max-w-3xl space-y-3">
                <h1 className="text-3xl font-semibold sm:text-4xl">
                  팀 진행 체크리스트
                </h1>
                <p className="text-base leading-7 text-[#5a665f]">
                  업무별 진행 단계를 가로로 체크하고 담당자별로 정렬합니다.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-[#d8e0db] bg-[#f8faf8] p-4">
                <p className="text-xs font-semibold text-[#64746d]">전체 진도</p>
                <p className="mt-2 text-3xl font-semibold">
                  {overallProgress}%
                </p>
              </div>
              <div className="rounded-lg border border-[#d8e0db] bg-[#f8faf8] p-4">
                <p className="text-xs font-semibold text-[#64746d]">업무 수</p>
                <p className="mt-2 text-3xl font-semibold">{items.length}</p>
              </div>
              <div className="rounded-lg border border-[#d8e0db] bg-[#f8faf8] p-4">
                <p className="text-xs font-semibold text-[#64746d]">진행 중</p>
                <p className="mt-2 text-3xl font-semibold">{openItemCount}</p>
              </div>
            </div>

            <div
              className="h-3 overflow-hidden rounded-full bg-[#dfe7e1]"
              aria-label={`전체 진도 ${overallProgress}%`}
            >
              <div
                className="h-full rounded-full bg-[#248f84] transition-all"
                style={{ width: `${overallProgress}%` }}
              />
            </div>
          </div>

          <div className="min-h-[220px] overflow-hidden rounded-lg border border-[#d6ded8] bg-[#edf3f1]">
            <img
              src="/workflow-board.png"
              alt=""
              className="h-full min-h-[220px] w-full object-cover"
            />
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[320px_1fr] lg:px-8">
        <aside className="space-y-4">
          <form
            onSubmit={addItem}
            className="rounded-lg border border-[#d6ded8] bg-white p-4 shadow-sm"
          >
            <h2 className="text-base font-semibold">업무 추가</h2>
            <label className="mt-4 block text-sm font-medium text-[#4b5d56]">
              업무명
              <input
                value={newTitle}
                onChange={(event) => setNewTitle(event.target.value)}
                className="mt-2 w-full rounded-md border border-[#cbd8d2] bg-white px-3 py-2 text-sm text-[#1d2320]"
                placeholder="예: 홍보물 제작"
              />
            </label>
            <label className="mt-3 block text-sm font-medium text-[#4b5d56]">
              담당
              <input
                value={newAssignee}
                onChange={(event) => setNewAssignee(event.target.value)}
                className="mt-2 w-full rounded-md border border-[#cbd8d2] bg-white px-3 py-2 text-sm text-[#1d2320]"
                placeholder="담당자"
              />
            </label>
            <label className="mt-3 block text-sm font-medium text-[#4b5d56]">
              메모
              <textarea
                value={newMemo}
                onChange={(event) => setNewMemo(event.target.value)}
                className="mt-2 min-h-20 w-full resize-y rounded-md border border-[#cbd8d2] bg-white px-3 py-2 text-sm leading-6 text-[#1d2320]"
                placeholder="참고 사항"
              />
            </label>
            <button
              type="submit"
              disabled={!newTitle.trim() || adding}
              className="mt-4 inline-flex min-h-10 w-full items-center justify-center rounded-md bg-[#1f6f67] px-4 text-sm font-semibold text-white transition hover:bg-[#185951] disabled:cursor-not-allowed disabled:bg-[#9dbbb4]"
            >
              {adding ? "추가 중" : "+ 추가"}
            </button>
          </form>

          <div className="rounded-lg border border-[#d6ded8] bg-white p-4 shadow-sm">
            <h2 className="text-base font-semibold">담당자 현황</h2>
            <div className="mt-4 space-y-3">
              {groups.length ? (
                groups.map((group) => (
                  <div key={group.assignee}>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate font-semibold">
                        {group.assignee}
                      </span>
                      <span className="shrink-0 text-[#66746e]">
                        {group.items.length}건 · {group.progress}%
                      </span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#e2e9e5]">
                      <div
                        className="h-full rounded-full bg-[#248f84]"
                        style={{ width: `${group.progress}%` }}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-[#63716b]">표시할 업무가 없습니다.</p>
              )}
            </div>
          </div>
        </aside>

        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-lg border border-[#d6ded8] bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">업무별 가로 진도</h2>
              <p className="mt-1 text-sm text-[#63716b]">
                담당자 이름순으로 정렬
              </p>
            </div>
            <div className="grid grid-cols-3 overflow-hidden rounded-md border border-[#cbd8d2] bg-[#f3f6f4] p-1">
              {filters.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setFilter(item.key)}
                  className={`min-h-9 px-4 text-sm font-semibold transition ${
                    filter === item.key
                      ? "rounded bg-white text-[#1f6f67] shadow-sm"
                      : "text-[#5f6f68] hover:text-[#1d2320]"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {error ? (
            <div className="rounded-lg border border-[#e5b5a4] bg-[#fff3ee] px-4 py-3 text-sm font-medium text-[#8c3f2a]">
              {error}
            </div>
          ) : null}

          {loading ? (
            <div className="rounded-lg border border-[#d6ded8] bg-white p-8 text-center text-sm text-[#63716b]">
              불러오는 중
            </div>
          ) : (
            <div className="space-y-6">
              {groups.map((group) => (
                <section key={group.assignee} className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-base font-semibold">
                      {group.assignee}
                    </h3>
                    <span className="rounded bg-white px-3 py-1 text-sm font-semibold text-[#4f6f68] shadow-sm">
                      {group.items.length}건
                    </span>
                  </div>

                  <div className="space-y-3">
                    {group.items.map((item) => {
                      const progress = itemProgress(item);
                      const done = isItemDone(item);

                      return (
                        <article
                          key={item.id}
                          className="rounded-lg border border-[#d6ded8] bg-white p-4 shadow-sm"
                        >
                          <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
                            <div className="space-y-3">
                              <label className="block text-sm font-medium text-[#4b5d56]">
                                업무명
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
                                  className="mt-2 w-full rounded-md border border-[#cbd8d2] bg-white px-3 py-2 text-sm font-semibold text-[#1d2320]"
                                />
                              </label>
                              <label className="block text-sm font-medium text-[#4b5d56]">
                                담당
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
                                  className="mt-2 w-full rounded-md border border-[#cbd8d2] bg-white px-3 py-2 text-sm text-[#1d2320]"
                                />
                              </label>
                              <label className="block text-sm font-medium text-[#4b5d56]">
                                메모
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
                                  className="mt-2 min-h-20 w-full resize-y rounded-md border border-[#cbd8d2] bg-white px-3 py-2 text-sm leading-6 text-[#1d2320]"
                                  placeholder="상태 메모"
                                />
                              </label>
                              <div className="flex flex-wrap gap-3 text-xs text-[#6b7772]">
                                <span>{done ? "완료" : nextStepTitle(item)}</span>
                                <span>수정 {formatDate(item.updatedAt)}</span>
                                {savingItemIds.has(item.id) ? (
                                  <span className="font-semibold text-[#1f6f67]">
                                    저장 중
                                  </span>
                                ) : null}
                              </div>
                            </div>

                            <div className="min-w-0 space-y-4">
                              <div className="flex items-center gap-3">
                                <div className="h-3 flex-1 overflow-hidden rounded-full bg-[#e2e9e5]">
                                  <div
                                    className="h-full rounded-full bg-[#248f84] transition-all"
                                    style={{ width: `${progress}%` }}
                                  />
                                </div>
                                <span className="w-12 text-right text-sm font-semibold text-[#1f6f67]">
                                  {progress}%
                                </span>
                              </div>

                              <div className="overflow-x-auto pb-2">
                                <div className="flex min-w-max items-start">
                                  {item.steps.map((step, index) => {
                                    const checked = step.status === "done";
                                    const saving = savingStepIds.has(step.id);

                                    return (
                                      <div
                                        key={step.id}
                                        className="relative w-36 shrink-0 px-2"
                                      >
                                        {index > 0 ? (
                                          <div
                                            className={`absolute left-0 top-5 h-0.5 w-1/2 ${
                                              checked
                                                ? "bg-[#69afa5]"
                                                : "bg-[#cbd8d2]"
                                            }`}
                                          />
                                        ) : null}
                                        {index < item.steps.length - 1 ? (
                                          <div
                                            className={`absolute right-0 top-5 h-0.5 w-1/2 ${
                                              checked
                                                ? "bg-[#69afa5]"
                                                : "bg-[#cbd8d2]"
                                            }`}
                                          />
                                        ) : null}
                                        <button
                                          type="button"
                                          onClick={() =>
                                            updateStep(
                                              step.id,
                                              checked ? "todo" : "done"
                                            )
                                          }
                                          className={`relative z-10 mx-auto flex h-10 w-10 items-center justify-center rounded-full border text-sm font-bold transition ${
                                            checked
                                              ? "border-[#248f84] bg-[#248f84] text-white"
                                              : "border-[#b9cbc4] bg-white text-[#7b8882] hover:border-[#248f84]"
                                          }`}
                                          aria-label={`${item.title} ${step.title}`}
                                        >
                                          {checked ? "✓" : step.position}
                                        </button>
                                        <div className="mt-3 min-h-20 text-center">
                                          <p
                                            className={`text-xs font-semibold leading-5 ${
                                              checked
                                                ? "text-[#1f6f67]"
                                                : "text-[#31413b]"
                                            }`}
                                          >
                                            {step.title}
                                          </p>
                                          <p className="mt-1 text-[11px] leading-4 text-[#6b7772]">
                                            {step.phaseGroup}
                                          </p>
                                          {saving ? (
                                            <p className="mt-1 text-[11px] font-semibold text-[#1f6f67]">
                                              저장 중
                                            </p>
                                          ) : null}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}

              {!groups.length ? (
                <div className="rounded-lg border border-[#d6ded8] bg-white p-8 text-center text-sm text-[#63716b]">
                  표시할 업무가 없습니다.
                </div>
              ) : null}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
