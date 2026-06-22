CREATE TABLE `assignee_settings` (
	`assignee` text PRIMARY KEY NOT NULL,
	`color` text DEFAULT '#e6f4ef' NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `webhook_settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text DEFAULT '팀 알림' NOT NULL,
	`url` text NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workflow_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer,
	`entity_type` text NOT NULL,
	`entity_id` integer,
	`action` text NOT NULL,
	`summary` text NOT NULL,
	`actor` text DEFAULT '팀' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `workflow_history_created_idx` ON `workflow_history` (`created_at`);--> statement-breakpoint
CREATE TABLE `workflow_subtasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'todo' NOT NULL,
	`position` integer NOT NULL,
	`updated_by` text DEFAULT '' NOT NULL,
	`updated_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `workflow_subtasks_item_position_idx` ON `workflow_subtasks` (`item_id`,`position`);--> statement-breakpoint
ALTER TABLE `workflow_items` ADD `due_date` text;--> statement-breakpoint
ALTER TABLE `workflow_items` ADD `template_key` text DEFAULT 'general-service' NOT NULL;--> statement-breakpoint
ALTER TABLE `workflow_steps` ADD `due_date` text;