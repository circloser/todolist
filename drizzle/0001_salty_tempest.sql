CREATE TABLE `workflow_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`assignee` text DEFAULT '' NOT NULL,
	`memo` text DEFAULT '' NOT NULL,
	`position` integer NOT NULL,
	`updated_by` text DEFAULT '' NOT NULL,
	`updated_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workflow_steps` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`item_id` integer NOT NULL,
	`stage_key` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`phase_group` text DEFAULT '' NOT NULL,
	`position` integer NOT NULL,
	`progress_value` integer,
	`status` text DEFAULT 'todo' NOT NULL,
	`completed_at` text,
	`updated_by` text DEFAULT '' NOT NULL,
	`updated_at` text NOT NULL,
	`created_at` text NOT NULL
);
