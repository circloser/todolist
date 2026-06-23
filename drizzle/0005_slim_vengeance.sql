ALTER TABLE `workflow_items` ADD `category` text DEFAULT '일반 업무' NOT NULL;--> statement-breakpoint
ALTER TABLE `workflow_subtasks` ADD `due_date` text;--> statement-breakpoint
ALTER TABLE `workflow_subtasks` ADD `blockers` text DEFAULT '' NOT NULL;