PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_registration` (
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
	FOREIGN KEY (`team_id`) REFERENCES `team`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "registration_participating_check" CHECK("__new_registration"."participating" in (0, 1)),
	CONSTRAINT "registration_shift_locked_check" CHECK("__new_registration"."shift_locked" in (0, 1)),
	CONSTRAINT "registration_shift_preference_check" CHECK("__new_registration"."shift_preference" is null or "__new_registration"."shift_preference" in ('shift_1', 'shift_2'))
);
--> statement-breakpoint
INSERT INTO `__new_registration`("id", "event_id", "user_id", "team_id", "participating", "agreed_terms_at", "terms_version", "shift_preference", "shift_locked", "wish_note", "submitted_at", "updated_at") SELECT "id", "event_id", "user_id", "team_id", "participating", "agreed_terms_at", "terms_version", "shift_preference", "shift_locked", "wish_note", "submitted_at", "updated_at" FROM `registration`;--> statement-breakpoint
DROP TABLE `registration`;--> statement-breakpoint
ALTER TABLE `__new_registration` RENAME TO `registration`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `registration_event_id_user_id_uidx` ON `registration` (`event_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `registration_event_id_idx` ON `registration` (`event_id`);--> statement-breakpoint
CREATE INDEX `registration_user_id_idx` ON `registration` (`user_id`);--> statement-breakpoint
CREATE INDEX `registration_team_id_idx` ON `registration` (`team_id`);--> statement-breakpoint
CREATE TABLE `__new_registration_transport_need` (
	`id` text PRIMARY KEY NOT NULL,
	`registration_id` text NOT NULL,
	`leg` text NOT NULL,
	`needed` integer NOT NULL,
	`pickup_point_id` text,
	FOREIGN KEY (`registration_id`) REFERENCES `registration`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`pickup_point_id`) REFERENCES `pickup_point`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "registration_transport_need_needed_check" CHECK("__new_registration_transport_need"."needed" in (0, 1)),
	CONSTRAINT "registration_transport_need_leg_check" CHECK("__new_registration_transport_need"."leg" in ('origin_to_airport', 'airport_to_hotel', 'hotel_to_airport', 'airport_to_origin'))
);
--> statement-breakpoint
INSERT INTO `__new_registration_transport_need`("id", "registration_id", "leg", "needed", "pickup_point_id") SELECT "id", "registration_id", "leg", "needed", "pickup_point_id" FROM `registration_transport_need`;--> statement-breakpoint
DROP TABLE `registration_transport_need`;--> statement-breakpoint
ALTER TABLE `__new_registration_transport_need` RENAME TO `registration_transport_need`;--> statement-breakpoint
CREATE UNIQUE INDEX `registration_transport_need_reg_leg_uidx` ON `registration_transport_need` (`registration_id`,`leg`);--> statement-breakpoint
CREATE INDEX `registration_transport_need_reg_id_idx` ON `registration_transport_need` (`registration_id`);--> statement-breakpoint
CREATE TABLE `__new_notification` (
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
	FOREIGN KEY (`registration_id`) REFERENCES `registration`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "notification_channel_check" CHECK("__new_notification"."channel" in ('email', 'teams', 'in_app')),
	CONSTRAINT "notification_template_check" CHECK("__new_notification"."template" in ('registration_confirmed', 'information_published', 'assignment_changed')),
	CONSTRAINT "notification_status_check" CHECK("__new_notification"."status" in ('pending', 'sent', 'failed')),
	CONSTRAINT "notification_attempts_check" CHECK("__new_notification"."attempts" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_notification`("id", "event_id", "registration_id", "channel", "template", "payload", "status", "attempts", "last_error", "scheduled_at", "sent_at") SELECT "id", "event_id", "registration_id", "channel", "template", "payload", "status", "attempts", "last_error", "scheduled_at", "sent_at" FROM `notification`;--> statement-breakpoint
DROP TABLE `notification`;--> statement-breakpoint
ALTER TABLE `__new_notification` RENAME TO `notification`;--> statement-breakpoint
CREATE INDEX `notification_status_scheduled_idx` ON `notification` (`status`,`scheduled_at`);--> statement-breakpoint
CREATE INDEX `notification_event_id_idx` ON `notification` (`event_id`);--> statement-breakpoint
CREATE INDEX `notification_reg_id_idx` ON `notification` (`registration_id`);