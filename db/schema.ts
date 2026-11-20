import { sql } from "drizzle-orm";
import {
  blob,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const documentTemplates = sqliteTable("document_templates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  workspaceId: text("workspace_id").notNull().default("default"),
  name: text("name").notNull(),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull().default("application/octet-stream"),
  size: integer("size").notNull(),
  data: blob("data").notNull(),
  uploadedBy: text("uploaded_by").notNull().default(""),
  updatedAt: text("updated_at").notNull(),
  createdAt: text("created_at").notNull(),
});

export const workspaces = sqliteTable(
  "workspaces",
  {
    id: text("id").primaryKey(),
    departmentName: text("department_name").notNull().default(""),
    teamName: text("team_name").notNull(),
    passwordHash: text("password_hash"),
    passwordSalt: text("password_salt"),
    updatedAt: text("updated_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("workspaces_name_idx").on(table.departmentName, table.teamName),
  ]
);

export const workspaceSettings = sqliteTable(
  "workspace_settings",
  {
    workspaceId: text("workspace_id").notNull(),
    key: text("key").notNull(),
    value: text("value").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.key] }),
  ]
);

export const workspaceAssigneeSettings = sqliteTable(
  "workspace_assignee_settings",
  {
    workspaceId: text("workspace_id").notNull(),
    assignee: text("assignee").notNull(),
    color: text("color").notNull().default("#e6f4ef"),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.assignee] }),
  ]
);

export const workflowItems = sqliteTable(
  "workflow_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    workspaceId: text("workspace_id").notNull().default("default"),
    title: text("title").notNull(),
    assignee: text("assignee").notNull().default(""),
    category: text("category").notNull().default("일반 업무"),
    memo: text("memo").notNull().default(""),
    allocatedBudget: integer("allocated_budget"),
    requiredBudget: integer("required_budget"),
    dueDate: text("due_date"),
    location: text("location").notNull().default(""),
    lat: real("lat"),
    lng: real("lng"),
    links: text("links").notNull().default("[]"),
    archivedYear: integer("archived_year"),
    archiveHold: integer("archive_hold").notNull().default(0),
    templateKey: text("template_key").notNull().default("general-service"),
    position: integer("position").notNull(),
    updatedBy: text("updated_by").notNull().default(""),
    updatedAt: text("updated_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("workflow_items_assignee_idx").on(table.assignee, table.position),
    index("workflow_items_workspace_position_idx").on(
      table.workspaceId,
      table.position
    ),
  ]
);

export const workflowSteps = sqliteTable(
  "workflow_steps",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    itemId: integer("item_id").notNull(),
    stageKey: text("stage_key").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    phaseGroup: text("phase_group").notNull().default(""),
    position: integer("position").notNull(),
    progressValue: integer("progress_value"),
    status: text("status").notNull().default("todo"),
    dueDate: text("due_date"),
    completedAt: text("completed_at"),
    updatedBy: text("updated_by").notNull().default(""),
    updatedAt: text("updated_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("workflow_steps_item_stage_idx").on(
      table.itemId,
      table.stageKey
    ),
    index("workflow_steps_item_position_idx").on(table.itemId, table.position),
  ]
);

export const workflowSubtasks = sqliteTable(
  "workflow_subtasks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    itemId: integer("item_id").notNull(),
    stepId: integer("step_id"),
    title: text("title").notNull(),
    status: text("status").notNull().default("todo"),
    dueDate: text("due_date"),
    blockers: text("blockers").notNull().default(""),
    position: integer("position").notNull(),
    updatedBy: text("updated_by").notNull().default(""),
    updatedAt: text("updated_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("workflow_subtasks_item_position_idx").on(
      table.itemId,
      table.position
    ),
  ]
);

export const assigneeSettings = sqliteTable("assignee_settings", {
  assignee: text("assignee").primaryKey(),
  color: text("color").notNull().default("#e6f4ef"),
  updatedAt: text("updated_at").notNull(),
});

