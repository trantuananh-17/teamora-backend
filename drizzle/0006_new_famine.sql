CREATE TABLE `allocation_run` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'preview' NOT NULL,
	`params` text NOT NULL,
	`stats` text NOT NULL,
	`plan` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`committed_at` integer,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "allocation_run_type_check" CHECK("allocation_run"."type" in ('flight', 'vehicle', 'room', 'gala')),
	CONSTRAINT "allocation_run_status_check" CHECK("allocation_run"."status" in ('preview', 'committed', 'discarded'))
);
--> statement-breakpoint
CREATE INDEX `allocation_run_event_id_type_created_at_idx` ON `allocation_run` (`event_id`,`type`,`created_at`);--> statement-breakpoint
CREATE TABLE `flight` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`code` text NOT NULL,
	`direction` text NOT NULL,
	`depart_at` integer NOT NULL,
	`arrive_at` integer NOT NULL,
	`from_airport` text NOT NULL,
	`to_airport` text NOT NULL,
	`capacity` integer NOT NULL,
	`shift` text,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "flight_direction_check" CHECK("flight"."direction" in ('outbound', 'return')),
	CONSTRAINT "flight_shift_check" CHECK("flight"."shift" is null or "flight"."shift" in ('shift_1', 'shift_2')),
	CONSTRAINT "flight_capacity_check" CHECK("flight"."capacity" >= 0),
	CONSTRAINT "flight_time_check" CHECK("flight"."arrive_at" > "flight"."depart_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `flight_event_id_code_direction_uidx` ON `flight` (`event_id`,`code`,`direction`);--> statement-breakpoint
CREATE INDEX `flight_event_id_direction_depart_at_idx` ON `flight` (`event_id`,`direction`,`depart_at`);--> statement-breakpoint
CREATE TABLE `flight_assignment` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`flight_id` text NOT NULL,
	`registration_id` text NOT NULL,
	`direction` text NOT NULL,
	`source` text NOT NULL,
	`locked` integer DEFAULT false NOT NULL,
	`flags` text DEFAULT '[]' NOT NULL,
	`allocation_run_id` text,
	`assigned_by` text,
	`assigned_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`flight_id`) REFERENCES `flight`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`registration_id`) REFERENCES `registration`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`allocation_run_id`) REFERENCES `allocation_run`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`assigned_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "flight_assignment_direction_check" CHECK("flight_assignment"."direction" in ('outbound', 'return')),
	CONSTRAINT "flight_assignment_source_check" CHECK("flight_assignment"."source" in ('auto', 'manual')),
	CONSTRAINT "flight_assignment_locked_check" CHECK("flight_assignment"."locked" in (0, 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `flight_assignment_registration_id_direction_uidx` ON `flight_assignment` (`registration_id`,`direction`);--> statement-breakpoint
CREATE INDEX `flight_assignment_event_id_flight_id_idx` ON `flight_assignment` (`event_id`,`flight_id`);--> statement-breakpoint
CREATE INDEX `flight_assignment_event_id_direction_idx` ON `flight_assignment` (`event_id`,`direction`);