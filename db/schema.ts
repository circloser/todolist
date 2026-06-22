import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
