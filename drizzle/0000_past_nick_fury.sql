CREATE TABLE `workflow_tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`template_key` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`phase_group` text DEFAULT '' NOT NULL,
	`position` integer NOT NULL,
	`progress_value` integer,
	`status` text DEFAULT 'todo' NOT NULL,
	`assignee` text DEFAULT '' NOT NULL,
	`memo` text DEFAULT '' NOT NULL,
	`completed_at` text,
	`updated_by` text DEFAULT '' NOT NULL,
	`updated_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workflow_tasks_template_key_unique` ON `workflow_tasks` (`template_key`);