ALTER TABLE `employee_profile` ADD `default_team_id` text REFERENCES team(id);--> statement-breakpoint
CREATE INDEX `employee_profile_defaultTeamId_idx` ON `employee_profile` (`default_team_id`);