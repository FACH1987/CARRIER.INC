CREATE TABLE `carrier_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`type` text NOT NULL,
	`object_key` text,
	`mime` text,
	`size` integer,
	`issued_at` text,
	`expires_at` text,
	`no_expiry` integer DEFAULT false NOT NULL,
	`exemption` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`revision` text NOT NULL,
	`uploaded_at` text NOT NULL,
	`reviewed_at` text,
	`reviewed_by` text,
	`review_note` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `carrier_documents_user_idx` ON `carrier_documents` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `carrier_documents_slot_idx` ON `carrier_documents` (`user_id`,`entity_type`,`entity_id`,`type`);--> statement-breakpoint
CREATE TABLE `carrier_drivers` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`categories` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `carrier_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`legal_name` text NOT NULL,
	`consent_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `carrier_vehicles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`driver_id` text NOT NULL,
	`plate` text NOT NULL,
	`description` text NOT NULL,
	`equipment` text NOT NULL,
	`capacity_kg` real NOT NULL,
	`required_category` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`driver_id`) REFERENCES `carrier_drivers`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
ALTER TABLE `loads` ADD `transport_vehicle_id` text REFERENCES carrier_vehicles(id);--> statement-breakpoint
ALTER TABLE `loads` ADD `transport_driver_id` text REFERENCES carrier_drivers(id);