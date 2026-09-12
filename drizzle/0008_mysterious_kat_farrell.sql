CREATE TABLE `announcement` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`audience` text DEFAULT 'participants' NOT NULL,
	`published_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "announcement_audience_check" CHECK("announcement"."audience" in ('all','participants','organizers'))
);
--> statement-breakpoint
CREATE INDEX `announcement_event_id_published_at_idx` ON `announcement` (`event_id`,`published_at`);--> statement-breakpoint
CREATE TABLE `schedule_item` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`day` integer NOT NULL,
	`start_at` integer NOT NULL,
	`end_at` integer NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`location` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "schedule_item_day_check" CHECK("schedule_item"."day" > 0),
	CONSTRAINT "schedule_item_time_check" CHECK("schedule_item"."end_at" > "schedule_item"."start_at")
);
--> statement-breakpoint
CREATE INDEX `schedule_item_event_id_day_start_at_idx` ON `schedule_item` (`event_id`,`day`,`start_at`);