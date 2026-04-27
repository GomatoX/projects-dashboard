CREATE TABLE `chat_stream_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`chat_id` text NOT NULL,
	`seq` integer NOT NULL,
	`data` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `chat_stream_journals`(`chat_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chat_stream_events_chat_id_seq_idx` ON `chat_stream_events` (`chat_id`,`seq`);--> statement-breakpoint
CREATE TABLE `chat_stream_journals` (
	`chat_id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`next_seq` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`chat_id`) REFERENCES `chats`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `chat_messages` ADD `execution_mode` text;--> statement-breakpoint
ALTER TABLE `chats` ADD `execution_mode` text DEFAULT 'local' NOT NULL;