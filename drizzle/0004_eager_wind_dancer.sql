CREATE TABLE `registration` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`user_id` text NOT NULL,
	`team_id` text NOT NULL,
	`participating` integer NOT NULL,
	`agreed_terms_at` integer,
	`terms_version` text,
	`shift_preference` text,
	`shift_locked` integer DEFAULT false NOT NULL,
	`wish_note` text,
	`submitted_at` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`team_id`) REFERENCES `team`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `registration_event_id_user_id_uidx` ON `registration` (`event_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `registration_event_id_idx` ON `registration` (`event_id`);--> statement-breakpoint
CREATE INDEX `registration_user_id_idx` ON `registration` (`user_id`);--> statement-breakpoint
CREATE INDEX `registration_team_id_idx` ON `registration` (`team_id`);--> statement-breakpoint
CREATE TABLE `registration_transport_need` (
	`id` text PRIMARY KEY NOT NULL,
	`registration_id` text NOT NULL,
	`leg` text NOT NULL,
	`needed` integer NOT NULL,
	`pickup_point_id` text,
	FOREIGN KEY (`registration_id`) REFERENCES `registration`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`pickup_point_id`) REFERENCES `pickup_point`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `registration_transport_need_reg_leg_uidx` ON `registration_transport_need` (`registration_id`,`leg`);--> statement-breakpoint
CREATE INDEX `registration_transport_need_reg_id_idx` ON `registration_transport_need` (`registration_id`);--> statement-breakpoint
CREATE TABLE `notification` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`registration_id` text,
	`channel` text NOT NULL,
	`template` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`scheduled_at` integer NOT NULL,
	`sent_at` integer,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`registration_id`) REFERENCES `registration`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notification_status_scheduled_idx` ON `notification` (`status`,`scheduled_at`);--> statement-breakpoint
CREATE INDEX `notification_event_id_idx` ON `notification` (`event_id`);--> statement-breakpoint
CREATE INDEX `notification_reg_id_idx` ON `notification` (`registration_id`);