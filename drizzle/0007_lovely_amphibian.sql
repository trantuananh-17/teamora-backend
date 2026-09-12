CREATE TABLE `vehicle` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`capacity` integer NOT NULL,
	`leg` text NOT NULL,
	`gather_at` integer NOT NULL,
	`depart_at` integer NOT NULL,
	`pickup_point_id` text,
	`destination` text NOT NULL,
	`leader_name` text,
	`leader_phone` text,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`pickup_point_id`) REFERENCES `pickup_point`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "vehicle_capacity_check" CHECK("vehicle"."capacity" >= 0),
	CONSTRAINT "vehicle_time_check" CHECK("vehicle"."depart_at" >= "vehicle"."gather_at"),
	CONSTRAINT "vehicle_leg_check" CHECK("vehicle"."leg" in ('origin_to_airport', 'airport_to_hotel', 'hotel_to_airport', 'airport_to_origin'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vehicle_event_id_code_leg_uidx` ON `vehicle` (`event_id`,`code`,`leg`);--> statement-breakpoint
CREATE INDEX `vehicle_event_id_leg_depart_at_idx` ON `vehicle` (`event_id`,`leg`,`depart_at`);--> statement-breakpoint
CREATE INDEX `vehicle_event_id_pickup_point_id_idx` ON `vehicle` (`event_id`,`pickup_point_id`);--> statement-breakpoint
CREATE TABLE `vehicle_assignment` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`vehicle_id` text NOT NULL,
	`registration_id` text NOT NULL,
	`leg` text NOT NULL,
	`source` text NOT NULL,
	`locked` integer DEFAULT false NOT NULL,
	`flags` text DEFAULT '[]' NOT NULL,
	`allocation_run_id` text,
	`assigned_by` text,
	`assigned_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`vehicle_id`) REFERENCES `vehicle`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`registration_id`) REFERENCES `registration`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`allocation_run_id`) REFERENCES `allocation_run`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`assigned_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "vehicle_assignment_source_check" CHECK("vehicle_assignment"."source" in ('auto', 'manual')),
	CONSTRAINT "vehicle_assignment_locked_check" CHECK("vehicle_assignment"."locked" in (0, 1)),
	CONSTRAINT "vehicle_assignment_leg_check" CHECK("vehicle_assignment"."leg" in ('origin_to_airport', 'airport_to_hotel', 'hotel_to_airport', 'airport_to_origin'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vehicle_assignment_registration_id_leg_uidx` ON `vehicle_assignment` (`registration_id`,`leg`);--> statement-breakpoint
CREATE INDEX `vehicle_assignment_event_id_vehicle_id_idx` ON `vehicle_assignment` (`event_id`,`vehicle_id`);--> statement-breakpoint
CREATE INDEX `vehicle_assignment_event_id_leg_idx` ON `vehicle_assignment` (`event_id`,`leg`);--> statement-breakpoint
CREATE TABLE `hotel` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`name` text NOT NULL,
	`address` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hotel_event_id_name_uidx` ON `hotel` (`event_id`,`name`);--> statement-breakpoint
CREATE INDEX `hotel_event_id_idx` ON `hotel` (`event_id`);--> statement-breakpoint
CREATE TABLE `room` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`hotel_id` text NOT NULL,
	`room_type_id` text NOT NULL,
	`code` text NOT NULL,
	`capacity` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`hotel_id`) REFERENCES `hotel`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`room_type_id`) REFERENCES `room_type`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "room_capacity_check" CHECK("room"."capacity" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `room_hotel_id_code_uidx` ON `room` (`hotel_id`,`code`);--> statement-breakpoint
CREATE INDEX `room_event_id_hotel_id_idx` ON `room` (`event_id`,`hotel_id`);--> statement-breakpoint
CREATE INDEX `room_event_id_room_type_id_idx` ON `room` (`event_id`,`room_type_id`);--> statement-breakpoint
CREATE TABLE `room_assignment` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`room_id` text NOT NULL,
	`registration_id` text NOT NULL,
	`source` text NOT NULL,
	`locked` integer DEFAULT false NOT NULL,
	`assigned_by` text,
	`assigned_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`room_id`) REFERENCES `room`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`registration_id`) REFERENCES `registration`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assigned_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "room_assignment_source_check" CHECK("room_assignment"."source" in ('import', 'manual', 'auto')),
	CONSTRAINT "room_assignment_locked_check" CHECK("room_assignment"."locked" in (0, 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `room_assignment_registration_id_uidx` ON `room_assignment` (`registration_id`);--> statement-breakpoint
CREATE INDEX `room_assignment_event_id_room_id_idx` ON `room_assignment` (`event_id`,`room_id`);--> statement-breakpoint
CREATE TABLE `room_type` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`hotel_id` text NOT NULL,
	`name` text NOT NULL,
	`capacity` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `event`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`hotel_id`) REFERENCES `hotel`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "room_type_capacity_check" CHECK("room_type"."capacity" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `room_type_hotel_id_name_uidx` ON `room_type` (`hotel_id`,`name`);--> statement-breakpoint
CREATE INDEX `room_type_event_id_hotel_id_idx` ON `room_type` (`event_id`,`hotel_id`);