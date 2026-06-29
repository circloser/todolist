"use client";

import {
  DragEvent,
  FormEvent,
  Fragment,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  applyManualPositions,
  assigneeName,
  canToggleStep,
  categoryName,
  completionCount,
  formatBudget,
  formatDate,
  formatDay,
  isItemDone,
  itemHasOverdueDate,
  itemHasUrgentDate,
  itemProgress,
  moveItem,
  nextStep,
  nextStepTitle,
  rowAccentColor,
  shortDueLabel,
  subtaskProgress,
  urgency,
  type AppSettings,
  type DueFilter,
  type HistoryEntry,
  type SortMode,
  type StepStatus,
  type SubtaskDraft,
  type TaskFilter,
  type TaskResponse,
  type TemplateOption,
  type ViewMode,
  type WorkflowItem,
  type WorkflowStep,
  type WorkflowSubtask,
} from "./lib/workflow";

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

const dueFilters: Array<{ key: DueFilter; label: string }> = [
  { key: "all", label: "전체 일정" },
  { key: "urgent", label: "D-3 이내" },
  { key: "overdue", label: "지연" },
];

const defaultTemplates: TemplateOption[] = [
  {
    key: "external-research-outsourcing",
    name: "외부 학술/조사 용역",
    description: "공공 조달, 계약, 보고, 검수, 지급이 포함된 외부 용역",
    stages: [],
  },
];

const defaultSettings: AppSettings = {
  organizationName: "습지복원팀",
  boardTitle: "Workflow Command Center",
};

