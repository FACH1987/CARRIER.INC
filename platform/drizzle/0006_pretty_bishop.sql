CREATE TABLE `load_notice_reads` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`load_id` text NOT NULL,
	`read_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`load_id`) REFERENCES `loads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `load_notice_reads_user_idx` ON `load_notice_reads` (`user_id`);--> statement-breakpoint
CREATE TABLE `phone_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`event_type` text NOT NULL,
	`event_id` text NOT NULL,
	`channel` text NOT NULL,
	`phone` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`provider_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `phone_deliveries_state_idx` ON `phone_deliveries` (`state`);--> statement-breakpoint
ALTER TABLE `carrier_documents` ADD `ocr_status` text DEFAULT 'not_started' NOT NULL;--> statement-breakpoint
ALTER TABLE `carrier_documents` ADD `ocr_revision` text;--> statement-breakpoint
ALTER TABLE `carrier_documents` ADD `ocr_operation_id` text;--> statement-breakpoint
ALTER TABLE `carrier_documents` ADD `ocr_summary` text;--> statement-breakpoint
ALTER TABLE `carrier_documents` ADD `ocr_updated_at` text;--> statement-breakpoint
ALTER TABLE `users` ADD `phone` text;--> statement-breakpoint
ALTER TABLE `users` ADD `phone_verified_at` text;--> statement-breakpoint
ALTER TABLE `users` ADD `phone_channel` text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `notify_loads` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `notify_documents` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `phone_consent_at` text;