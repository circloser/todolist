// Team members (구성원) and daily work logs (업무일지): shared types and pure
// helpers used by both the API routes and the client panels. Kept free of
// runtime dependencies so it can be unit-tested in isolation.

import type { WorkflowItem } from "./workflow";

// 부서장(manager) manages every work process and approves 업무일지;
// 구성원(member) can only change their own.
export type AccessRole = "manager" | "member";

export type TeamMember = {
  id: number;
  name: string;
  /** Job title (역할·직급), free text. Not a permission. */
  role: string;
  color: string;
  active: boolean;
  position: number;
  accessRole: AccessRole;
  hasAccount: boolean;
  /** Only sent to managers. */
  loginId?: string;
  createdAt: string;
  updatedAt: string;
};

export type WorkLogStatus = "submitted" | "approved" | "rejected";

export type WorkLog = {
  id: number;
  memberId: number;
  memberName: string;
  logDate: string;
  content: string;
  plan: string;
  issues: string;
  itemIds: number[];
  status: WorkLogStatus;
  reviewerName: string;
  reviewedAt: string | null;
  reviewComment: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
};

export type JoinRequest = {
  id: number;
  userId: number;
  loginId: string;
  name: string;
  createdAt: string;
  /** Unlinked roster entry with the same name, suggested for linking. */
  suggestedMemberId: number | null;
};

export type MembersResponse = {
  members?: TeamMember[];
  member?: TeamMember;
  assigneeSettings?: Record<string, string>;
  requests?: JoinRequest[];
  imported?: number;
  renamedItems?: number;
  error?: string;
};

export type WorkLogsResponse = {
  logs?: WorkLog[];
  log?: WorkLog | null;
  reviewed?: number;
  pendingReview?: number;
  error?: string;
};

// ---------------------------------------------------------------- accounts

export type Viewer = {
  userId: number;
  loginId: string;
  memberId: number;
  name: string;
  accessRole: AccessRole;
};

export type BoardMembership = {
  workspaceId: string;
  label: string;
  departmentName: string;
  teamName: string;
  memberId: number;
  memberName: string;
  accessRole: AccessRole;
  active: boolean;
};

export type AuthResponse = {
  user?: { id: number; loginId: string; name: string } | null;
  boards?: BoardMembership[];
  pending?: Array<{ workspaceId: string; label: string; name: string; createdAt: string }>;
  joined?: boolean;
  becameManager?: boolean;
  requested?: boolean;
  error?: string;
};

export const LOGIN_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

export function normalizeLoginId(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function loginIdError(loginId: string) {
  return LOGIN_ID_PATTERN.test(loginId)
    ? null
    : "아이디는 영문 소문자·숫자·._- 조합 3~32자로 입력해 주세요.";
}

export function passwordError(password: unknown, loginId = "") {
  if (typeof password !== "string" || password.length < PASSWORD_MIN) {
    return `비밀번호는 ${PASSWORD_MIN}자 이상으로 입력해 주세요.`;
  }

  if (password.length > PASSWORD_MAX) {
    return `비밀번호는 ${PASSWORD_MAX}자 이하로 입력해 주세요.`;
  }

  if (loginId && password.toLowerCase().includes(loginId)) {
    return "비밀번호에 아이디를 포함할 수 없습니다.";
  }

  return null;
}

// ------------------------------------------------------------- permissions

// Work items are owned by name (workflow_items.assignee), matching how the
// board already assigns work; renames cascade so names stay in sync.
export function sameMemberName(first: string | null | undefined, second: string | null | undefined) {
  const left = normalizeMemberName(first ?? "");
  return Boolean(left) && left === normalizeMemberName(second ?? "");
}

export function canEditItem(
  viewer: Pick<Viewer, "name" | "accessRole"> | null,
  item: { assignee: string }
) {
  if (!viewer) {
    return false;
  }

  return viewer.accessRole === "manager" || sameMemberName(viewer.name, item.assignee);
}

export const WORK_LOG_STATUS_LABEL: Record<WorkLogStatus, string> = {
  submitted: "승인 대기",
  approved: "승인",
  rejected: "반려",
};

export function normalizeLogStatus(value: unknown): WorkLogStatus {
  return value === "approved" || value === "rejected" ? value : "submitted";
}

// Who may do what with a log. Authors edit their own until it is approved;
// managers review other people's logs but never edit their content.
export function workLogPermissions(
  viewer: Pick<Viewer, "memberId" | "accessRole"> | null,
  log: Pick<WorkLog, "memberId" | "status"> | null,
  memberId: number | null
) {
  const own = Boolean(viewer && memberId !== null && viewer.memberId === memberId);
  const manager = viewer?.accessRole === "manager";
  const status = log?.status ?? null;

  return {
    canEdit: own && status !== "approved",
    canDelete: own && Boolean(log) && status !== "approved",
    canReview: Boolean(manager && log && !own),
    canReopen: Boolean(manager && log && !own && status !== "submitted"),
  };
}

export const MEMBER_NAME_MAX = 40;
export const MEMBER_ROLE_MAX = 40;
export const WORK_LOG_TEXT_MAX = 4000;
export const WORK_LOG_ITEM_MAX = 30;
export const WORK_LOG_RANGE_MAX_DAYS = 93;
export const DEFAULT_MEMBER_COLOR = "#e6f4ef";

// Soft palette for new members; matches the existing assignee row tints.
export const MEMBER_COLORS = [
  "#e6f4ef",
  "#e8eefc",
  "#fdf0de",
  "#f6e6ef",
  "#e9f3dc",
  "#efe8fb",
  "#fbe9e6",
  "#e4f1f6",
];

export function normalizeMemberName(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/\s+/g, " ").trim().slice(0, MEMBER_NAME_MAX);
}

