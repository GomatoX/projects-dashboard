CREATE INDEX `chat_messages_chat_id_timestamp_idx` ON `chat_messages` (`chat_id`,`timestamp`);--> statement-breakpoint
CREATE INDEX `chats_project_id_updated_at_idx` ON `chats` (`project_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `code_reviews_project_id_idx` ON `code_reviews` (`project_id`);--> statement-breakpoint
CREATE INDEX `pm2_configs_project_id_idx` ON `pm2_configs` (`project_id`);--> statement-breakpoint
CREATE INDEX `projects_device_id_idx` ON `projects` (`device_id`);--> statement-breakpoint
CREATE INDEX `pull_requests_project_id_idx` ON `pull_requests` (`project_id`);