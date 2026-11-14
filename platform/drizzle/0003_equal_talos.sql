CREATE TABLE `commissions` (
	`id` text PRIMARY KEY NOT NULL,
	`load_id` text NOT NULL,
	`payer_id` text NOT NULL,
	`carrier_id` text NOT NULL,
	`fare_cents` integer NOT NULL,
	`rate_bps` integer NOT NULL,
	`amount_cents` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	`paid_at` text,
	`payment_reference` text,
	`recorded_by` text,
	FOREIGN KEY (`load_id`) REFERENCES `loads`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`payer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`carrier_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`recorded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `commissions_load_id_unique` ON `commissions` (`load_id`);--> statement-breakpoint
CREATE INDEX `commissions_status_idx` ON `commissions` (`status`);--> statement-breakpoint
CREATE INDEX `commissions_payer_idx` ON `commissions` (`payer_id`);--> statement-breakpoint
ALTER TABLE `loads` ADD `status` text DEFAULT 'disponible' NOT NULL;--> statement-breakpoint
ALTER TABLE `loads` ADD `carrier_id` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `loads` ADD `assigned_at` text;--> statement-breakpoint
ALTER TABLE `loads` ADD `accepted_at` text;--> statement-breakpoint
ALTER TABLE `loads` ADD `delivered_at` text;--> statement-breakpoint
ALTER TABLE `loads` ADD `completed_at` text;--> statement-breakpoint
ALTER TABLE `loads` ADD `fee_rate_bps` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `loads` ADD `fee_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `loads` ADD `fee_accepted_at` text;