export function normalizeMemberRole(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/\s+/g, " ").trim().slice(0, MEMBER_ROLE_MAX);
}

export function normalizeColor(value: unknown) {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value.trim())
    ? value.trim().toLowerCase()
    : null;
}

export function pickMemberColor(index: number) {
  return MEMBER_COLORS[Math.abs(index) % MEMBER_COLORS.length];
}

export function memberNameKey(name: string) {
  return normalizeMemberName(name).toLocaleLowerCase("ko-KR");
}

// Calendar days are stored as YYYY-MM-DD and must be real dates.
export function normalizeLogDate(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return null;
  }

  const [year, month, day] = trimmed.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? trimmed
    : null;
}

export function normalizeLogText(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/\r\n?/g, "\n").trim().slice(0, WORK_LOG_TEXT_MAX);
}

export function normalizeItemIds(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const ids: number[] = [];

  for (const entry of value) {
    const id = Number(entry);

    if (Number.isInteger(id) && id > 0 && !ids.includes(id)) {
      ids.push(id);
    }

    if (ids.length >= WORK_LOG_ITEM_MAX) {
      break;
    }
  }

  return ids;
}

export function parseItemIds(raw: string | null | undefined) {
  if (!raw) {
    return [];
  }

  try {
    return normalizeItemIds(JSON.parse(raw));
  } catch {
    return [];
  }
}

// The team works on Korean calendar days regardless of server/browser zone.
export function kstDate(value: Date | string | number = Date.now()) {
  const ms =
    value instanceof Date
      ? value.getTime()
      : typeof value === "string"
        ? Date.parse(value)
        : value;

  if (!Number.isFinite(ms)) {
    return null;
  }

  return new Date(ms + 9 * 3_600_000).toISOString().slice(0, 10);
}

export function kstToday() {
  return kstDate() as string;
}

export function shiftDate(dateIso: string, days: number) {
  const [year, month, day] = dateIso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string) {
  const toMs = (iso: string) => {
    const [year, month, day] = iso.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  };

  return Math.round((toMs(toIso) - toMs(fromIso)) / 86_400_000);
}

export function monthRange(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return null;
  }

  const [year, monthNumber] = month.split("-").map(Number);

  if (monthNumber < 1 || monthNumber > 12) {
    return null;
  }

  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();

  return {
    from: `${month}-01`,
    to: `${month}-${String(lastDay).padStart(2, "0")}`,
  };
}

