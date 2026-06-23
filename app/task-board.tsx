"use client";

import {
  DragEvent,
  FormEvent,
  Fragment,
  useEffect,
  useMemo,
  useState,
} from "react";

type StepStatus = "todo" | "done";
type TaskFilter = "all" | "open" | "done";
type SortMode = "manual" | "assignee" | "progress" | "updated";
type ViewMode = "grid" | "gantt";
type DueFilter = "all" | "urgent" | "overdue";

type WorkflowSubtask = {
  id: number;
  itemId: number;
  title: string;
  status: StepStatus;
  dueDate: string | null;
  blockers: string;
  position: number;
  updatedBy: string;
  updatedAt: string;
  createdAt: string;
};

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
  dueDate: string | null;
  completedAt: string | null;
  updatedBy: string;
  updatedAt: string;
  createdAt: string;
};

type WorkflowItem = {
  id: number;
  title: string;
  assignee: string;
  category: string;
  memo: string;
  dueDate: string | null;
  templateKey: string;
  position: number;
  updatedBy: string;
  updatedAt: string;
  createdAt: string;
  steps: WorkflowStep[];
  subtasks: WorkflowSubtask[];
};

type TemplateOption = {
  key: string;
  name: string;
  description: string;
};

type HistoryEntry = {
  id: number;
  itemId: number | null;
  entityType: string;
  entityId: number | null;
  action: string;
  summary: string;
  actor: string;
  createdAt: string;
};

type AppSettings = {
  organizationName: string;
  boardTitle: string;
};

type TaskResponse = {
  item?: WorkflowItem | null;
  items?: WorkflowItem[];
  templates?: TemplateOption[];
  assigneeSettings?: Record<string, string>;
  history?: HistoryEntry[];
  settings?: AppSettings;
  viewer?: string;
  error?: string;
};

type SubtaskDraft = {
  title: string;
  dueDate: string;
  blockers: string;
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

const dueFilters: Array<{ key: DueFilter; label: string }> = [
  { key: "all", label: "전체 일정" },
  { key: "urgent", label: "D-3 이내" },
  { key: "overdue", label: "지연" },
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

const defaultTemplates: TemplateOption[] = [
  {
    key: "general-service",
    name: "일반 용역",
    description: "일반 행정/용역 프로세스",
  },
];

const defaultSettings: AppSettings = {
  organizationName: "습지복원팀",
  boardTitle: "Workflow Command Center",
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

function formatDay(value?: string | null) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(`${value}T00:00:00`));
}

function daysUntil(value?: string | null) {
  if (!value) {
    return null;
  }

  const target = new Date(`${value}T00:00:00`).getTime();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target - today.getTime()) / 86_400_000);
}

function urgency(value?: string | null) {
  const days = daysUntil(value);

  if (days === null) {
    return "none";
  }

  if (days < 0) {
    return "overdue";
  }

  if (days <= 1) {
    return "danger";
  }

  if (days <= 3) {
    return "warning";
  }

  return "normal";
}

function urgencyLabel(value?: string | null) {
  const days = daysUntil(value);

  if (days === null) {
    return "";
  }

  if (days < 0) {
    return `D+${Math.abs(days)}`;
  }

  return `D-${days}`;
}

function shortDueLabel(value?: string | null) {
  const label = urgencyLabel(value);
  return label || "일정";
}

function assigneeName(value: string) {
  return value.trim() || "미지정";
}

