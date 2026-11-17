CREATE TABLE `bank_accounts` (
	`user_id` text PRIMARY KEY NOT NULL,
	`bank_name` text NOT NULL,
	`holder_name` text NOT NULL,
	`account_type` text NOT NULL,
	`currency` text NOT NULL,
	`encrypted_number` text NOT NULL,
	`last_four` text NOT NULL,
	`consent_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
