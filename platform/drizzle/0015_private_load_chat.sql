CREATE TABLE `load_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`load_id` text NOT NULL,
	`carrier_id` text NOT NULL,
	`from_carrier` integer NOT NULL,
	`body` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`load_id`) REFERENCES `loads`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`carrier_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `load_messages_thread_date` ON `load_messages` (`load_id`,`carrier_id`,`created_at`);