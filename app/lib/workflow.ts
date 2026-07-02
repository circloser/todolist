// Shared types and pure helpers for the workflow board.
// Extracted from task-board.tsx so they can be unit-tested in isolation and
// reused without pulling in the (client-only) component.

export type StepStatus = "todo" | "done";
export type TaskFilter = "all" | "open" | "done";
export type SortMode = "manual" | "assignee" | "progress" | "updated";
export type ViewMode = "dashboard" | "list" | "map" | "grid" | "gantt";
export type DueFilter = "all" | "urgent" | "overdue" | "week" | "month";
export type Urgency = "none" | "overdue" | "danger" | "warning" | "normal";

export type WorkflowSubtask = {
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

export type WorkflowStep = {
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

export type WorkflowItem = {
  id: number;
  title: string;
  assignee: string;
  category: string;
  memo: string;
  allocatedBudget: number | null;
  requiredBudget: number | null;
  dueDate: string | null;
  location: string;
  lat: number | null;
  lng: number | null;
  links: Array<{ title: string; url: string }>;
  templateKey: string;
  position: number;
  updatedBy: string;
  updatedAt: string;
  createdAt: string;
  steps: WorkflowStep[];
  subtasks: WorkflowSubtask[];
};

export type TemplateStage = {
  key: string;
  title: string;
  description: string;
  group: string;
  progress: number | null;
};

export type TemplateOption = {
  key: string;
  name: string;
  description: string;
  stages: TemplateStage[];
};

export type HistoryEntry = {
  id: number;
  itemId: number | null;
  entityType: string;
  entityId: number | null;
  action: string;
  summary: string;
  actor: string;
  createdAt: string;
};

export type AppSettings = {
  organizationName: string;
  boardTitle: string;
};

export type TaskResponse = {
  item?: WorkflowItem | null;
  items?: WorkflowItem[];
  templates?: TemplateOption[];
  assigneeSettings?: Record<string, string>;
  history?: HistoryEntry[];
  settings?: AppSettings;
  webhook?: { url: string; enabled: boolean };
  sent?: number;
  viewer?: string;
  error?: string;
};

export type SubtaskDraft = {
  title: string;
  dueDate: string;
  blockers: string;
};

const MS_PER_DAY = 86_400_000;

export function formatDate(value?: string | null) {
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

export function formatDay(value?: string | null) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(`${value}T00:00:00`));
}

export function formatBudget(value?: number | null) {
  if (!value) {
    return "";
  }

  return new Intl.NumberFormat("ko-KR").format(value);
}

export function daysUntil(value?: string | null) {
  if (!value) {
    return null;
  }

  const target = new Date(`${value}T00:00:00`).getTime();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target - today.getTime()) / MS_PER_DAY);
}

export function urgency(value?: string | null): Urgency {
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

export function urgencyLabel(value?: string | null) {
  const days = daysUntil(value);

  if (days === null) {
    return "";
  }

  if (days < 0) {
    return `D+${Math.abs(days)}`;
  }

  return `D-${days}`;
}

export function shortDueLabel(value?: string | null) {
  const label = urgencyLabel(value);
  return label || "일정";
}

export function assigneeName(value: string) {
  return value.trim() || "미지정";
}

export function categoryName(value: string) {
  return value.trim() || "일반 업무";
}

export function completionCount(item: WorkflowItem) {
  return item.steps.filter((step) => step.status === "done").length;
}

export function itemProgress(item: WorkflowItem) {
  if (!item.steps.length) {
    return 0;
  }

  return Math.round((completionCount(item) / item.steps.length) * 100);
}

export function subtaskProgress(item: WorkflowItem) {
  if (!item.subtasks.length) {
    return null;
  }

  return Math.round(
    (item.subtasks.filter((subtask) => subtask.status === "done").length /
      item.subtasks.length) *
      100
  );
}

export function isItemDone(item: WorkflowItem) {
  return item.steps.length > 0 && completionCount(item) === item.steps.length;
}

export function nextStep(item: WorkflowItem) {
  return item.steps.find((step) => step.status !== "done") ?? null;
}

export function nextStepTitle(item: WorkflowItem) {
  return nextStep(item)?.title ?? "완료";
}

export function canToggleStep(item: WorkflowItem, index: number) {
  const step = item.steps[index];

  if (!step) {
    return false;
  }

  if (step.status === "done") {
    return true;
  }

  return index === 0 || item.steps[index - 1]?.status === "done";
}

export function applyManualPositions(items: WorkflowItem[], order: number[]) {
  const positions = new Map(order.map((id, index) => [id, index + 1]));

  return items.map((item) => ({
    ...item,
    position: positions.get(item.id) ?? item.position,
  }));
}

export function moveItem<T>(list: T[], from: number, to: number) {
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export function itemHasUrgentDate(item: WorkflowItem) {
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

// True when the item's final due date or any open step's due date falls within
// the inclusive [start, end] range. Dates are ISO "YYYY-MM-DD" so string
// comparison is a correct chronological comparison.
export function itemHasDueInRange(
  item: WorkflowItem,
  start: string,
  end: string
) {
  const dueDates = [
    item.dueDate,
    ...item.steps
      .filter((step) => step.status !== "done")
      .map((step) => step.dueDate),
  ];

  return dueDates.some((date) => !!date && date >= start && date <= end);
}

export function itemHasOverdueDate(item: WorkflowItem) {
  const dueDates = [
    item.dueDate,
    ...item.steps
      .filter((step) => step.status !== "done")
      .map((step) => step.dueDate),
  ];

  return dueDates.some((date) => urgency(date) === "overdue");
}

export function rowAccentColor(color?: string) {
  return color && /^#[0-9a-fA-F]{6}$/.test(color) ? color : "#ffffff";
}
