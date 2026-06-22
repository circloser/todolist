"use client";

import {
  ChangeEvent,
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";

type TaskStatus = "todo" | "done";
type TaskFilter = "all" | "open" | "done";

type WorkflowTask = {
  id: number;
  templateKey: string;
  title: string;
  description: string;
  phaseGroup: string;
  position: number;
  progressValue: number | null;
  status: TaskStatus;
  assignee: string;
  memo: string;
  completedAt: string | null;
  updatedBy: string;
  updatedAt: string;
  createdAt: string;
};

type TaskResponse = {
  task?: WorkflowTask;
  tasks?: WorkflowTask[];
  viewer?: string;
  error?: string;
};

const filters: Array<{ key: TaskFilter; label: string }> = [
  { key: "all", label: "전체" },
  { key: "open", label: "진행" },
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

function statusLabel(status: TaskStatus) {
  return status === "done" ? "완료" : "진행";
}

export default function TaskBoard() {
  const [tasks, setTasks] = useState<WorkflowTask[]>([]);
  const [viewer, setViewer] = useState("팀");
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [newTitle, setNewTitle] = useState("");
  const [newAssignee, setNewAssignee] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingIds, setSavingIds] = useState<Set<number>>(new Set());
  const [adding, setAdding] = useState(false);
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

      setTasks(data.tasks ?? []);
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

  const orderedTasks = useMemo(
    () => [...tasks].sort((first, second) => first.position - second.position),
    [tasks]
  );
  const completedCount = orderedTasks.filter((task) => task.status === "done")
    .length;
  const totalCount = orderedTasks.length;
  const progress = totalCount ? Math.round((completedCount / totalCount) * 100) : 0;
  const currentTask = orderedTasks.find((task) => task.status !== "done");
  const filteredTasks = orderedTasks.filter((task) => {
    if (filter === "open") {
      return task.status !== "done";
    }

    if (filter === "done") {
      return task.status === "done";
    }

    return true;
  });

  async function updateTask(
    id: number,
    patch: Partial<Pick<WorkflowTask, "assignee" | "memo" | "status">>
  ) {
    const previousTasks = tasks;
    setError("");
    setSavingIds((current) => new Set(current).add(id));
    setTasks((current) =>
      current.map((task) => (task.id === id ? { ...task, ...patch } : task))
    );

    try {
      const response = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      const data = (await response.json()) as TaskResponse;

      if (!response.ok || !data.task) {
        throw new Error(data.error ?? "변경 내용을 저장하지 못했습니다.");
      }

      setTasks((current) =>
        current.map((task) => (task.id === id ? data.task! : task))
      );
    } catch (saveError) {
      setTasks(previousTasks);
      setError(
        saveError instanceof Error
          ? saveError.message
          : "변경 내용을 저장하지 못했습니다."
      );
    } finally {
      setSavingIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  }

  function updateLocalTask(
    id: number,
    patch: Partial<Pick<WorkflowTask, "assignee" | "memo">>
  ) {
    setTasks((current) =>
      current.map((task) => (task.id === id ? { ...task, ...patch } : task))
    );
  }

  async function addTask(event: FormEvent<HTMLFormElement>) {
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
        body: JSON.stringify({ title, assignee: newAssignee }),
      });
      const data = (await response.json()) as TaskResponse;

      if (!response.ok || !data.task) {
        throw new Error(data.error ?? "업무를 추가하지 못했습니다.");
      }

      setTasks((current) => [...current, data.task!]);
      setNewTitle("");
      setNewAssignee("");
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
                  공유 보드
                </span>
                <span>{viewer}</span>
              </div>
              <div className="max-w-3xl space-y-3">
                <h1 className="text-3xl font-semibold sm:text-4xl">
                  팀 진행 체크리스트
                </h1>
                <p className="text-base leading-7 text-[#5a665f]">
                  계획부터 결과 보고까지 같은 순서로 보고, 담당자와 메모를 함께
                  남깁니다.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-[#d8e0db] bg-[#f8faf8] p-4">
                <p className="text-xs font-semibold text-[#64746d]">완료율</p>
                <p className="mt-2 text-3xl font-semibold">{progress}%</p>
              </div>
              <div className="rounded-lg border border-[#d8e0db] bg-[#f8faf8] p-4">
                <p className="text-xs font-semibold text-[#64746d]">완료 단계</p>
                <p className="mt-2 text-3xl font-semibold">
                  {completedCount}/{totalCount}
                </p>
              </div>
              <div className="rounded-lg border border-[#d8e0db] bg-[#f8faf8] p-4">
                <p className="text-xs font-semibold text-[#64746d]">현재 단계</p>
                <p className="mt-2 truncate text-lg font-semibold">
                  {currentTask?.title ?? "전체 완료"}
                </p>
              </div>
            </div>

            <div
              className="h-3 overflow-hidden rounded-full bg-[#dfe7e1]"
              aria-label={`완료율 ${progress}%`}
            >
              <div
                className="h-full rounded-full bg-[#248f84] transition-all"
                style={{ width: `${progress}%` }}
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
            onSubmit={addTask}
            className="rounded-lg border border-[#d6ded8] bg-white p-4 shadow-sm"
          >
            <h2 className="text-base font-semibold">업무 추가</h2>
            <label className="mt-4 block text-sm font-medium text-[#4b5d56]">
              업무명
              <input
                value={newTitle}
                onChange={(event) => setNewTitle(event.target.value)}
                className="mt-2 w-full rounded-md border border-[#cbd8d2] bg-white px-3 py-2 text-sm text-[#1d2320]"
                placeholder="추가 업무"
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
            <button
              type="submit"
              disabled={!newTitle.trim() || adding}
              className="mt-4 inline-flex min-h-10 w-full items-center justify-center rounded-md bg-[#1f6f67] px-4 text-sm font-semibold text-white transition hover:bg-[#185951] disabled:cursor-not-allowed disabled:bg-[#9dbbb4]"
            >
              {adding ? "추가 중" : "+ 추가"}
            </button>
          </form>

          <div className="rounded-lg border border-[#d6ded8] bg-white p-4 shadow-sm">
            <h2 className="text-base font-semibold">수행 구간</h2>
            <div className="mt-4 grid grid-cols-4 gap-2">
              {[25, 50, 75, 100].map((value) => {
                const done = orderedTasks.some(
                  (task) =>
                    task.progressValue === value && task.status === "done"
                );

                return (
                  <div
                    key={value}
                    className={`rounded-md border px-2 py-3 text-center ${
                      done
                        ? "border-[#69afa5] bg-[#e4f5f1] text-[#1f6f67]"
                        : "border-[#d8e0db] bg-[#f8faf8] text-[#65736d]"
                    }`}
                  >
                    <p className="text-sm font-semibold">{value}%</p>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-lg border border-[#d6ded8] bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">진도 체크</h2>
              <p className="mt-1 text-sm text-[#63716b]">
                기본 템플릿 {Math.min(14, totalCount)}단계와 추가 업무
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
            <ol className="space-y-3">
              {filteredTasks.map((task) => (
                <li
                  key={task.id}
                  className={`rounded-lg border bg-white p-4 shadow-sm transition ${
                    task.status === "done"
                      ? "border-[#b7d9d2]"
                      : "border-[#d6ded8]"
                  }`}
                >
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                    <div className="flex min-w-0 gap-3">
                      <label className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#bdd3cc] bg-[#f4faf7]">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-[#1f8f84]"
                          checked={task.status === "done"}
                          onChange={(event: ChangeEvent<HTMLInputElement>) =>
                            updateTask(task.id, {
                              status: event.target.checked ? "done" : "todo",
                            })
                          }
                          aria-label={`${task.title} 완료`}
                        />
                      </label>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded bg-[#eef4f1] px-2 py-1 text-xs font-semibold text-[#587069]">
                            {String(task.position).padStart(2, "0")}
                          </span>
                          <h3
                            className={`min-w-0 text-base font-semibold ${
                              task.status === "done"
                                ? "text-[#54706a] line-through decoration-[#7fb9af]"
                                : "text-[#1d2320]"
                            }`}
                          >
                            {task.title}
                          </h3>
                          <span className="rounded bg-[#edf2ff] px-2 py-1 text-xs font-semibold text-[#325ea8]">
                            {task.phaseGroup}
                          </span>
                          {task.progressValue ? (
                            <span className="rounded bg-[#fff2d7] px-2 py-1 text-xs font-semibold text-[#95620f]">
                              {task.progressValue}%
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-2 text-sm leading-6 text-[#62716a]">
                          {task.description}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-3 text-xs text-[#6b7772]">
                          <span>{statusLabel(task.status)}</span>
                          <span>수정 {formatDate(task.updatedAt)}</span>
                          <span>{task.updatedBy || "팀"}</span>
                          {savingIds.has(task.id) ? (
                            <span className="font-semibold text-[#1f6f67]">
                              저장 중
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-3">
                      <label className="block text-sm font-medium text-[#4b5d56]">
                        담당
                        <input
                          value={task.assignee}
                          onChange={(event) =>
                            updateLocalTask(task.id, {
                              assignee: event.target.value,
                            })
                          }
                          onBlur={(event) =>
                            updateTask(task.id, {
                              assignee: event.target.value,
                            })
                          }
                          className="mt-2 w-full rounded-md border border-[#cbd8d2] bg-white px-3 py-2 text-sm text-[#1d2320]"
                          placeholder="담당자"
                        />
                      </label>
                      <label className="block text-sm font-medium text-[#4b5d56]">
                        메모
                        <textarea
                          value={task.memo}
                          onChange={(event) =>
                            updateLocalTask(task.id, { memo: event.target.value })
                          }
                          onBlur={(event) =>
                            updateTask(task.id, { memo: event.target.value })
                          }
                          className="mt-2 min-h-20 w-full resize-y rounded-md border border-[#cbd8d2] bg-white px-3 py-2 text-sm leading-6 text-[#1d2320]"
                          placeholder="상태 메모"
                        />
                      </label>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>
    </main>
  );
}