export const workflowHistory = sqliteTable(
  "workflow_history",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    workspaceId: text("workspace_id").notNull().default("default"),
    itemId: integer("item_id"),
    entityType: text("entity_type").notNull(),
    entityId: integer("entity_id"),
    action: text("action").notNull(),
    summary: text("summary").notNull(),
    actor: text("actor").notNull().default("팀"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("workflow_history_created_idx").on(table.createdAt),
    index("workflow_history_workspace_created_idx").on(
      table.workspaceId,
      table.createdAt
    ),
  ]
);

export const webhookSettings = sqliteTable(
  "webhook_settings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    workspaceId: text("workspace_id").notNull().default("default"),
    name: text("name").notNull().default("팀 알림"),
    url: text("url").notNull(),
    enabled: integer("enabled").notNull().default(1),
    updatedAt: text("updated_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("webhook_settings_workspace_idx").on(table.workspaceId),
  ]
);

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const workflowTasks = sqliteTable("workflow_tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  templateKey: text("template_key").notNull().unique(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  phaseGroup: text("phase_group").notNull().default(""),
  position: integer("position").notNull(),
  progressValue: integer("progress_value"),
  status: text("status").notNull().default("todo"),
  assignee: text("assignee").notNull().default(""),
  memo: text("memo").notNull().default(""),
  completedAt: text("completed_at"),
  updatedBy: text("updated_by").notNull().default(""),
  updatedAt: text("updated_at").notNull(),
  createdAt: text("created_at").notNull(),
});

export const workspaceMembers = sqliteTable(
  "workspace_members",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    workspaceId: text("workspace_id").notNull(),
    name: text("name").notNull(),
    role: text("role").notNull().default(""),
    color: text("color").notNull().default("#e6f4ef"),
    active: integer("active").notNull().default(1),
    position: integer("position").notNull().default(0),
    // Linked login account; null for roster-only names.
    userId: integer("user_id"),
    // 'manager' (부서장) or 'member' (구성원).
    accessRole: text("access_role").notNull().default("member"),
    // 1 = may read everyone's 업무일지 when the board's visibility is "selected".
    logViewer: integer("log_viewer").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("workspace_members_name_idx").on(table.workspaceId, table.name),
    index("workspace_members_position_idx").on(table.workspaceId, table.position),
    uniqueIndex("workspace_members_user_idx")
      .on(table.workspaceId, table.userId)
      .where(sql`user_id IS NOT NULL`),
  ]
);

export const workLogs = sqliteTable(
  "work_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    workspaceId: text("workspace_id").notNull(),
    memberId: integer("member_id").notNull(),
    memberName: text("member_name").notNull(),
    logDate: text("log_date").notNull(),
    content: text("content").notNull().default(""),
    plan: text("plan").notNull().default(""),
    issues: text("issues").notNull().default(""),
    itemIds: text("item_ids").notNull().default("[]"),
    // 'submitted' | 'approved' | 'rejected'
    status: text("status").notNull().default("submitted"),
    reviewerName: text("reviewer_name").notNull().default(""),
    reviewedAt: text("reviewed_at"),
    reviewComment: text("review_comment").notNull().default(""),
    updatedBy: text("updated_by").notNull().default(""),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("work_logs_member_date_idx").on(
      table.workspaceId,
      table.memberId,
      table.logDate
    ),
    index("work_logs_workspace_date_idx").on(table.workspaceId, table.logDate),
  ]
);

export const users = sqliteTable(
  "users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    loginId: text("login_id").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    failedLogins: integer("failed_logins").notNull().default(0),
    lockedUntil: text("locked_until"),
    lastLoginAt: text("last_login_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("users_login_id_idx").on(table.loginId)]
);

export const userSessions = sqliteTable(
  "user_sessions",
  {
    // SHA-256 of the cookie token; the token itself is never stored.
    tokenHash: text("token_hash").primaryKey(),
    userId: integer("user_id").notNull(),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
  },
  (table) => [index("user_sessions_user_idx").on(table.userId)]
);

export const workspaceJoinRequests = sqliteTable(
  "workspace_join_requests",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    workspaceId: text("workspace_id").notNull(),
    userId: integer("user_id").notNull(),
    name: text("name").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("workspace_join_requests_user_idx").on(table.workspaceId, table.userId),
  ]
);

