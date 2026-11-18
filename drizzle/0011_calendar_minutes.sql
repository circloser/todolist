CREATE TABLE `calendar_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspace_id` text NOT NULL,
	`title` text NOT NULL,
	`category` text DEFAULT 'etc' NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`all_day` integer DEFAULT 1 NOT NULL,
	`start_time` text,
	`end_time` text,
	`location` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`attendee_ids` text DEFAULT '[]' NOT NULL,
	`reminder_minutes` integer,
	`created_by_member_id` integer NOT NULL,
	`created_by_name` text NOT NULL,
	`updated_by` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `calendar_events_range_idx` ON `calendar_events` (`workspace_id`,`start_date`,`end_date`);--> statement-breakpoint
CREATE INDEX `calendar_events_updated_idx` ON `calendar_events` (`workspace_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `meeting_minutes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspace_id` text NOT NULL,
	`title` text NOT NULL,
	`meeting_date` text NOT NULL,
	`start_time` text,
	`end_time` text,
	`location` text DEFAULT '' NOT NULL,
	`attendee_ids` text DEFAULT '[]' NOT NULL,
	`guests` text DEFAULT '' NOT NULL,
	`agenda` text DEFAULT '' NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`decisions` text DEFAULT '' NOT NULL,
	`action_items` text DEFAULT '[]' NOT NULL,
	`event_id` integer,
	`author_member_id` integer NOT NULL,
	`author_name` text NOT NULL,
	`updated_by` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `meeting_minutes_date_idx` ON `meeting_minutes` (`workspace_id`,`meeting_date`);--> statement-breakpoint
CREATE TABLE `meeting_minutes_reads` (
	`minutes_id` integer NOT NULL,
	`workspace_id` text NOT NULL,
	`member_id` integer NOT NULL,
	`member_name` text NOT NULL,
	`acknowledged_at` text NOT NULL,
	PRIMARY KEY(`minutes_id`, `member_id`)
);
--> statement-breakpoint
CREATE INDEX `meeting_minutes_reads_workspace_idx` ON `meeting_minutes_reads` (`workspace_id`);