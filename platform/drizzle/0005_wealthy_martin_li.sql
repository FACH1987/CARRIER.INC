CREATE TABLE `carrier_notice_reads` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`document_id` text NOT NULL,
	`read_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`document_id`) REFERENCES `carrier_documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `carrier_notice_reads_user_idx` ON `carrier_notice_reads` (`user_id`);