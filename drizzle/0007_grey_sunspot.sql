CREATE TABLE `document_templates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspace_id` text DEFAULT 'default' NOT NULL,
	`name` text NOT NULL,
	`filename` text NOT NULL,
	`mime_type` text DEFAULT 'application/octet-stream' NOT NULL,
	`size` integer NOT NULL,
	`data` blob NOT NULL,
	`uploaded_by` text DEFAULT '' NOT NULL,
	`updated_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workspace_assignee_settings` (
	`workspace_id` text NOT NULL,
	`assignee` text NOT NULL,
	`color` text DEFAULT '#e6f4ef' NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`workspace_id`, `assignee`)
);
--> statement-breakpoint
CREATE TABLE `workspace_settings` (
	`workspace_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`workspace_id`, `key`)
);
--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`department_name` text DEFAULT '' NOT NULL,
	`team_name` text NOT NULL,
	`password_hash` text,
	`password_salt` text,
	`updated_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `workspaces_name_idx` ON `workspaces` (`department_name`,`team_name`);--> statement-breakpoint
ALTER TABLE `webhook_settings` ADD `workspace_id` text DEFAULT 'default' NOT NULL;--> statement-breakpoint
CREATE INDEX `webhook_settings_workspace_idx` ON `webhook_settings` (`workspace_id`);--> statement-breakpoint
ALTER TABLE `workflow_history` ADD `workspace_id` text DEFAULT 'default' NOT NULL;--> statement-breakpoint
CREATE INDEX `workflow_history_workspace_created_idx` ON `workflow_history` (`workspace_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `workflow_items` ADD `workspace_id` text DEFAULT 'default' NOT NULL;--> statement-breakpoint
ALTER TABLE `workflow_items` ADD `location` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `workflow_items` ADD `lat` real;--> statement-breakpoint
ALTER TABLE `workflow_items` ADD `lng` real;--> statement-breakpoint
ALTER TABLE `workflow_items` ADD `links` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
CREATE INDEX `workflow_items_workspace_position_idx` ON `workflow_items` (`workspace_id`,`position`);--> statement-breakpoint
ALTER TABLE `workflow_subtasks` ADD `step_id` integer;