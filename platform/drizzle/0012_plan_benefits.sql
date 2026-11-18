CREATE TABLE `load_publications` (
	`load_id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `load_publications_owner_date` ON `load_publications` (`owner_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `load_quotes` (
	`id` text PRIMARY KEY NOT NULL,
	`load_id` text NOT NULL,
	`carrier_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`created_at` text NOT NULL,
	`priority` integer NOT NULL,
	FOREIGN KEY (`carrier_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `load_quotes_carrier_load` ON `load_quotes` (`carrier_id`,`load_id`);--> statement-breakpoint
CREATE INDEX `load_quotes_carrier_date` ON `load_quotes` (`carrier_id`,`created_at`);
--> statement-breakpoint
INSERT INTO load_publications (load_id, owner_id, created_at)
SELECT id, owner_id, created_at FROM loads;
--> statement-breakpoint
CREATE TRIGGER load_publications_after_insert AFTER INSERT ON loads
BEGIN
  INSERT INTO load_publications (load_id, owner_id, created_at)
  VALUES (NEW.id, NEW.owner_id, NEW.created_at);
END;
