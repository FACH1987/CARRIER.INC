CREATE TABLE `loads` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`origin` text NOT NULL,
	`destination` text NOT NULL,
	`pickup_date` text NOT NULL,
	`equipment` text NOT NULL,
	`weight` real NOT NULL,
	`pay` real NOT NULL,
	`company` text NOT NULL,
	`email` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `loads_pickup_date_idx` ON `loads` (`pickup_date`);--> statement-breakpoint
CREATE INDEX `loads_owner_created_idx` ON `loads` (`owner_id`,`created_at`);