ALTER TABLE `workflow_items` ADD `archived_year` integer;--> statement-breakpoint
ALTER TABLE `workflow_items` ADD `archive_hold` integer DEFAULT 0 NOT NULL;