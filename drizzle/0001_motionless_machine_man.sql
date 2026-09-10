CREATE TABLE `event` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`status` text DEFAULT 'registration_open' NOT NULL,
	`registration_open_at` integer,
	`registration_close_at` integer,
	`published_at` integer,
	`settings` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "event_status_check" CHECK("event"."status" in ('registration_open','registration_closed','allocation_processing','information_published','event_started','event_completed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `event_code_uidx` ON `event` (`code`);--> statement-breakpoint
CREATE TABLE `pickup_point` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`work_location_id` text,
	`name` text NOT NULL,
	`address` text,
	`active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`work_location_id`) REFERENCES `work_location`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pickup_point_eventId_name_uidx` ON `pickup_point` (`event_id`,`name`);--> statement-breakpoint
CREATE INDEX `pickup_point_eventId_workLocationId_idx` ON `pickup_point` (`event_id`,`work_location_id`);--> statement-breakpoint
CREATE TABLE `team` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text,
	`name` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `team_eventId_name_uidx` ON `team` (`event_id`,`name`) WHERE "team"."event_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `team_shared_name_uidx` ON `team` (`name`) WHERE "team"."event_id" is null;--> statement-breakpoint
CREATE INDEX `team_eventId_idx` ON `team` (`event_id`);--> statement-breakpoint
CREATE TABLE `work_location` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `work_location_name_uidx` ON `work_location` (`name`);--> statement-breakpoint
CREATE TABLE `employee_profile` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`employee_code` text,
	`phone` text,
	`work_location_id` text,
	`gender` text DEFAULT 'undisclosed' NOT NULL,
	`special_request` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`work_location_id`) REFERENCES `work_location`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "employee_profile_gender_check" CHECK("employee_profile"."gender" in ('male','female','other','undisclosed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `employee_profile_userId_uidx` ON `employee_profile` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `employee_profile_employeeCode_uidx` ON `employee_profile` (`employee_code`) WHERE "employee_profile"."employee_code" is not null;--> statement-breakpoint
CREATE INDEX `employee_profile_workLocationId_idx` ON `employee_profile` (`work_location_id`);--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`actor_id` text,
	`actor_name` text,
	`actor_email` text,
	`entity` text NOT NULL,
	`entity_id` text NOT NULL,
	`action` text NOT NULL,
	`before` text,
	`after` text,
	`reason` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `audit_log_eventId_entity_entityId_idx` ON `audit_log` (`event_id`,`entity`,`entity_id`);--> statement-breakpoint
CREATE INDEX `audit_log_eventId_createdAt_idx` ON `audit_log` (`event_id`,`created_at`);