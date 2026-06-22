import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const workflowItems = sqliteTable(
  "workflow_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    title: text("title").notNull(),
    assignee: text("assignee").notNull().default(""),
    memo: text("memo").notNull().default(""),
    position: integer("position").notNull(),
    updatedBy: text("updated_by").notNull().default(""),
    updatedAt: text("updated_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("workflow_items_assignee_idx").on(table.assignee, table.position),
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
