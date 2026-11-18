CREATE TABLE `work_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspace_id` text NOT NULL,
	`member_id` integer NOT NULL,
	`member_name` text NOT NULL,
	`log_date` text NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`plan` text DEFAULT '' NOT NULL,
	`issues` text DEFAULT '' NOT NULL,
	`item_ids` text DEFAULT '[]' NOT NULL,
	`updated_by` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `work_logs_member_date_idx` ON `work_logs` (`workspace_id`,`member_id`,`log_date`);--> statement-breakpoint
CREATE INDEX `work_logs_workspace_date_idx` ON `work_logs` (`workspace_id`,`log_date`);--> statement-breakpoint
CREATE TABLE `workspace_members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`role` text DEFAULT '' NOT NULL,
	`color` text DEFAULT '#e6f4ef' NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_members_name_idx` ON `workspace_members` (`workspace_id`,`name`);--> statement-breakpoint
CREATE INDEX `workspace_members_position_idx` ON `workspace_members` (`workspace_id`,`position`);