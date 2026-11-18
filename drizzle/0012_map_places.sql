CREATE TABLE `map_places` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'etc' NOT NULL,
	`custom_kind` text DEFAULT '' NOT NULL,
	`lat` real NOT NULL,
	`lng` real NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`memo` text DEFAULT '' NOT NULL,
	`created_by_member_id` integer NOT NULL,
	`created_by_name` text NOT NULL,
	`updated_by` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `map_places_workspace_idx` ON `map_places` (`workspace_id`);