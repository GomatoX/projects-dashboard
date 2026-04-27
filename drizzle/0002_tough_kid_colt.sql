CREATE TABLE `skills` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`icon` text,
	`system_prompt` text DEFAULT '' NOT NULL,
	`context_source` text DEFAULT 'none' NOT NULL,
	`model` text DEFAULT 'claude-sonnet-4-20250514' NOT NULL,
	`output_mode` text DEFAULT 'modal' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `skills_project_id_idx` ON `skills` (`project_id`);