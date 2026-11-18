CREATE TABLE `carrier_ratings` (
	`load_id` text PRIMARY KEY NOT NULL,
	`carrier_id` text NOT NULL,
	`score` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`load_id`) REFERENCES `loads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`carrier_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `carrier_ratings_carrier` ON `carrier_ratings` (`carrier_id`);--> statement-breakpoint
ALTER TABLE `loads` ADD `customer_type` text;--> statement-breakpoint
ALTER TABLE `loads` ADD `visibility` text DEFAULT 'estandar' NOT NULL;