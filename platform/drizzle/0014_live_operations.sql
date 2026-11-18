CREATE TABLE `load_positions` (
	`load_id` text PRIMARY KEY NOT NULL,
	`latitude` real NOT NULL,
	`longitude` real NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`load_id`) REFERENCES `loads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `support_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`from_support` integer DEFAULT false NOT NULL,
	`body` text NOT NULL,
	`created_at` text NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `support_messages_user_date` ON `support_messages` (`user_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `loads` ADD `pickup_latitude` real;--> statement-breakpoint
ALTER TABLE `loads` ADD `pickup_longitude` real;--> statement-breakpoint
ALTER TABLE `loads` ADD `corporate_extras` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `loads` ADD `delivery_signer` text;