function categoryName(value: string) {
  return value.trim() || "일반 업무";
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

function subtaskProgress(item: WorkflowItem) {
  if (!item.subtasks.length) {
    return null;
  }

  return Math.round(
    (item.subtasks.filter((subtask) => subtask.status === "done").length /
      item.subtasks.length) *
      100
  );
}

function isItemDone(item: WorkflowItem) {
  return item.steps.length > 0 && completionCount(item) === item.steps.length;
}

function nextStep(item: WorkflowItem) {
  return item.steps.find((step) => step.status !== "done") ?? null;
}

function nextStepTitle(item: WorkflowItem) {
  return nextStep(item)?.title ?? "완료";
}

function canToggleStep(item: WorkflowItem, index: number) {
  const step = item.steps[index];

  if (!step) {
    return false;
  }

  if (step.status === "done") {
    return true;
  }

  return index === 0 || item.steps[index - 1]?.status === "done";
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

function itemHasUrgentDate(item: WorkflowItem) {
  const dueDates = [
    item.dueDate,
    ...item.steps
      .filter((step) => step.status !== "done")
      .map((step) => step.dueDate),
  ];

  return dueDates.some((date) => {
    const state = urgency(date);
    return state === "warning" || state === "danger";
  });
}

function itemHasOverdueDate(item: WorkflowItem) {
  const dueDates = [
    item.dueDate,
    ...item.steps
      .filter((step) => step.status !== "done")
      .map((step) => step.dueDate),
  ];

  return dueDates.some((date) => urgency(date) === "overdue");
}

function rowAccentColor(color?: string) {
  return color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#ffffff";
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
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");
  const [keyword, setKeyword] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState("일반 업무");
  const [newAssignee, setNewAssignee] = useState("");
  const [newMemo, setNewMemo] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [newTemplateKey, setNewTemplateKey] = useState("general-service");
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

  const stages = items[0]?.steps ?? [];

  const baseItems = useMemo(() => {
    const query = keyword.trim().toLocaleLowerCase("ko-KR");

    return [...items].filter((item) => {
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

  const visibleGroups = useMemo(() => {
    const groups = new Map<string, WorkflowItem[]>();

    for (const item of visibleItems) {
      const name = categoryName(item.category);
      const group = groups.get(name) ?? [];
      group.push(item);
      groups.set(name, group);
    }

    return [...groups.entries()].map(([category, groupItems]) => ({
      category,
      items: groupItems,
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
      Pick<WorkflowItem, "title" | "assignee" | "category" | "memo" | "dueDate">
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
      Pick<WorkflowItem, "title" | "assignee" | "category" | "memo" | "dueDate">
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
      setNewDueDate("");
      setSortMode("manual");
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
    <main className="min-h-dvh bg-[#f4f6f3] text-[#1d2320]">
      <header className="border-b border-[#d9e1dc] bg-white">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex flex-wrap items-end gap-2 text-sm font-semibold text-[#4f6f68]">
                <span className="border border-[#cbd8d2] bg-[#e6f4ef] px-2.5 py-1 text-sm text-[#1f4f49]">
                  {organizationName}
                </span>
                <span className="border border-[#dce5e0] bg-white px-2.5 py-1 text-sm text-[#53625c]">
                  {currentActor}
                </span>
                {savingSettings ? (
                  <span className="pb-1 text-xs text-[#1f6f67]">저장 중</span>
                ) : null}
              </div>
              <input
                value={boardTitle}
                onChange={(event) => setBoardTitle(event.target.value)}
                onBlur={(event) =>
                  void saveBoardSettings({ boardTitle: event.target.value })
                }
                className="mt-2 min-h-11 w-full max-w-[560px] border border-transparent bg-transparent px-0 text-2xl font-semibold text-[#1d2320] hover:border-[#cbd8d2] focus:border-[#77b8ae] focus:bg-white focus:px-2 sm:text-3xl"
              />
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

          <div className="grid gap-3 xl:grid-cols-[1fr_360px]">
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[120px_140px_145px_145px_120px_120px_120px_1fr]">
              <label className="text-sm font-medium text-[#4b5d56]">
                상태
                <select
                  value={filter}
                  onChange={(event) => setFilter(event.target.value as TaskFilter)}
                  className="mt-1 min-h-10 w-full border border-[#cbd8d2] bg-white px-3 text-sm text-[#1d2320]"
                >
                  {filters.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm font-medium text-[#4b5d56]">
                대분류
                <select
                  value={categoryFilter}
                  onChange={(event) => setCategoryFilter(event.target.value)}
                  className="mt-1 min-h-10 w-full border border-[#cbd8d2] bg-white px-3 text-sm text-[#1d2320]"
                >
                  <option value="all">전체</option>
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>

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
                단계
                <select
                  value={stageFilter}
                  onChange={(event) => setStageFilter(event.target.value)}
                  className="mt-1 min-h-10 w-full border border-[#cbd8d2] bg-white px-3 text-sm text-[#1d2320]"
                >
                  <option value="all">전체 단계</option>
                  {stages.map((stage) => (
                    <option key={stage.stageKey} value={stage.stageKey}>
                      {stage.title}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm font-medium text-[#4b5d56]">
                일정
                <select
                  value={dueFilter}
                  onChange={(event) => setDueFilter(event.target.value as DueFilter)}
                  className="mt-1 min-h-10 w-full border border-[#cbd8d2] bg-white px-3 text-sm text-[#1d2320]"
                >
                  {dueFilters.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
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

              <div className="text-sm font-medium text-[#4b5d56]">
                보기
                <div className="mt-1 grid grid-cols-2 overflow-hidden border border-[#cbd8d2] bg-[#f3f6f4] p-1">
                  {(["grid", "gantt"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setViewMode(mode)}
                      className={`min-h-8 text-sm font-semibold ${
                        viewMode === mode ? "bg-white text-[#1f6f67]" : "text-[#5f6f68]"
                      }`}
                    >
                      {mode === "grid" ? "표" : "간트"}
                    </button>
                  ))}
                </div>
              </div>

              <label className="text-sm font-medium text-[#4b5d56]">
                검색
                <input
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  className="mt-1 min-h-10 w-full border border-[#cbd8d2] bg-white px-3 text-sm text-[#1d2320]"
                  placeholder="업무명, 메모, 세부 체크리스트"
                />
              </label>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-semibold text-[#4f6f68]">
                병목 구간 {savingOrder ? "· 순서 저장 중" : ""}
              </div>
              <div className="flex flex-wrap gap-2">
                {bottlenecks.slice(0, 3).map((bottleneck) => (
                  <button
                    key={bottleneck.title}
                    type="button"
                    onClick={() => {
                      const stage = stages.find((item) => item.title === bottleneck.title);
                      setStageFilter(stage?.stageKey ?? "all");
                    }}
                    className="min-h-8 border border-[#d4ded8] bg-white px-3 text-sm"
                  >
                    {bottleneck.title} {bottleneck.count}건
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {assigneeStats.slice(0, 4).map((stat) => (
                  <button
                    key={stat.assignee}
                    type="button"
                    onClick={() => setAssigneeFilter(stat.assignee)}
                    className="min-h-8 border border-[#d4ded8] bg-white px-3 text-xs"
                    style={{
                      backgroundColor: rowAccentColor(assigneeSettings[stat.assignee]),
                    }}
                  >
                    {stat.assignee} {stat.count}건 · {stat.progress}%
                  </button>
                ))}
              </div>
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

        {viewMode === "grid" ? (
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
                      메모/일정
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
                    visibleGroups.map((group) => (
                      <Fragment key={group.category}>
                        <tr className="border-y border-[#c7d8d0] bg-[#eef6f3]">
                          <td colSpan={stages.length + 5} className="px-3 py-2">
                            <div className="flex items-center gap-2 text-sm font-semibold text-[#245f57]">
                              <span>{group.category}</span>
                              <span className="text-xs font-medium text-[#66746e]">
                                {group.items.length}건
                              </span>
                            </div>
                          </td>
                        </tr>
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
                            className={`group border-b border-[#e4ebe7] ${
                              draggedId === item.id ? "bg-[#edf7f4]" : ""
                            } hover:bg-[#f8fbf9]`}
                            style={{ backgroundColor: draggedId === item.id ? undefined : rowColor }}
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
                                className="mb-1 flex h-7 w-full cursor-grab items-center justify-center border border-[#d2ddd7] bg-white text-[#72817a] active:cursor-grabbing"
                                title="드래그"
                              >
                                ⋮
                              </button>
                              <button
                                type="button"
                                onClick={() => toggleExpanded(item.id)}
                                className="flex h-7 w-full items-center justify-center border border-[#d2ddd7] bg-white text-[#31413b]"
                                title="세부 체크리스트"
                              >
                                {expanded ? "−" : "+"}
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
                                className="mt-1 min-h-6 w-full border border-[#d9e5df] bg-white/70 px-1.5 text-[10px] font-semibold text-[#245f57] focus:border-[#77b8ae]"
                                placeholder="대분류"
                              />
                              <div className="mt-1 truncate px-1.5 text-[10px] text-[#6b7772] xl:text-xs">
                                {done ? "완료" : nextStepTitle(item)}
                                {subProgress !== null ? ` · 세부 ${subProgress}%` : ""}
                                {savingItemIds.has(item.id) ? " · 저장 중" : ""}
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
                              <input
                                type="color"
                                value={assigneeSettings[assigneeName(item.assignee)] ?? "#e6f4ef"}
                                onChange={(event) =>
                                  saveAssigneeColor(
                                    assigneeName(item.assignee),
                                    event.target.value
                                  )
                                }
                                className="mt-1 h-6 w-full border border-[#cbd8d2] bg-white"
                                title="담당자 색상"
                              />
                            </td>
                            <td className="border-r border-[#dbe4df] px-1.5 py-3 align-top">
                              <div className="flex items-center gap-1.5">
                                <div className="h-2 flex-1 overflow-hidden bg-[#e2e9e5]">
                                  <div
                                    className="h-full"
                                    style={{
                                      width: `${progress}%`,
                                      backgroundColor: progressColor(item),
                                    }}
                                  />
                                </div>
                                <span className="w-8 text-right text-[11px] font-semibold text-[#1f6f67]">
                                  {progress}%
                                </span>
                              </div>
                              <label
                                className="relative mt-2 flex h-7 w-full cursor-pointer items-center justify-center border border-[#d7e1dc] bg-white px-1 text-[10px] font-semibold text-[#53625c]"
                                title="최종 마감일"
                              >
                                {item.dueDate ? `마감 ${formatDay(item.dueDate)}` : "+ 마감"}
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

                              return (
                                <td
                                  key={step.id}
                                  className={`border-r border-[#dbe4df] px-0.5 py-1.5 text-center align-middle ${
                                    checked
                                      ? "bg-[#dff3ee]"
                                      : state === "overdue" || state === "danger"
                                        ? "bg-[#ffe5df]"
                                        : state === "warning"
                                          ? "bg-[#fff3c2]"
                                          : allowed
                                            ? "bg-[#fff8dc]"
                                            : "bg-[#f6f7f6]"
                                  }`}
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
                                      className={`mx-auto flex h-8 w-8 items-center justify-center border text-[9px] font-semibold leading-none transition ${
                                        checked
                                          ? "border-[#248f84] bg-[#248f84] text-white"
                                          : disabled
                                            ? "border-[#d7e1dc] bg-[#eef2ef] text-[#a0aaa5]"
                                            : state === "overdue" || state === "danger"
                                              ? "border-[#d9452f] bg-[#e85d48] text-white"
                                              : state === "warning"
                                                ? "border-[#d59a18] bg-[#e5aa25] text-white"
                                                : "border-[#e2c75e] bg-[#f7e47d] text-[#4d4626]"
                                      }`}
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
                                      className="relative flex h-4 w-4 cursor-pointer items-center justify-center border border-[#d7e1dc] bg-white text-[9px] font-semibold text-[#6b7772]"
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
                              <div className="text-[10px] text-[#6b7772]">
                                수정 {formatDate(item.updatedAt)}
                              </div>
                            </td>
                          </tr>

                          {expanded ? (
                            <tr className="border-b border-[#dbe4df] bg-[#fbfcfb]">
                              <td />
                              <td colSpan={stages.length + 4} className="px-3 py-3">
                                <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
                                  <div>
                                    <div className="mb-2 text-sm font-semibold">
                                      세부 체크리스트
                                    </div>
                                    <div className="space-y-2">
                                      <div className="hidden grid-cols-[34px_minmax(180px,1.2fr)_130px_minmax(180px,1fr)_54px] gap-2 px-2 text-xs font-semibold text-[#63716b] md:grid">
                                        <span />
                                        <span>내용</span>
                                        <span>기한</span>
                                        <span>애로사항</span>
                                        <span />
                                      </div>
                                      {item.subtasks.map((subtask) => (
                                        <div
                                          key={subtask.id}
                                          className="grid gap-2 border border-[#d7e1dc] bg-white p-2 md:grid-cols-[34px_minmax(180px,1.2fr)_130px_minmax(180px,1fr)_54px] md:items-center"
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
                                            className="h-4 w-4 accent-[#248f84] md:mx-auto"
                                          />
                                          <label className="grid gap-1 text-xs font-semibold text-[#63716b] md:block">
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
                                              className="min-h-8 w-full border border-transparent bg-transparent text-sm font-normal text-[#1d2320] hover:border-[#cbd8d2] focus:border-[#77b8ae] focus:bg-white"
                                            />
                                          </label>
                                          <label className="grid gap-1 text-xs font-semibold text-[#63716b] md:block">
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
                                              className="min-h-8 w-full border border-[#d7e1dc] bg-white px-2 text-xs font-normal text-[#1d2320]"
                                            />
                                          </label>
                                          <label className="grid gap-1 text-xs font-semibold text-[#63716b] md:block">
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
                                              className="min-h-8 w-full border border-transparent bg-transparent text-sm font-normal text-[#1d2320] hover:border-[#cbd8d2] focus:border-[#77b8ae] focus:bg-white"
                                              placeholder="없음"
                                            />
                                          </label>
                                          {savingSubtaskIds.has(subtask.id) ? (
                                            <span className="text-xs text-[#1f6f67]">
                                              저장
                                            </span>
                                          ) : (
                                            <span />
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                    <form
                                      onSubmit={(event) => {
                                        event.preventDefault();
                                        void addSubtask(item.id);
                                      }}
                                      className="mt-3 grid gap-2 md:grid-cols-[minmax(180px,1.2fr)_130px_minmax(180px,1fr)_90px]"
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
                                        className="min-h-10 border border-[#cbd8d2] bg-white px-3 text-sm"
                                        placeholder="내용"
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
                                        className="min-h-10 border border-[#cbd8d2] bg-white px-3 text-sm"
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
                                        className="min-h-10 border border-[#cbd8d2] bg-white px-3 text-sm"
                                        placeholder="애로사항"
                                      />
                                      <button
                                        type="submit"
                                        className="min-h-10 bg-[#1f6f67] px-4 text-sm font-semibold text-white"
                                      >
                                        추가
                                      </button>
                                    </form>
                                  </div>

                                  <div className="border border-[#d7e1dc] bg-white p-3">
                                    <div className="text-sm font-semibold">
                                      최근 이력
                                    </div>
                                    <div className="mt-2 max-h-40 space-y-2 overflow-auto">
                                      {history
                                        .filter((entry) => entry.itemId === item.id)
                                        .slice(0, 6)
                                        .map((entry) => (
                                          <div
                                            key={entry.id}
                                            className="text-xs leading-5 text-[#53625c]"
                                          >
                                            <span className="font-semibold">
                                              {formatDate(entry.createdAt)}
                                            </span>{" "}
                                            {entry.summary}
                                          </div>
                                        ))}
                                      {!history.some(
                                        (entry) => entry.itemId === item.id
                                      ) ? (
                                        <div className="text-xs text-[#6b7772]">
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
                      </Fragment>
                    ))}
                </tbody>

                <tfoot>
                  <tr className="border-t-2 border-[#9fcac1] bg-[#f6fbf8]">
                    <td className="border-r border-[#dbe4df] bg-[#f6fbf8] px-1 py-3" />
                    <td colSpan={stages.length + 4} className="px-3 py-3">
                      <form
                        onSubmit={addItem}
                        className="grid gap-2 lg:grid-cols-[150px_150px_minmax(220px,1fr)_130px_120px_minmax(190px,1fr)_90px]"
                      >
                        <select
                          value={newTemplateKey}
                          onChange={(event) => setNewTemplateKey(event.target.value)}
                          className="min-h-10 border border-[#cbd8d2] bg-white px-3 text-sm"
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
                          className="min-h-10 border border-[#cbd8d2] bg-white px-3 text-sm text-[#1d2320]"
                          placeholder="대분류"
                        />
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
                          type="date"
                          value={newDueDate}
                          onChange={(event) => setNewDueDate(event.target.value)}
                          className="min-h-10 border border-[#cbd8d2] bg-white px-3 text-sm"
                          title="최종 마감일"
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
        ) : (
          <div className="border border-[#cfdad4] bg-white p-4 shadow-sm">
            <div className="grid gap-3">
              {visibleItems.map((item) => {
                const progress = itemProgress(item);
                const next = nextStep(item);
                const rowColor = rowAccentColor(
                  assigneeSettings[assigneeName(item.assignee)]
                );

                return (
                  <div
                    key={item.id}
                    className="grid gap-3 border border-[#dbe4df] p-3 md:grid-cols-[280px_1fr_80px]"
                    style={{ backgroundColor: rowColor }}
                  >
                    <div>
                      <div className="font-semibold">{item.title}</div>
                      <div className="text-sm text-[#66746e]">
                        {assigneeName(item.assignee)} · {next?.title ?? "완료"}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {item.steps.map((step) => (
                        <div
                          key={step.id}
                          className={`h-7 flex-1 border ${
                            step.status === "done"
                              ? "border-[#248f84] bg-[#248f84]"
                              : urgency(step.dueDate) === "overdue"
                                ? "border-[#d9452f] bg-[#ffe5df]"
                                : urgency(step.dueDate) === "warning" ||
                                    urgency(step.dueDate) === "danger"
                                  ? "border-[#e5aa25] bg-[#fff3c2]"
                                  : "border-[#d7e1dc] bg-white"
                          }`}
                          title={`${step.title} ${formatDay(step.dueDate)}`}
                        />
                      ))}
                    </div>
                    <div className="text-right text-sm font-semibold text-[#1f6f67]">
                      {progress}%
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_360px]">
          <section className="border border-[#cfdad4] bg-white p-4">
            <h2 className="text-base font-semibold">변경 이력</h2>
            <div className="mt-3 max-h-56 space-y-2 overflow-auto">
              {history.slice(0, 20).map((entry) => (
                <div key={entry.id} className="text-sm leading-6 text-[#53625c]">
                  <span className="font-semibold">{formatDate(entry.createdAt)}</span>{" "}
                  {entry.summary}
                </div>
              ))}
              {!history.length ? (
                <div className="text-sm text-[#63716b]">아직 변경 이력이 없습니다.</div>
              ) : null}
            </div>
          </section>

          <section className="border border-[#cfdad4] bg-white p-4">
            <h2 className="text-base font-semibold">보드 설정</h2>
            <div className="mt-3 grid gap-3">
              <label className="text-sm font-medium text-[#4b5d56]">
                조직명
                <input
                  value={organizationName}
                  onChange={(event) => setOrganizationName(event.target.value)}
                  onBlur={(event) =>
                    void saveBoardSettings({
                      organizationName: event.target.value,
                    })
                  }
                  className="mt-1 min-h-10 w-full border border-[#cbd8d2] bg-white px-3 text-sm"
                />
              </label>
              <label className="text-sm font-medium text-[#4b5d56]">
                보드명
                <input
                  value={boardTitle}
                  onChange={(event) => setBoardTitle(event.target.value)}
                  onBlur={(event) =>
                    void saveBoardSettings({ boardTitle: event.target.value })
                  }
                  className="mt-1 min-h-10 w-full border border-[#cbd8d2] bg-white px-3 text-sm"
                />
              </label>
              <label className="text-sm font-medium text-[#4b5d56]">
                사용자명
                <input
                  value={userName}
                  onChange={(event) => setUserName(event.target.value)}
                  onBlur={(event) => saveUserName(event.target.value)}
                  className="mt-1 min-h-10 w-full border border-[#cbd8d2] bg-white px-3 text-sm"
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
