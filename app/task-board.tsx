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
  itemHasDueInRange,
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
  { key: "week", label: "이번 주" },
  { key: "month", label: "이번 달" },
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

const DASHBOARD_WIDGETS: Array<{ key: string; label: string }> = [
  { key: "kpi", label: "KPI 카드" },
  { key: "status", label: "상태 분포" },
  { key: "workload", label: "담당자 워크로드" },
  { key: "types", label: "유형별 업무" },
  { key: "deadlines", label: "다가오는 마감" },
  { key: "budget", label: "예산 요약" },
  { key: "bottlenecks", label: "병목 단계" },
  { key: "activity", label: "최근 활동" },
];

const defaultWidgetPrefs: Record<string, boolean> = Object.fromEntries(
  DASHBOARD_WIDGETS.map((widget) => [widget.key, true])
);

function isoDate(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Inclusive [start, end] ISO range for "this week" (Mon–Sun) or "this month".
function periodRange(kind: "week" | "month") {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (kind === "week") {
    const weekday = (today.getDay() + 6) % 7; // Monday = 0
    const start = new Date(today);
    start.setDate(today.getDate() - weekday);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start: isoDate(start), end: isoDate(end) };
  }

  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  return { start: isoDate(start), end: isoDate(end) };
}

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
  const [viewMode, setViewMode] = useState<ViewMode>("dashboard");
  const [showFilters, setShowFilters] = useState(false);
  const [templateEditorOpen, setTemplateEditorOpen] = useState(false);
  const [templateDraft, setTemplateDraft] = useState<{
    key: string | null;
    name: string;
    stages: Array<{ stageKey: string | null; title: string; group: string }>;
  } | null>(null);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [focusItemId, setFocusItemId] = useState<number | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [widgetMenuOpen, setWidgetMenuOpen] = useState(false);
  const [widgetPrefs, setWidgetPrefs] =
    useState<Record<string, boolean>>(defaultWidgetPrefs);
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [templateFilter, setTemplateFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");
  const [keyword, setKeyword] = useState("");
  const [newTitle, setNewTitle] = useState("");
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

  const templatesByKey = useMemo(
    () => new Map(templates.map((template) => [template.key, template])),
    [templates]
  );

  function itemTypeName(item: WorkflowItem) {
    return templatesByKey.get(item.templateKey)?.name ?? categoryName(item.category);
  }

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

      if (
        (dueFilter === "week" || dueFilter === "month") &&
        !itemHasDueInRange(
          item,
          periodRange(dueFilter).start,
          periodRange(dueFilter).end
        )
      ) {
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
          itemProgress(second) - itemProgress(first) ||
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

  const dashboard = useMemo(() => {
    let done = 0;
    let overdue = 0;
    let urgent = 0;
    let inProgress = 0;

    for (const item of items) {
      if (isItemDone(item)) {
        done += 1;
      } else if (itemHasOverdueDate(item)) {
        overdue += 1;
      } else if (itemHasUrgentDate(item)) {
        urgent += 1;
      } else {
        inProgress += 1;
      }
    }

    const total = items.length;
    const safeTotal = total || 1;

    const statusSegments = [
      { key: "done", label: "완료", value: done, color: "var(--success)" },
      { key: "inProgress", label: "진행", value: inProgress, color: "var(--accent)" },
      { key: "urgent", label: "임박", value: urgent, color: "var(--warning)" },
      { key: "overdue", label: "지연", value: overdue, color: "var(--danger)" },
    ];

    let acc = 0;
    const stops = statusSegments
      .filter((segment) => segment.value > 0)
      .map((segment) => {
        const start = (acc / safeTotal) * 100;
        acc += segment.value;
        const end = (acc / safeTotal) * 100;
        return `${segment.color} ${start}% ${end}%`;
      });
    const conic = stops.length
      ? `conic-gradient(${stops.join(", ")})`
      : "conic-gradient(var(--surface-3) 0% 100%)";

    const typeCounts = new Map<string, number>();
    for (const item of items) {
      typeCounts.set(item.templateKey, (typeCounts.get(item.templateKey) ?? 0) + 1);
    }
    const types = [...typeCounts.entries()]
      .map(([key, count]) => ({
        key,
        name: templatesByKey.get(key)?.name ?? "기타",
        count,
      }))
      .sort((first, second) => second.count - first.count);

    const deadlines: Array<{
      id: string;
      itemId: number;
      title: string;
      label: string;
      date: string;
    }> = [];
    for (const item of items) {
      if (isItemDone(item)) {
        continue;
      }
      const step = nextStep(item);
      if (step?.dueDate) {
        deadlines.push({
          id: `s${step.id}`,
          itemId: item.id,
          title: item.title,
          label: step.title,
          date: step.dueDate,
        });
      } else if (item.dueDate) {
        deadlines.push({
          id: `i${item.id}`,
          itemId: item.id,
          title: item.title,
          label: "최종 마감",
          date: item.dueDate,
        });
      }
    }
    deadlines.sort((first, second) => first.date.localeCompare(second.date));

    const allocated = items.reduce(
      (sum, item) => sum + (item.allocatedBudget ?? 0),
      0
    );
    const required = items.reduce(
      (sum, item) => sum + (item.requiredBudget ?? 0),
      0
    );

    return {
      total,
      done,
      overdue,
      urgent,
      inProgress,
      statusSegments,
      conic,
      types,
      deadlines: deadlines.slice(0, 8),
      allocated,
      required,
    };
  }, [items, templatesByKey]);

  const notifications = useMemo(() => {
    type Alert = {
      itemId: number;
      title: string;
      label: string;
      date: string;
      state: ReturnType<typeof urgency>;
    };
    const groups = new Map<string, Alert[]>();

    for (const item of items) {
      if (isItemDone(item)) {
        continue;
      }

      const who = assigneeName(item.assignee);
      const entries: Alert[] = [];
      const step = nextStep(item);

      if (step?.dueDate) {
        const state = urgency(step.dueDate);
        if (state === "overdue" || state === "danger" || state === "warning") {
          entries.push({
            itemId: item.id,
            title: item.title,
            label: step.title,
            date: step.dueDate,
            state,
          });
        }
      }

      if (item.dueDate) {
        const state = urgency(item.dueDate);
        if (state === "overdue" || state === "danger" || state === "warning") {
          entries.push({
            itemId: item.id,
            title: item.title,
            label: "최종 마감",
            date: item.dueDate,
            state,
          });
        }
      }

      if (entries.length) {
        groups.set(who, [...(groups.get(who) ?? []), ...entries]);
      }
    }

    const list = [...groups.entries()]
      .map(([assignee, entries]) => ({
        assignee,
        entries: entries.sort((first, second) =>
          first.date.localeCompare(second.date)
        ),
        overdue: entries.filter((entry) => entry.state === "overdue").length,
      }))
      .sort(
        (first, second) =>
          second.overdue - first.overdue ||
          second.entries.length - first.entries.length
      );

    return {
      list,
      total: list.reduce((sum, group) => sum + group.entries.length, 0),
    };
  }, [items]);

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

  function openTemplateEditor(template: TemplateOption | null) {
    setError("");
    setTemplateDraft(
      template
        ? {
            key: template.key,
            name: template.name,
            stages: template.stages.map((stage) => ({
              stageKey: stage.key,
              title: stage.title,
              group: stage.group,
            })),
          }
        : {
            key: null,
            name: "",
            stages: [{ stageKey: null, title: "", group: "" }],
          }
    );
    setTemplateEditorOpen(true);
  }

  async function saveTemplateDraft() {
    if (!templateDraft) {
      return;
    }

    const name = templateDraft.name.trim();
    const stages = templateDraft.stages
      .map((stage) => ({
        stageKey: stage.stageKey,
        title: stage.title.trim(),
        group: stage.group.trim(),
      }))
      .filter((stage) => stage.title);

    if (!name) {
      setError("유형 이름을 입력해 주세요.");
      return;
    }

    if (!stages.length) {
      setError("최소 한 개 이상의 단계가 필요합니다.");
      return;
    }

    setSavingTemplate(true);
    setError("");

    try {
      const response = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save-template",
          actor: currentActor,
          templateKey: templateDraft.key ?? undefined,
          name,
          stages,
        }),
      });
      const data = (await response.json()) as TaskResponse;

      if (!response.ok || !data.templates) {
        throw new Error(data.error ?? "유형을 저장하지 못했습니다.");
      }

      setTemplates(data.templates);
      if (data.items) {
        setItems(data.items);
      }
      setHistory(data.history ?? history);
      setTemplateEditorOpen(false);
      setTemplateDraft(null);
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "유형을 저장하지 못했습니다."
      );
    } finally {
      setSavingTemplate(false);
    }
  }

  async function deleteTemplateByKey(key: string, name: string) {
    if (!window.confirm(`'${name}' 유형을 삭제할까요?`)) {
      return;
    }

    setSavingTemplate(true);
    setError("");

    try {
      const response = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete-template",
          actor: currentActor,
          templateKey: key,
        }),
      });
      const data = (await response.json()) as TaskResponse;

      if (!response.ok || !data.templates) {
        throw new Error(data.error ?? "유형을 삭제하지 못했습니다.");
      }

      setTemplates(data.templates);
      if (data.items) {
        setItems(data.items);
      }
      setHistory(data.history ?? history);
      setTemplateEditorOpen(false);
      setTemplateDraft(null);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "유형을 삭제하지 못했습니다."
      );
    } finally {
      setSavingTemplate(false);
    }
  }

  async function changeItemTemplate(itemId: number, templateKey: string) {
    setError("");
    setSavingItemIds((current) => new Set(current).add(itemId));

    try {
      const response = await fetch("/api/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set-item-template",
          actor: currentActor,
          itemId,
          templateKey,
        }),
      });
      const data = (await response.json()) as TaskResponse;

      if (!response.ok || !data.item) {
        throw new Error(data.error ?? "업무 유형을 변경하지 못했습니다.");
      }

      replaceItem(data.item);
      setHistory(data.history ?? history);
    } catch (changeError) {
      setError(
        changeError instanceof Error
          ? changeError.message
          : "업무 유형을 변경하지 못했습니다."
      );
    } finally {
      setSavingItemIds((current) => {
        const next = new Set(current);
        next.delete(itemId);
        return next;
      });
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

  // Jump from a dashboard widget straight to a task: switch to the list,
  // expand it, and scroll it into view with a brief highlight.
  function openItem(id: number) {
    setViewMode("list");
    setExpandedIds((current) => new Set(current).add(id));
    setFocusItemId(id);
  }

  useEffect(() => {
    if (focusItemId === null) {
      return;
    }

    const element = document.getElementById(`item-${focusItemId}`);
    element?.scrollIntoView({ behavior: "smooth", block: "center" });
    const timer = window.setTimeout(() => setFocusItemId(null), 1800);
    return () => window.clearTimeout(timer);
  }, [focusItemId, viewMode]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("team-progress-widgets");
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, boolean>;
        // Sync persisted UI prefs once on mount (SSR-safe; defaults render first).
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setWidgetPrefs((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      // ignore malformed preferences
    }
  }, []);

  function toggleWidget(key: string) {
    setWidgetPrefs((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      window.localStorage.setItem(
        "team-progress-widgets",
        JSON.stringify(next)
      );
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
                  const n =
                    [templateFilter, categoryFilter, stageFilter].filter(
                      (value) => value !== "all"
                    ).length + (dueFilter !== "all" ? 1 : 0);
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
                  <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--danger)] px-1 text-[10px] font-bold text-white">
                    {notifications.total}
                  </span>
                ) : null}
              </button>

              <button
                type="button"
                onClick={() => openTemplateEditor(null)}
                className="tb-btn"
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
                {(["dashboard", "list", "grid", "gantt"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setViewMode(mode)}
                    data-active={viewMode === mode}
                    className="tb-seg-btn"
                  >
                    {mode === "dashboard"
                      ? "대시보드"
                      : mode === "list"
                        ? "목록"
                        : mode === "grid"
                          ? "표"
                          : "간트"}
                  </button>
                ))}
              </div>
            </div>

            {showFilters ? (
              <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-2)] p-2.5">
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

        {viewMode === "dashboard" ? (
          <div className="space-y-4">
            {loading ? (
              <div className="tb-card px-4 py-16 text-center text-sm text-[var(--text-muted)]">
                불러오는 중…
              </div>
            ) : null}

            <div className="flex items-center justify-end">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setWidgetMenuOpen((value) => !value)}
                  data-active={widgetMenuOpen}
                  className="tb-btn"
                  title="대시보드 위젯 표시 설정"
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
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
                  </svg>
                  위젯
                </button>
                {widgetMenuOpen ? (
                  <div className="tb-card absolute right-0 z-20 mt-1.5 w-52 p-2 shadow-[var(--shadow-md)]">
                    {DASHBOARD_WIDGETS.map((widget) => (
                      <label
                        key={widget.key}
                        className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-sm hover:bg-[var(--surface-3)]"
                      >
                        <input
                          type="checkbox"
                          checked={widgetPrefs[widget.key] !== false}
                          onChange={() => toggleWidget(widget.key)}
                          className="h-4 w-4 accent-[var(--accent)]"
                        />
                        {widget.label}
                      </label>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            {widgetPrefs.kpi !== false ? (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <div className="tb-card p-4">
                <div className="tb-stat-label">전체 진행률</div>
                <div className="tb-stat-value text-[var(--accent)]">
                  {overallProgress}%
                </div>
                <div className="tb-progress mt-2">
                  <span
                    style={{
                      width: `${overallProgress}%`,
                      background: "var(--accent)",
                    }}
                  />
                </div>
              </div>
              <div className="tb-card p-4">
                <div className="tb-stat-label">전체 업무</div>
                <div className="tb-stat-value">{dashboard.total}</div>
              </div>
              <div className="tb-card p-4">
                <div className="tb-stat-label">진행 중</div>
                <div className="tb-stat-value">
                  {dashboard.inProgress + dashboard.urgent}
                </div>
              </div>
              <div className="tb-card p-4">
                <div className="tb-stat-label">완료</div>
                <div className="tb-stat-value text-[var(--success)]">
                  {dashboard.done}
                </div>
              </div>
              <div className="tb-card p-4">
                <div className="tb-stat-label">지연</div>
                <div className="tb-stat-value text-[var(--danger)]">
                  {dashboard.overdue}
                </div>
              </div>
            </div>
            ) : null}

            <div className="grid gap-4 lg:grid-cols-3">
              {widgetPrefs.status !== false ? (
              <div className="tb-card p-5">
                <h2 className="text-sm font-semibold">상태 분포</h2>
                <div className="mt-4 flex items-center gap-5">
                  <div
                    className="relative h-32 w-32 shrink-0 rounded-full"
                    style={{ background: dashboard.conic }}
                  >
                    <div className="absolute inset-[14px] flex flex-col items-center justify-center rounded-full bg-[var(--surface)]">
                      <div className="text-2xl font-bold">{dashboard.total}</div>
                      <div className="text-[11px] text-[var(--text-faint)]">
                        전체
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 space-y-1.5">
                    {dashboard.statusSegments.map((segment) => (
                      <div
                        key={segment.key}
                        className="flex items-center gap-2 text-sm"
                      >
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ background: segment.color }}
                        />
                        <span className="flex-1 text-[var(--text-muted)]">
                          {segment.label}
                        </span>
                        <span className="font-semibold">{segment.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              ) : null}

              {widgetPrefs.workload !== false ? (
              <div className="tb-card p-5">
                <h2 className="text-sm font-semibold">담당자 워크로드</h2>
                <div className="mt-3 space-y-2.5">
                  {assigneeStats.length ? (
                    assigneeStats.slice(0, 6).map((stat) => {
                      const maxCount = Math.max(
                        ...assigneeStats.map((value) => value.count),
                        1
                      );
                      return (
                        <button
                          key={stat.assignee}
                          type="button"
                          onClick={() => {
                            setAssigneeFilter(stat.assignee);
                            setViewMode("list");
                          }}
                          className="block w-full text-left"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span className="flex items-center gap-1.5">
                              <span
                                className="h-2.5 w-2.5 rounded-full"
                                style={{
                                  backgroundColor: rowAccentColor(
                                    assigneeSettings[stat.assignee]
                                  ),
                                }}
                              />
                              {stat.assignee}
                            </span>
                            <span className="text-[var(--text-faint)]">
                              {stat.count}건 · {stat.progress}%
                            </span>
                          </div>
                          <div className="tb-progress mt-1">
                            <span
                              style={{
                                width: `${(stat.count / maxCount) * 100}%`,
                                background: "var(--accent)",
                              }}
                            />
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    <div className="text-sm text-[var(--text-faint)]">
                      담당자가 없습니다.
                    </div>
                  )}
                </div>
              </div>

              ) : null}

              {widgetPrefs.types !== false ? (
              <div className="tb-card p-5">
                <h2 className="text-sm font-semibold">유형별 업무</h2>
                <div className="mt-3 space-y-2.5">
                  {dashboard.types.length ? (
                    dashboard.types.map((type) => {
                      const maxCount = Math.max(
                        ...dashboard.types.map((value) => value.count),
                        1
                      );
                      return (
                        <button
                          key={type.key}
                          type="button"
                          onClick={() => {
                            setTemplateFilter(type.key);
                            setStageFilter("all");
                            setViewMode("list");
                          }}
                          className="block w-full text-left"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <span className="truncate pr-2">{type.name}</span>
                            <span className="text-[var(--text-faint)]">
                              {type.count}
                            </span>
                          </div>
                          <div className="tb-progress mt-1">
                            <span
                              style={{
                                width: `${(type.count / maxCount) * 100}%`,
                                background: "var(--accent)",
                              }}
                            />
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    <div className="text-sm text-[var(--text-faint)]">
                      업무가 없습니다.
                    </div>
                  )}
                </div>
              </div>
              ) : null}
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
              {widgetPrefs.deadlines !== false ? (
              <div className="tb-card p-5">
                <h2 className="text-sm font-semibold">다가오는 마감</h2>
                <div className="mt-3 space-y-1.5">
                  {dashboard.deadlines.length ? (
                    dashboard.deadlines.map((deadline) => {
                      const state = urgency(deadline.date);
                      return (
                        <button
                          key={deadline.id}
                          type="button"
                          onClick={() => openItem(deadline.itemId)}
                          className="flex w-full items-center gap-2.5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-left transition hover:border-[var(--accent)] hover:bg-[var(--surface-3)]"
                        >
                          <span
                            className={`tb-badge ${
                              state === "overdue" || state === "danger"
                                ? "tb-badge-danger"
                                : state === "warning"
                                  ? "tb-badge-warning"
                                  : "tb-badge-muted"
                            }`}
                          >
                            {shortDueLabel(deadline.date)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">
                              {deadline.title}
                            </div>
                            <div className="text-[11px] text-[var(--text-faint)]">
                              {deadline.label} · {formatDay(deadline.date)}
                            </div>
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    <div className="text-sm text-[var(--text-faint)]">
                      예정된 마감이 없습니다.
                    </div>
                  )}
                </div>
              </div>
              ) : null}

              <div className="space-y-4">
                {widgetPrefs.budget !== false ? (
                <div className="tb-card p-5">
                  <h2 className="text-sm font-semibold">예산 요약</h2>
                  <div className="mt-3 space-y-3">
                    <div>
                      <div className="flex justify-between text-xs">
                        <span className="text-[var(--text-muted)]">편성 예산</span>
                        <span className="font-semibold">
                          {formatBudget(dashboard.allocated) || 0}
                        </span>
                      </div>
                      <div className="tb-progress mt-1">
                        <span
                          style={{
                            width: `${
                              (dashboard.allocated /
                                Math.max(
                                  dashboard.allocated,
                                  dashboard.required,
                                  1
                                )) *
                              100
                            }%`,
                            background: "var(--accent)",
                          }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs">
                        <span className="text-[var(--text-muted)]">소요 예산</span>
                        <span className="font-semibold">
                          {formatBudget(dashboard.required) || 0}
                        </span>
                      </div>
                      <div className="tb-progress mt-1">
                        <span
                          style={{
                            width: `${
                              (dashboard.required /
                                Math.max(
                                  dashboard.allocated,
                                  dashboard.required,
                                  1
                                )) *
                              100
                            }%`,
                            background: "var(--warning)",
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                ) : null}

                {widgetPrefs.bottlenecks !== false ? (
                <div className="tb-card p-5">
                  <h2 className="text-sm font-semibold">병목 단계</h2>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {bottlenecks.length ? (
                      bottlenecks.slice(0, 6).map((bottleneck) => (
                        <button
                          key={bottleneck.title}
                          type="button"
                          onClick={() => {
                            const stage = stages.find(
                              (value) => value.title === bottleneck.title
                            );
                            setStageFilter(stage?.stageKey ?? "all");
                            setViewMode("list");
                          }}
                          className="tb-chip tb-chip-btn"
                        >
                          {bottleneck.title}
                          <span className="tb-badge tb-badge-muted">
                            {bottleneck.count}
                          </span>
                        </button>
                      ))
                    ) : (
                      <div className="text-sm text-[var(--text-faint)]">
                        병목이 없습니다.
                      </div>
                    )}
                  </div>
                </div>
                ) : null}
              </div>
            </div>

            {widgetPrefs.activity !== false ? (
            <div className="tb-card p-5">
              <h2 className="text-sm font-semibold">최근 활동</h2>
              <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                {history.slice(0, 10).map((entry) => (
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
                    활동 기록이 없습니다.
                  </div>
                ) : null}
              </div>
            </div>
            ) : null}
          </div>
        ) : viewMode === "list" ? (
          <div className="space-y-2.5">
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
              visibleItems.map((item) => {
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

                return (
                  <div
                    key={item.id}
                    id={`item-${item.id}`}
                    onDragOver={handleDragOver}
                    onDrop={() => handleDrop(item.id)}
                    className={`tb-card overflow-hidden transition-shadow ${
                      draggedId === item.id || focusItemId === item.id
                        ? "ring-2 ring-[var(--accent-ring)]"
                        : ""
                    }`}
                  >
                    <div
                      className="flex items-center gap-3 p-3"
                      style={{ boxShadow: `inset 3px 0 0 ${rowColor}` }}
                    >
                      <button
                        type="button"
                        draggable
                        onDragStart={(event) => {
                          setDraggedId(item.id);
                          event.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={() => setDraggedId(null)}
                        className="tb-iconbtn h-8 w-6 shrink-0 cursor-grab active:cursor-grabbing"
                        title="드래그로 순서 변경"
                      >
                        ⋮⋮
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleExpanded(item.id)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-semibold">
                            {item.title || "제목 없음"}
                          </span>
                          <span className="tb-chip tb-chip-accent">
                            {itemTypeName(item)}
                          </span>
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--text-muted)]">
                          <span className="inline-flex items-center gap-1.5">
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: rowColor }}
                            />
                            {assigneeName(item.assignee)}
                          </span>
                          {done ? (
                            <span className="tb-badge tb-badge-success">완료</span>
                          ) : (
                            <span className="tb-badge tb-badge-muted">
                              {completed}/{item.steps.length} · {next?.title ?? "—"}
                            </span>
                          )}
                          {item.dueDate ? (
                            <span
                              className={`tb-badge ${
                                itemDue === "overdue" || itemDue === "danger"
                                  ? "tb-badge-danger"
                                  : itemDue === "warning"
                                    ? "tb-badge-warning"
                                    : "tb-badge-muted"
                              }`}
                            >
                              마감 {formatDay(item.dueDate)} · {shortDueLabel(item.dueDate)}
                            </span>
                          ) : null}
                          {subProgress !== null ? (
                            <span>세부 {subProgress}%</span>
                          ) : null}
                          {savingItemIds.has(item.id) ? (
                            <span className="text-[var(--accent)]">저장 중…</span>
                          ) : null}
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

                      <div className="flex shrink-0 items-center gap-1">
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
                      <div className="border-t border-[var(--border)] bg-[var(--surface-2)] p-4">
                        <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
                          <div className="space-y-4">
                            <div>
                              <div className="mb-2 flex items-center justify-between">
                                <span className="text-sm font-semibold">진행 단계</span>
                                <span className="text-xs text-[var(--text-faint)]">
                                  {completed}/{item.steps.length} 완료
                                </span>
                              </div>
                              <div className="grid gap-1.5">
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

                                  return (
                                    <div
                                      key={step.id}
                                      className="flex items-center gap-2.5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2"
                                    >
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
                                      <div className="min-w-0 flex-1">
                                        <div
                                          className={`truncate text-sm ${
                                            checked
                                              ? "text-[var(--text-faint)] line-through"
                                              : "font-medium"
                                          }`}
                                        >
                                          {step.title}
                                        </div>
                                        {step.phaseGroup ? (
                                          <div className="text-[10px] text-[var(--text-faint)]">
                                            {step.phaseGroup}
                                          </div>
                                        ) : null}
                                      </div>
                                      {step.dueDate && !checked ? (
                                        <span
                                          className={`tb-badge ${
                                            state === "overdue" || state === "danger"
                                              ? "tb-badge-danger"
                                              : state === "warning"
                                                ? "tb-badge-warning"
                                                : "tb-badge-muted"
                                          }`}
                                        >
                                          {shortDueLabel(step.dueDate)}
                                        </span>
                                      ) : null}
                                      <label
                                        className="tb-stage-due relative !w-auto px-2"
                                        title="목표일 설정"
                                      >
                                        {step.dueDate ? formatDay(step.dueDate) : "+ 기한"}
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
                                  );
                                })}
                              </div>
                            </div>

                            <div>
                              <div className="mb-2 text-sm font-semibold">
                                세부 체크리스트
                              </div>
                              <div className="space-y-1.5">
                                {item.subtasks.map((subtask) => (
                                  <div
                                    key={subtask.id}
                                    className="flex items-center gap-2.5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2"
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
                            <div className="space-y-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-3.5">
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
                              <div className="text-[10px] text-[var(--text-faint)]">
                                수정 {formatDate(item.updatedAt)}
                              </div>
                            </div>

                            <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-3.5">
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
                                      <div className="text-[10px] font-semibold text-[var(--text-faint)]">
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

            <div className="tb-card p-3.5">
              <div className="mb-2.5 flex items-center gap-2 text-sm font-semibold text-[var(--text-muted)]">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
                  +
                </span>
                새 업무 추가
              </div>
              <form
                onSubmit={addItem}
                className="grid gap-2 md:grid-cols-2 xl:grid-cols-[180px_minmax(180px,1fr)_120px_130px_96px]"
              >
                <select
                  value={newTemplateKey}
                  onChange={(event) => {
                    setNewTemplateKey(event.target.value);
                    setStageFilter("all");
                  }}
                  className="tb-field"
                  title="유형 (단계 세트)"
                >
                  {templates.map((template) => (
                    <option key={template.key} value={template.key}>
                      {template.name}
                    </option>
                  ))}
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
        ) : viewMode === "grid" ? (
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
                className="grid gap-2 md:grid-cols-2 xl:grid-cols-[180px_minmax(180px,1fr)_110px_120px_110px_110px_minmax(160px,1fr)_88px]"
              >
                <select
                  value={newTemplateKey}
                  onChange={(event) => {
                    setNewTemplateKey(event.target.value);
                    setTemplateFilter(event.target.value);
                    setStageFilter("all");
                  }}
                  className="tb-field"
                  title="유형 (단계 세트)"
                >
                  {templates.map((template) => (
                    <option key={template.key} value={template.key}>
                      {template.name}
                    </option>
                  ))}
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

      {templateEditorOpen && templateDraft ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/40 p-4 backdrop-blur-sm"
          onClick={() => {
            setTemplateEditorOpen(false);
            setTemplateDraft(null);
          }}
        >
          <div
            className="tb-card my-6 w-full max-w-[760px] shadow-[var(--shadow-lg)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3.5">
              <h2 className="text-base font-semibold">유형·단계 관리</h2>
              <button
                type="button"
                onClick={() => {
                  setTemplateEditorOpen(false);
                  setTemplateDraft(null);
                }}
                className="tb-iconbtn h-8 w-8"
              >
                ×
              </button>
            </div>

            <div className="grid gap-4 p-5 md:grid-cols-[200px_1fr]">
              <div className="space-y-1.5">
                <div className="tb-label">유형 목록</div>
                {templates.map((template) => (
                  <button
                    key={template.key}
                    type="button"
                    onClick={() => openTemplateEditor(template)}
                    data-active={templateDraft.key === template.key}
                    className={`flex w-full items-center justify-between rounded-[var(--radius)] border px-3 py-2 text-left text-sm transition ${
                      templateDraft.key === template.key
                        ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                        : "border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-3)]"
                    }`}
                  >
                    <span className="truncate">{template.name}</span>
                    <span className="text-[var(--text-faint)]">
                      {template.stages.length}
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => openTemplateEditor(null)}
                  className="tb-btn w-full"
                >
                  + 새 유형
                </button>
              </div>

              <div className="space-y-3">
                <label className="block">
                  <span className="tb-label">유형 이름</span>
                  <input
                    value={templateDraft.name}
                    onChange={(event) =>
                      setTemplateDraft((draft) =>
                        draft ? { ...draft, name: event.target.value } : draft
                      )
                    }
                    className="tb-field"
                    placeholder="예: 외부 용역, 현장 조사"
                  />
                </label>

                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="tb-label !mb-0">진행 단계</span>
                    <span className="text-xs text-[var(--text-faint)]">
                      {templateDraft.stages.length}단계
                    </span>
                  </div>
                  <div className="max-h-[46vh] space-y-1.5 overflow-auto pr-1">
                    {templateDraft.stages.map((stage, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-1.5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-2)] p-1.5"
                      >
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[10px] font-bold text-[var(--accent)]">
                          {index + 1}
                        </span>
                        <input
                          value={stage.title}
                          onChange={(event) =>
                            setTemplateDraft((draft) =>
                              draft
                                ? {
                                    ...draft,
                                    stages: draft.stages.map((current, i) =>
                                      i === index
                                        ? { ...current, title: event.target.value }
                                        : current
                                    ),
                                  }
                                : draft
                            )
                          }
                          className="tb-field flex-1"
                          placeholder="단계 이름"
                        />
                        <input
                          value={stage.group}
                          onChange={(event) =>
                            setTemplateDraft((draft) =>
                              draft
                                ? {
                                    ...draft,
                                    stages: draft.stages.map((current, i) =>
                                      i === index
                                        ? { ...current, group: event.target.value }
                                        : current
                                    ),
                                  }
                                : draft
                            )
                          }
                          className="tb-field hidden w-28 sm:block"
                          placeholder="그룹(선택)"
                        />
                        <div className="flex shrink-0 flex-col">
                          <button
                            type="button"
                            disabled={index === 0}
                            onClick={() =>
                              setTemplateDraft((draft) => {
                                if (!draft || index === 0) return draft;
                                const stages = [...draft.stages];
                                [stages[index - 1], stages[index]] = [
                                  stages[index],
                                  stages[index - 1],
                                ];
                                return { ...draft, stages };
                              })
                            }
                            className="tb-iconbtn h-4 w-6 disabled:opacity-30"
                            title="위로"
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            disabled={index === templateDraft.stages.length - 1}
                            onClick={() =>
                              setTemplateDraft((draft) => {
                                if (!draft || index === draft.stages.length - 1)
                                  return draft;
                                const stages = [...draft.stages];
                                [stages[index], stages[index + 1]] = [
                                  stages[index + 1],
                                  stages[index],
                                ];
                                return { ...draft, stages };
                              })
                            }
                            className="tb-iconbtn h-4 w-6 disabled:opacity-30"
                            title="아래로"
                          >
                            ▼
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setTemplateDraft((draft) =>
                              draft
                                ? {
                                    ...draft,
                                    stages: draft.stages.filter(
                                      (_, i) => i !== index
                                    ),
                                  }
                                : draft
                            )
                          }
                          className="tb-iconbtn tb-iconbtn-danger h-7 w-7 shrink-0"
                          title="단계 삭제"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setTemplateDraft((draft) =>
                        draft
                          ? {
                              ...draft,
                              stages: [
                                ...draft.stages,
                                { stageKey: null, title: "", group: "" },
                              ],
                            }
                          : draft
                      )
                    }
                    className="tb-btn mt-1.5 w-full"
                  >
                    + 단계 추가
                  </button>
                </div>

                <div className="flex items-center gap-2 border-t border-[var(--border)] pt-3">
                  <button
                    type="button"
                    disabled={savingTemplate}
                    onClick={() => void saveTemplateDraft()}
                    className="tb-btn tb-btn-primary"
                  >
                    {savingTemplate ? "저장 중…" : "저장"}
                  </button>
                  {templateDraft.key ? (
                    <button
                      type="button"
                      disabled={savingTemplate}
                      onClick={() =>
                        void deleteTemplateByKey(
                          templateDraft.key as string,
                          templateDraft.name
                        )
                      }
                      className="tb-btn tb-iconbtn-danger"
                    >
                      유형 삭제
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      setTemplateEditorOpen(false);
                      setTemplateDraft(null);
                    }}
                    className="tb-btn ml-auto"
                  >
                    닫기
                  </button>
                </div>
                <p className="text-xs text-[var(--text-faint)]">
                  단계를 수정하면 이 유형을 쓰는 기존 업무에도 반영됩니다. (완료
                  상태·기한은 유지)
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {notifOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/40 p-4 backdrop-blur-sm"
          onClick={() => setNotifOpen(false)}
        >
          <div
            className="tb-card my-6 w-full max-w-[520px] shadow-[var(--shadow-lg)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3.5">
              <h2 className="flex items-center gap-2 text-base font-semibold">
                마감 알림
                {notifications.total ? (
                  <span className="tb-badge tb-badge-danger">
                    {notifications.total}
                  </span>
                ) : null}
              </h2>
              <button
                type="button"
                onClick={() => setNotifOpen(false)}
                className="tb-iconbtn h-8 w-8"
              >
                ×
              </button>
            </div>

            <div className="max-h-[70vh] space-y-4 overflow-auto p-5">
              {notifications.list.length ? (
                notifications.list.map((group) => (
                  <div key={group.assignee}>
                    <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{
                          backgroundColor: rowAccentColor(
                            assigneeSettings[group.assignee]
                          ),
                        }}
                      />
                      {group.assignee}
                      <span className="ml-auto text-xs font-normal text-[var(--text-faint)]">
                        {group.overdue ? `지연 ${group.overdue} · ` : ""}
                        총 {group.entries.length}건
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {group.entries.map((entry, index) => (
                        <button
                          key={`${entry.itemId}-${index}`}
                          type="button"
                          onClick={() => {
                            openItem(entry.itemId);
                            setNotifOpen(false);
                          }}
                          className="flex w-full items-center gap-2.5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-left transition hover:border-[var(--accent)] hover:bg-[var(--surface-3)]"
                        >
                          <span
                            className={`tb-badge ${
                              entry.state === "overdue" || entry.state === "danger"
                                ? "tb-badge-danger"
                                : "tb-badge-warning"
                            }`}
                          >
                            {shortDueLabel(entry.date)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">
                              {entry.title}
                            </div>
                            <div className="text-[11px] text-[var(--text-faint)]">
                              {entry.label} · {formatDay(entry.date)}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-10 text-center text-sm text-[var(--text-muted)]">
                  마감 임박·지연 항목이 없습니다. 👍
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