// Inclusive, validated range for log queries. Returns an error message
// instead of throwing so routes can answer with a 400.
export function normalizeLogRange(fromValue: unknown, toValue: unknown) {
  const from = normalizeLogDate(fromValue);
  const to = normalizeLogDate(toValue) ?? from;

  if (!from || !to) {
    return { error: "조회할 날짜를 YYYY-MM-DD 형식으로 입력해 주세요." } as const;
  }

  if (daysBetween(from, to) < 0) {
    return { error: "시작일이 종료일보다 늦습니다." } as const;
  }

  if (daysBetween(from, to) >= WORK_LOG_RANGE_MAX_DAYS) {
    return {
      error: `한 번에 ${WORK_LOG_RANGE_MAX_DAYS}일까지만 조회할 수 있습니다.`,
    } as const;
  }

  return { from, to } as const;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export function weekdayLabel(dateIso: string) {
  const [year, month, day] = dateIso.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

export function isWeekend(dateIso: string) {
  const label = weekdayLabel(dateIso);
  return label === "토" || label === "일";
}

export function formatLogDate(dateIso: string) {
  const [, month, day] = dateIso.split("-").map(Number);
  return `${month}월 ${day}일 (${weekdayLabel(dateIso)})`;
}

export function hasLogContent(
  log: Pick<WorkLog, "content" | "plan" | "issues" | "itemIds">
) {
  return Boolean(
    log.content.trim() ||
      log.plan.trim() ||
      log.issues.trim() ||
      log.itemIds.length
  );
}

// Who has / hasn't written a log for a given day (active members only, plus
// inactive members that still wrote one so nothing disappears).
export function dailyStatus(
  members: TeamMember[],
  logs: WorkLog[],
  date: string
) {
  const byMember = new Map(
    logs
      .filter((log) => log.logDate === date)
      .map((log) => [log.memberId, log] as const)
  );
  const rows = members
    .filter((member) => member.active || byMember.has(member.id))
    .map((member) => ({ member, log: byMember.get(member.id) ?? null }));

  return {
    rows,
    written: rows.filter((row) => row.log).length,
    missing: rows.filter((row) => !row.log).map((row) => row.member),
  };
}

// Assignee names used on the board that are not yet registered members.
export function unregisteredAssignees(
  members: Pick<TeamMember, "name">[],
  assignees: string[]
) {
  const known = new Set(members.map((member) => memberNameKey(member.name)));
  const result: string[] = [];

  for (const raw of assignees) {
    const name = normalizeMemberName(raw);
    const key = memberNameKey(name);

    if (name && name !== "미지정" && !known.has(key)) {
      known.add(key);
      result.push(name);
    }
  }

  return result;
}

// Draft lines for a log from what the member did on the board that day:
// steps and checklist items they completed (by KST calendar day).
export function dailyActivityLines(
  items: WorkflowItem[],
  memberName: string,
  date: string
) {
  const name = normalizeMemberName(memberName);
  const lines: string[] = [];

  if (!name) {
    return lines;
  }

  for (const item of items) {
    for (const step of item.steps) {
      if (
        step.status === "done" &&
        step.completedAt &&
        kstDate(step.completedAt) === date &&
        normalizeMemberName(step.updatedBy) === name
      ) {
        lines.push(`[${item.title}] ${step.title} 단계 완료`);
      }
    }

    for (const subtask of item.subtasks) {
      if (
        subtask.status === "done" &&
        kstDate(subtask.updatedAt) === date &&
        normalizeMemberName(subtask.updatedBy) === name
      ) {
        lines.push(`[${item.title}] ${subtask.title} 완료`);
      }
    }
  }

  return lines;
}

function csvCell(value: string | number) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function workLogsToCsv(
  logs: WorkLog[],
  itemTitles: Map<number, string>
) {
  const header = ["날짜", "요일", "구성원", "업무 내용", "관련 업무", "다음 계획", "특이사항", "작성자", "수정 시각"];
  const rows = [...logs]
    .sort(
      (first, second) =>
        first.logDate.localeCompare(second.logDate) ||
        first.memberName.localeCompare(second.memberName, "ko-KR")
    )
    .map((log) => [
      log.logDate,
      weekdayLabel(log.logDate),
      log.memberName,
      log.content,
      log.itemIds
        .map((id) => itemTitles.get(id) ?? `#${id}`)
        .join(", "),
      log.plan,
      log.issues,
      log.updatedBy,
      log.updatedAt,
    ]);

  // BOM so Excel opens the Korean text as UTF-8.
  return `﻿${[header, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\n")}\n`;
}
