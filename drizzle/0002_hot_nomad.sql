CREATE INDEX `workflow_items_assignee_idx` ON `workflow_items` (`assignee`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `workflow_steps_item_stage_idx` ON `workflow_steps` (`item_id`,`stage_key`);--> statement-breakpoint
CREATE INDEX `workflow_steps_item_position_idx` ON `workflow_steps` (`item_id`,`position`);