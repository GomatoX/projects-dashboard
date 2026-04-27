CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`chat_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`tool_uses` text DEFAULT '[]' NOT NULL,
	`proposed_changes` text DEFAULT '[]' NOT NULL,
	`attachments` text DEFAULT '[]' NOT NULL,
	`tokens_in` integer,
	`tokens_out` integer,
	`timestamp` integer NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `chats` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`title` text DEFAULT 'New Chat' NOT NULL,
	`model` text DEFAULT 'claude-sonnet-4-20250514' NOT NULL,
	`total_tokens_in` integer DEFAULT 0 NOT NULL,
	`total_tokens_out` integer DEFAULT 0 NOT NULL,
	`estimated_cost` real DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `code_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`commit_sha` text NOT NULL,
	`diff` text DEFAULT '' NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`comments` text DEFAULT '[]' NOT NULL,
	`reviewed_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `devices` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`os` text NOT NULL,
	`agent_token` text NOT NULL,
	`token_hash` text,
	`local_ip` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'offline' NOT NULL,
	`last_seen` integer,
	`project_paths` text DEFAULT '[]' NOT NULL,
	`capabilities` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `devices_token_hash_idx` ON `devices` (`token_hash`);--> statement-breakpoint
CREATE TABLE `git_settings` (
	`project_id` text PRIMARY KEY NOT NULL,
	`protected_branches` text DEFAULT '["main","master"]' NOT NULL,
	`auto_fetch_interval` integer DEFAULT 5 NOT NULL,
	`sign_commits` integer DEFAULT false NOT NULL,
	`ai_commit_messages` integer DEFAULT true NOT NULL,
	`ai_pre_commit_review` integer DEFAULT false NOT NULL,
	`default_push_behavior` text DEFAULT 'ask' NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `pm2_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`process_name` text NOT NULL,
	`raw_ecosystem` text DEFAULT '' NOT NULL,
	`env_vars` text DEFAULT '{}' NOT NULL,
	`last_modified` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `project_memory` (
	`project_id` text PRIMARY KEY NOT NULL,
	`system_prompt` text DEFAULT '' NOT NULL,
	`pinned_files` text DEFAULT '[]' NOT NULL,
	`conventions` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`architecture` text DEFAULT '' NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`device_id` text,
	`path` text NOT NULL,
	`type` text DEFAULT 'node' NOT NULL,
	`pm2_name` text,
	`github` text,
	`tags` text DEFAULT '[]' NOT NULL,
	`commands` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `pull_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`number` integer NOT NULL,
	`title` text NOT NULL,
	`state` text DEFAULT 'open' NOT NULL,
	`ai_summary` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sound_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`master_volume` real DEFAULT 0.7 NOT NULL,
	`quiet_hours_start` text DEFAULT '22:00',
	`quiet_hours_end` text DEFAULT '08:00',
	`events` text DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);