export default function TaskBoard() {
  const [items, setItems] = useState<WorkflowItem[]>([]);
  const [templates, setTemplates] = useState<TemplateOption[]>(defaultTemplates);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [assigneeSettings, setAssigneeSettings] = useState<Record<string, string>>(
    {}
  );
  const [organizationName, setOrganizationName] = useState(
    defaultSettings.organizationName
  );
  const [boardTitle, setBoardTitle] = useState(defaultSettings.boardTitle);
  const [userName, setUserName] = useState("사용자");
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [dueFilter, setDueFilter] = useState<DueFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("manual");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [templateFilter, setTemplateFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");
  const [keyword, setKeyword] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState("일반 업무");
  const [newAssignee, setNewAssignee] = useState("");
  const [newMemo, setNewMemo] = useState("");
  const [newAllocatedBudget, setNewAllocatedBudget] = useState("");
  const [newRequiredBudget, setNewRequiredBudget] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [newTemplateKey, setNewTemplateKey] = useState(
    "external-research-outsourcing"
  );
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [subtaskDrafts, setSubtaskDrafts] = useState<
    Record<number, SubtaskDraft>
  >({});
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [savingItemIds, setSavingItemIds] = useState<Set<number>>(new Set());
  const [deletingItemIds, setDeletingItemIds] = useState<Set<number>>(new Set());
  const [savingStepIds, setSavingStepIds] = useState<Set<number>>(new Set());
  const [savingSubtaskIds, setSavingSubtaskIds] = useState<Set<number>>(new Set());
  const [error, setError] = useState("");
  const currentActor = userName.trim() || "사용자";

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
      setTemplates(data.templates?.length ? data.templates : defaultTemplates);
      setHistory(data.history ?? []);
      setAssigneeSettings(data.assigneeSettings ?? {});
      setOrganizationName(
        data.settings?.organizationName ?? defaultSettings.organizationName
      );
      setBoardTitle(data.settings?.boardTitle ?? defaultSettings.boardTitle);

      const storedUserName = window.localStorage
        .getItem("team-progress-user-name")
        ?.trim();
      setUserName(storedUserName || data.viewer || "사용자");
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
    const timer = window.setTimeout(() => {
      void loadTasks();
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  function saveUserName(value: string) {
    const nextUserName = value.trim() || "사용자";
    setUserName(nextUserName);
    window.localStorage.setItem("team-progress-user-name", nextUserName);
  }

  async function saveBoardSettings(nextSettings?: Partial<AppSettings>) {
    const nextOrganizationName = (
      nextSettings?.organizationName ?? organizationName
    ).trim();
    const nextBoardTitle = (nextSettings?.boardTitle ?? boardTitle).trim();

    if (!nextOrganizationName || !nextBoardTitle) {
      setError("조직명과 보드명을 입력해 주세요.");
      return;
    }

    setSavingSettings(true);
    setError("");

    try {
      const response = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update-settings",
          actor: currentActor,
          organizationName: nextOrganizationName,
          boardTitle: nextBoardTitle,
        }),
      });
      const data = (await response.json()) as TaskResponse;

      if (!response.ok || !data.settings) {
        throw new Error(data.error ?? "보드 설정을 저장하지 못했습니다.");
      }

      setOrganizationName(data.settings.organizationName);
      setBoardTitle(data.settings.boardTitle);
      setHistory(data.history ?? history);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "보드 설정을 저장하지 못했습니다."
      );
    } finally {
      setSavingSettings(false);
    }
  }

  const assignees = useMemo(
    () =>
      [...new Set(items.map((item) => assigneeName(item.assignee)))].sort(
        (first, second) => first.localeCompare(second, "ko-KR")
      ),
    [items]
  );

  const categories = useMemo(
    () =>
      [...new Set(items.map((item) => categoryName(item.category)))].sort(
        (first, second) => first.localeCompare(second, "ko-KR")
      ),
    [items]
  );

  const selectedTemplate =
    templateFilter === "all"
      ? null
      : templates.find((template) => template.key === templateFilter) ?? null;

  const baseItems = useMemo(() => {
    const query = keyword.trim().toLocaleLowerCase("ko-KR");

    return [...items].filter((item) => {
      if (templateFilter !== "all" && item.templateKey !== templateFilter) {
        return false;
      }

      if (assigneeFilter !== "all" && assigneeName(item.assignee) !== assigneeFilter) {
        return false;
      }

      if (categoryFilter !== "all" && categoryName(item.category) !== categoryFilter) {
        return false;
      }

      if (stageFilter !== "all" && nextStep(item)?.stageKey !== stageFilter) {
        return false;
      }

      if (dueFilter === "urgent" && !itemHasUrgentDate(item)) {
        return false;
      }

      if (dueFilter === "overdue" && !itemHasOverdueDate(item)) {
        return false;
      }

      if (filter === "open" && isItemDone(item)) {
        return false;
      }

      if (filter === "done" && !isItemDone(item)) {
        return false;
      }

      if (query) {
        const haystack = [
          item.title,
          item.category,
          item.assignee,
          item.memo,
          ...item.subtasks.map((subtask) => subtask.title),
          ...item.subtasks.map((subtask) => subtask.blockers),
        ]
          .join(" ")
          .toLocaleLowerCase("ko-KR");

        if (!haystack.includes(query)) {
          return false;
        }
      }

      return true;
    });
  }, [
    assigneeFilter,
    categoryFilter,
    dueFilter,
    filter,
    items,
    keyword,
    stageFilter,
    templateFilter,
  ]);

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

  const stages =
    selectedTemplate?.stages.map((stage) => ({
      stageKey: stage.key,
      title: stage.title,
      description: stage.description,
    })) ??
    visibleItems[0]?.steps ??
    items[0]?.steps ??
    [];

  // Items of different templates have different stage columns, so the grid is
  // rendered as one table per template group. Within a group every item shares
  // the same stage set, keeping header columns aligned with each row's cells.
  const gridGroups = useMemo(() => {
    const groups: Array<{
      templateKey: string;
      templateName: string;
      stages: Array<{ stageKey: string; title: string; description: string }>;
      items: WorkflowItem[];
    }> = [];
    const indexByKey = new Map<string, number>();

    for (const item of visibleItems) {
      let index = indexByKey.get(item.templateKey);

      if (index === undefined) {
        index = groups.length;
        indexByKey.set(item.templateKey, index);
        groups.push({
          templateKey: item.templateKey,
          templateName:
            templates.find((template) => template.key === item.templateKey)
              ?.name ?? "기타 업무",
          stages: item.steps.map((step) => ({
            stageKey: step.stageKey,
            title: step.title,
            description: step.description,
          })),
          items: [],
        });
      }

      groups[index].items.push(item);
    }

    return groups;
  }, [visibleItems, templates]);

  const totalSteps = items.reduce((sum, item) => sum + item.steps.length, 0);
  const completedSteps = items.reduce(
    (sum, item) => sum + completionCount(item),
    0
  );
  const overallProgress = totalSteps
    ? Math.round((completedSteps / totalSteps) * 100)
    : 0;
  const openItemCount = items.filter((item) => !isItemDone(item)).length;

  const bottlenecks = useMemo(() => {
    const counts = new Map<string, { title: string; count: number }>();

    for (const item of items) {
      const step = nextStep(item);

      if (!step) {
        continue;
      }

      const current = counts.get(step.stageKey) ?? { title: step.title, count: 0 };
      current.count += 1;
      counts.set(step.stageKey, current);
    }

    return [...counts.values()].sort((first, second) => second.count - first.count);
  }, [items]);

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
    patch: Partial<
      Pick<
        WorkflowItem,
        | "title"
        | "assignee"
        | "category"
        | "memo"
        | "allocatedBudget"
        | "requiredBudget"
        | "dueDate"
      >
    >
  ) {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  }

  function updateLocalSubtask(
    subtaskId: number,
    patch: Partial<
      Pick<WorkflowSubtask, "title" | "status" | "dueDate" | "blockers">
    >
  ) {
    setItems((current) =>
      current.map((item) => ({
        ...item,
        subtasks: item.subtasks.map((subtask) =>
          subtask.id === subtaskId ? { ...subtask, ...patch } : subtask
        ),
      }))
    );
  }

  async function updateItem(
    id: number,
    patch: Partial<
      Pick<
        WorkflowItem,
        | "title"
        | "assignee"
        | "category"
        | "memo"
        | "allocatedBudget"
        | "requiredBudget"
        | "dueDate"
      >
    >
  ) {
    const previousItems = items;
    setError("");
    setSavingItemIds((current) => new Set(current).add(id));

    try {
      const response = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: id, actor: currentActor, ...patch }),
      });
      const data = (await response.json()) as TaskResponse;

      if (!response.ok || !data.item) {
        throw new Error(data.error ?? "업무 정보를 저장하지 못했습니다.");
      }

      replaceItem(data.item);
      setAssigneeSettings((current) => data.assigneeSettings ?? current);
      setHistory(data.history ?? history);
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

  async function deleteItem(item: WorkflowItem) {
    if (!window.confirm(`'${item.title}' 업무를 삭제할까요?`)) {
      return;
    }

    const previousItems = items;
    setError("");
    setDeletingItemIds((current) => new Set(current).add(item.id));
    setItems((current) => current.filter((currentItem) => currentItem.id !== item.id));
    setExpandedIds((current) => {
      const next = new Set(current);
      next.delete(item.id);
      return next;
    });

    try {
      const response = await fetch("/api/tasks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, actor: currentActor }),
      });
      const data = (await response.json()) as TaskResponse;

      if (!response.ok || !data.items) {
        throw new Error(data.error ?? "업무를 삭제하지 못했습니다.");
      }

      setItems(data.items);
      setHistory(data.history ?? history);
      setSubtaskDrafts((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
    } catch (deleteError) {
      setItems(previousItems);
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "업무를 삭제하지 못했습니다."
      );
    } finally {
      setDeletingItemIds((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  }

  async function updateStep(
    item: WorkflowItem,
    step: WorkflowStep,
    status: StepStatus
  ) {
    const previousItems = items;
    setError("");
    setSavingStepIds((current) => new Set(current).add(step.id));
    setItems((current) =>
      current.map((currentItem) =>
        currentItem.id === item.id
          ? {
              ...currentItem,
              steps: currentItem.steps.map((currentStep) =>
                currentStep.id === step.id ? { ...currentStep, status } : currentStep
              ),
            }
          : currentItem
      )
    );

    try {
      const response = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stepId: step.id, actor: currentActor, status }),
      });
      const data = (await response.json()) as TaskResponse;

      if (!response.ok || !data.item) {
        throw new Error(data.error ?? "진도 상태를 저장하지 못했습니다.");
      }

      replaceItem(data.item);
      setHistory(data.history ?? history);
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
        next.delete(step.id);
        return next;
      });
    }
  }

  async function updateStepDueDate(step: WorkflowStep, dueDate: string) {
    setSavingStepIds((current) => new Set(current).add(step.id));
    setError("");

    try {
      const response = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stepId: step.id, actor: currentActor, dueDate }),
      });
      const data = (await response.json()) as TaskResponse;

      if (!response.ok || !data.item) {
        throw new Error(data.error ?? "목표일을 저장하지 못했습니다.");
      }

      replaceItem(data.item);
      setHistory(data.history ?? history);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "목표일을 저장하지 못했습니다."
      );
    } finally {
      setSavingStepIds((current) => {
        const next = new Set(current);
        next.delete(step.id);
        return next;
      });
    }
  }

  async function updateSubtask(
    subtaskId: number,
    patch: Partial<
      Pick<WorkflowSubtask, "title" | "status" | "dueDate" | "blockers">
    >
  ) {
    const previousItems = items;
    setError("");
    setSavingSubtaskIds((current) => new Set(current).add(subtaskId));

    try {
      const response = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subtaskId, actor: currentActor, ...patch }),
      });
      const data = (await response.json()) as TaskResponse;

      if (!response.ok || !data.item) {
        throw new Error(data.error ?? "세부 체크리스트를 저장하지 못했습니다.");
      }

      replaceItem(data.item);
      setHistory(data.history ?? history);
    } catch (saveError) {
      setItems(previousItems);
      setError(
        saveError instanceof Error
          ? saveError.message
          : "세부 체크리스트를 저장하지 못했습니다."
      );
    } finally {
      setSavingSubtaskIds((current) => {
        const next = new Set(current);
        next.delete(subtaskId);
        return next;
      });
    }
  }

  async function addSubtask(itemId: number) {
    const draft = subtaskDrafts[itemId] ?? {
      title: "",
      dueDate: "",
      blockers: "",
    };
    const title = draft.title.trim();

    if (!title) {
      return;
    }

    setError("");

    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create-subtask",
          actor: currentActor,
          itemId,
          title,
          dueDate: draft.dueDate,
          blockers: draft.blockers,
        }),
      });
      const data = (await response.json()) as TaskResponse;

      if (!response.ok || !data.item) {
        throw new Error(data.error ?? "세부 체크리스트를 추가하지 못했습니다.");
      }

      replaceItem(data.item);
      setSubtaskDrafts((current) => ({
        ...current,
        [itemId]: { title: "", dueDate: "", blockers: "" },
      }));
      setHistory(data.history ?? history);
    } catch (addError) {
      setError(
        addError instanceof Error
          ? addError.message
          : "세부 체크리스트를 추가하지 못했습니다."
      );
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
          actor: currentActor,
          category: newCategory,
          assignee: newAssignee,
          memo: newMemo,
          allocatedBudget: newAllocatedBudget,
          requiredBudget: newRequiredBudget,
          dueDate: newDueDate,
          templateKey: newTemplateKey,
        }),
      });
      const data = (await response.json()) as TaskResponse;

      if (!response.ok || !data.item) {
        throw new Error(data.error ?? "업무를 추가하지 못했습니다.");
      }

      setItems((current) => [...current, data.item!]);
      setNewTitle("");
      setNewCategory("일반 업무");
      setNewAssignee("");
      setNewMemo("");
      setNewAllocatedBudget("");
      setNewRequiredBudget("");
      setNewDueDate("");
      setSortMode("manual");
      setTemplateFilter(newTemplateKey);
      setHistory(data.history ?? history);
    } catch (addError) {
      setError(
        addError instanceof Error ? addError.message : "업무를 추가하지 못했습니다."
      );
    } finally {
      setAdding(false);
    }
  }

  async function saveAssigneeColor(assignee: string, color: string) {
    setError("");

    try {
      const response = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set-assignee-color",
          actor: currentActor,
          assignee,
          color,
        }),
      });
      const data = (await response.json()) as TaskResponse;

      if (!response.ok || !data.assigneeSettings) {
        throw new Error(data.error ?? "담당자 색상을 저장하지 못했습니다.");
      }

      setAssigneeSettings(data.assigneeSettings);
      setHistory(data.history ?? history);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "담당자 색상을 저장하지 못했습니다."
      );
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
        body: JSON.stringify({ actor: currentActor, order }),
      });
      const data = (await response.json()) as TaskResponse;

      if (!response.ok || !data.items) {
        throw new Error(data.error ?? "업무 순서를 저장하지 못했습니다.");
      }

      setItems(data.items);
      setHistory(data.history ?? history);
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

  function toggleExpanded(id: number) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function progressColor(item: WorkflowItem) {
    if (itemHasOverdueDate(item)) {
      return "#d9452f";
    }

    if (itemHasUrgentDate(item)) {
      return "#e5aa25";
    }

    return "#248f84";
  }

  return (
    <main className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--surface)]/90 shadow-[var(--shadow-xs)] backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <span className="tb-chip tb-chip-accent">{organizationName}</span>
                <span className="tb-chip">{currentActor}</span>
                {savingSettings ? (
                  <span className="text-xs font-medium text-[var(--accent)]">
                    저장 중…
                  </span>
                ) : null}
              </div>
              <input
                value={boardTitle}
                onChange={(event) => setBoardTitle(event.target.value)}
                onBlur={(event) =>
                  void saveBoardSettings({ boardTitle: event.target.value })
                }
                className="tb-ghost max-w-[560px] -ml-2 text-2xl font-bold tracking-tight sm:text-[28px]"
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
                value={filter}
                onChange={(event) => setFilter(event.target.value as TaskFilter)}
                className="tb-field w-auto"
                title="상태"
              >
                {filters.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>

              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                className="tb-field w-auto"
                title="대분류"
              >
                <option value="all">모든 대분류</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>

              <select
                value={assigneeFilter}
                onChange={(event) => setAssigneeFilter(event.target.value)}
                className="tb-field w-auto"
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

              <select
                value={sortMode}
                onChange={(event) => setSortMode(event.target.value as SortMode)}
                className="tb-field w-auto"
                title="정렬"
              >
                {sortOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    정렬: {option.label}
                  </option>
                ))}
              </select>

              <div className="tb-seg ml-auto">
                {(["grid", "gantt"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setViewMode(mode)}
                    data-active={viewMode === mode}
                    className="tb-seg-btn"
                  >
                    {mode === "grid" ? "표" : "간트"}
                  </button>
                ))}
              </div>
            </div>

            {bottlenecks.length || assigneeStats.length ? (
              <div className="flex flex-wrap items-center gap-2">
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

      <section className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6 lg:px-8">
        {error ? (
          <div className="mb-4 flex items-center gap-2 rounded-[var(--radius)] border border-[var(--danger-border)] bg-[var(--danger-soft)] px-4 py-3 text-sm font-medium text-[var(--danger)]">
            {error}
          </div>
        ) : null}

        {viewMode === "grid" ? (
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
                <div key={group.templateKey} className="tb-card overflow-hidden">
                  {gridGroups.length > 1 ? (
                    <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--surface-2)] px-4 py-2.5 text-sm font-semibold text-[var(--text)]">
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
                    <th className="px-3 py-3">대분류</th>
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
                          className="mx-auto flex min-h-[88px] items-center justify-center whitespace-nowrap text-[10px] font-medium leading-none text-[var(--text-muted)]"
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
                            onDrop={() => handleDrop(item.id)}
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
                                placeholder="대분류"
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
                                  onDragEnd={() => setDraggedId(null)}
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
                              <div className="mt-1 flex flex-wrap items-center gap-1 px-2 text-[10px] text-[var(--text-muted)] xl:text-[11px]">
                                {done ? (
                                  <span className="tb-badge tb-badge-success">완료</span>
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
                                <label className="text-[10px] font-semibold text-[var(--text-muted)]">
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
                                <label className="text-[10px] font-semibold text-[var(--text-muted)]">
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
                              <div className="mt-1.5 flex flex-wrap gap-x-2 text-[10px] text-[var(--text-faint)]">
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
                            <tr className="bg-[var(--surface-2)]">
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
                                          className="grid gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-2 md:grid-cols-[34px_minmax(180px,1.2fr)_130px_minmax(180px,1fr)_44px] md:items-center"
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
                                          <span className="text-center text-[10px] text-[var(--accent)]">
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

                                  <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-3.5">
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
                                            <div className="text-[10px] font-semibold text-[var(--text-faint)]">
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

            <div className="tb-card p-3.5">
              <div className="mb-2.5 flex items-center gap-2 text-sm font-semibold text-[var(--text-muted)]">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
                  +
                </span>
                새 업무 추가
              </div>
              <form
                onSubmit={addItem}
                className="grid gap-2 md:grid-cols-2 xl:grid-cols-[150px_130px_minmax(180px,1fr)_110px_120px_110px_110px_minmax(160px,1fr)_88px]"
              >
                <select
                  value={newTemplateKey}
                  onChange={(event) => {
                    setNewTemplateKey(event.target.value);
                    setTemplateFilter(event.target.value);
                    setStageFilter("all");
                  }}
                  className="tb-field"
                >
                  {templates.map((template) => (
                    <option key={template.key} value={template.key}>
                      {template.name}
                    </option>
                  ))}
                </select>
                <input
                  value={newCategory}
                  onChange={(event) => setNewCategory(event.target.value)}
                  className="tb-field"
                  placeholder="대분류"
                />
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
        ) : (
          <div className="tb-card p-4">
            <div className="grid gap-2.5">
              {visibleItems.map((item) => {
                const progress = itemProgress(item);
                const next = nextStep(item);
                const rowColor = rowAccentColor(
                  assigneeSettings[assigneeName(item.assignee)]
                );

                return (
                  <div
                    key={item.id}
                    className="grid items-center gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-3 md:grid-cols-[280px_1fr_56px]"
                    style={{ boxShadow: `inset 3px 0 0 ${rowColor}` }}
                  >
                    <div>
                      <div className="font-semibold">{item.title}</div>
                      <div className="mt-0.5 text-xs text-[var(--text-muted)]">
                        {assigneeName(item.assignee)} · {next?.title ?? "완료"}
                      </div>
                      <div className="mt-1 text-[11px] text-[var(--text-faint)]">
                        편성 {formatBudget(item.allocatedBudget) || "-"} · 소요{" "}
                        {formatBudget(item.requiredBudget) || "-"}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {item.steps.map((step) => (
                        <div
                          key={step.id}
                          className={`h-7 flex-1 rounded-[4px] border ${
                            step.status === "done"
                              ? "border-[var(--success)] bg-[var(--success)]"
                              : urgency(step.dueDate) === "overdue"
                                ? "border-[var(--danger-border)] bg-[var(--danger-soft)]"
                                : urgency(step.dueDate) === "warning" ||
                                    urgency(step.dueDate) === "danger"
                                  ? "border-[var(--warning-border)] bg-[var(--warning-soft)]"
                                  : "border-[var(--border)] bg-[var(--surface-3)]"
                          }`}
                          title={`${step.title} ${formatDay(step.dueDate)}`}
                        />
                      ))}
                    </div>
                    <div className="text-right text-sm font-bold text-[var(--accent)]">
                      {progress}%
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_360px]">
          <section className="tb-card p-5">
            <h2 className="text-base font-semibold">변경 이력</h2>
            <div className="mt-3 max-h-64 space-y-3 overflow-auto">
              {history.slice(0, 20).map((entry) => (
                <div
                  key={entry.id}
                  className="border-l-2 border-[var(--accent-soft-2)] pl-3 text-sm leading-5 text-[var(--text-muted)]"
                >
                  <div className="text-[11px] font-semibold text-[var(--text-faint)]">
                    {formatDate(entry.createdAt)}
                  </div>
                  {entry.summary}
                </div>
              ))}
              {!history.length ? (
                <div className="text-sm text-[var(--text-faint)]">
                  아직 변경 이력이 없습니다.
                </div>
              ) : null}
            </div>
          </section>

          <section className="tb-card p-5">
            <h2 className="text-base font-semibold">보드 설정</h2>
            <div className="mt-3 grid gap-3.5">
              <label>
                <span className="tb-label">조직명</span>
                <input
                  value={organizationName}
                  onChange={(event) => setOrganizationName(event.target.value)}
                  onBlur={(event) =>
                    void saveBoardSettings({
                      organizationName: event.target.value,
                    })
                  }
                  className="tb-field"
                />
              </label>
              <label>
                <span className="tb-label">보드명</span>
                <input
                  value={boardTitle}
                  onChange={(event) => setBoardTitle(event.target.value)}
                  onBlur={(event) =>
                    void saveBoardSettings({ boardTitle: event.target.value })
                  }
                  className="tb-field"
                />
              </label>
              <label>
                <span className="tb-label">사용자명</span>
                <input
                  value={userName}
                  onChange={(event) => setUserName(event.target.value)}
                  onBlur={(event) => saveUserName(event.target.value)}
                  className="tb-field"
                  placeholder="이름"
                />
              </label>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