// 업무일정: one calendar shared by everyone on a board.
export const calendarEvents = sqliteTable(
  "calendar_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    workspaceId: text("workspace_id").notNull(),
    title: text("title").notNull(),
    category: text("category").notNull().default("etc"),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    allDay: integer("all_day").notNull().default(1),
    startTime: text("start_time"),
    endTime: text("end_time"),
    location: text("location").notNull().default(""),
    description: text("description").notNull().default(""),
    attendeeIds: text("attendee_ids").notNull().default("[]"),
    reminderMinutes: integer("reminder_minutes"),
    createdByMemberId: integer("created_by_member_id").notNull(),
    createdByName: text("created_by_name").notNull(),
    updatedBy: text("updated_by").notNull().default(""),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("calendar_events_range_idx").on(table.workspaceId, table.startDate, table.endDate),
    index("calendar_events_updated_idx").on(table.workspaceId, table.updatedAt),
  ]
);

// 회의록, shared with the board.
export const meetingMinutes = sqliteTable(
  "meeting_minutes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    workspaceId: text("workspace_id").notNull(),
    title: text("title").notNull(),
    meetingDate: text("meeting_date").notNull(),
    startTime: text("start_time"),
    endTime: text("end_time"),
    location: text("location").notNull().default(""),
    attendeeIds: text("attendee_ids").notNull().default("[]"),
    guests: text("guests").notNull().default(""),
    agenda: text("agenda").notNull().default(""),
    content: text("content").notNull().default(""),
    decisions: text("decisions").notNull().default(""),
    actionItems: text("action_items").notNull().default("[]"),
    eventId: integer("event_id"),
    authorMemberId: integer("author_member_id").notNull(),
    authorName: text("author_name").notNull(),
    updatedBy: text("updated_by").notNull().default(""),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("meeting_minutes_date_idx").on(table.workspaceId, table.meetingDate)]
);

// Members who missed a meeting confirm here that they read the minutes.
export const meetingMinutesReads = sqliteTable(
  "meeting_minutes_reads",
  {
    minutesId: integer("minutes_id").notNull(),
    workspaceId: text("workspace_id").notNull(),
    memberId: integer("member_id").notNull(),
    memberName: text("member_name").notNull(),
    acknowledgedAt: text("acknowledged_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.minutesId, table.memberId] }),
    index("meeting_minutes_reads_workspace_idx").on(table.workspaceId),
  ]
);

// 지도 장소: places pinned on the board map besides work items.
export const mapPlaces = sqliteTable(
  "map_places",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    workspaceId: text("workspace_id").notNull(),
    name: text("name").notNull(),
    kind: text("kind").notNull().default("etc"),
    customKind: text("custom_kind").notNull().default(""),
    lat: real("lat").notNull(),
    lng: real("lng").notNull(),
    address: text("address").notNull().default(""),
    memo: text("memo").notNull().default(""),
    createdByMemberId: integer("created_by_member_id").notNull(),
    createdByName: text("created_by_name").notNull(),
    updatedBy: text("updated_by").notNull().default(""),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("map_places_workspace_idx").on(table.workspaceId)]
);

// 구역: polygons on the board map (drawn or imported from Shapefiles).
export const mapAreas = sqliteTable(
  "map_areas",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    workspaceId: text("workspace_id").notNull(),
    name: text("name").notNull(),
    color: text("color").notNull().default("#18786f"),
    memo: text("memo").notNull().default(""),
    geometry: text("geometry").notNull(),
    areaM2: real("area_m2").notNull(),
    perimeterM: real("perimeter_m").notNull(),
    source: text("source").notNull().default("draw"),
    createdByMemberId: integer("created_by_member_id").notNull(),
    createdByName: text("created_by_name").notNull(),
    updatedBy: text("updated_by").notNull().default(""),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("map_areas_workspace_idx").on(table.workspaceId)]
);
