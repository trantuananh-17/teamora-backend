PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text,
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
INSERT INTO `__new_audit_log`("id", "event_id", "actor_id", "actor_name", "actor_email", "entity", "entity_id", "action", "before", "after", "reason", "created_at") SELECT "id", "event_id", "actor_id", "actor_name", "actor_email", "entity", "entity_id", "action", "before", "after", "reason", "created_at" FROM `audit_log`;--> statement-breakpoint
DROP TABLE `audit_log`;--> statement-breakpoint
ALTER TABLE `__new_audit_log` RENAME TO `audit_log`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `audit_log_eventId_entity_entityId_idx` ON `audit_log` (`event_id`,`entity`,`entity_id`);--> statement-breakpoint
CREATE INDEX `audit_log_eventId_createdAt_idx` ON `audit_log` (`event_id`,`created_at`);