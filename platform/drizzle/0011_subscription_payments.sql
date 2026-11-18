CREATE TABLE `subscription_payments` (
	`reference` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`plan` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`created_at` text NOT NULL,
	`verified_at` text,
	`verified_by` text,
	`bank_reference` text,
	`starts_at` text,
	`ends_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`verified_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscription_payments_bank_reference_unique` ON `subscription_payments` (`bank_reference`);--> statement-breakpoint
CREATE UNIQUE INDEX `subscription_one_pending` ON `subscription_payments` (`user_id`) WHERE "subscription_payments"."verified_at" IS NULL;--> statement-breakpoint
CREATE INDEX `subscription_user_period` ON `subscription_payments` (`user_id`,`ends_at`);