CREATE TABLE `user_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `user_sessions_user_idx` ON `user_sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`login_id` text NOT NULL,
	`name` text NOT NULL,
	`password_hash` text NOT NULL,
	`failed_logins` integer DEFAULT 0 NOT NULL,
	`locked_until` text,
	`last_login_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_login_id_idx` ON `users` (`login_id`);--> statement-breakpoint
CREATE TABLE `workspace_join_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspace_id` text NOT NULL,
	`user_id` integer NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_join_requests_user_idx` ON `workspace_join_requests` (`workspace_id`,`user_id`);--> statement-breakpoint
ALTER TABLE `work_logs` ADD `status` text DEFAULT 'submitted' NOT NULL;--> statement-breakpoint
ALTER TABLE `work_logs` ADD `reviewer_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `work_logs` ADD `reviewed_at` text;--> statement-breakpoint
ALTER TABLE `work_logs` ADD `review_comment` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `workspace_members` ADD `user_id` integer;--> statement-breakpoint
ALTER TABLE `workspace_members` ADD `access_role` text DEFAULT 'member' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_members_user_idx` ON `workspace_members` (`workspace_id`,`user_id`) WHERE user_id IS NOT NULL;