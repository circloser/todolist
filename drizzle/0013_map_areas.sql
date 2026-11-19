CREATE TABLE `map_areas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT '#18786f' NOT NULL,
	`memo` text DEFAULT '' NOT NULL,
	`geometry` text NOT NULL,
	`area_m2` real NOT NULL,
	`perimeter_m` real NOT NULL,
	`source` text DEFAULT 'draw' NOT NULL,
	`created_by_member_id` integer NOT NULL,
	`created_by_name` text NOT NULL,
	`updated_by` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `map_areas_workspace_idx` ON `map_areas` (`workspace_id`);