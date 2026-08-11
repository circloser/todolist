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
