CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `certificates` (
	`code` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`module_id` text NOT NULL,
	`title` text NOT NULL,
	`full_name` text NOT NULL,
	`workload_minutes` integer NOT NULL,
	`version` text NOT NULL,
	`status` text DEFAULT 'valido' NOT NULL,
	`issued_by` text NOT NULL,
	`issued_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `content_files` (
	`id` text PRIMARY KEY NOT NULL,
	`uploaded_by` text NOT NULL,
	`lesson_id` text,
	`module_id` text,
	`kind` text NOT NULL,
	`object_key` text NOT NULL,
	`filename` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `content_files_lesson_idx` ON `content_files` (`lesson_id`,`kind`,`created_at`);--> statement-breakpoint
CREATE TABLE `lesson_content` (
	`lesson_id` text PRIMARY KEY NOT NULL,
	`video_url` text,
	`video_file_id` text,
	`handouts_json` text DEFAULT '[]' NOT NULL,
	`handout_file_ids_json` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'em_producao' NOT NULL,
	`author` text,
	`reviewer` text,
	`due_date` text,
	`pending_notes` text,
	`updated_by` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `practice_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`module_id` text NOT NULL,
	`submission_number` integer NOT NULL,
	`response_text` text NOT NULL,
	`file_ids_json` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'enviada' NOT NULL,
	`score` integer,
	`rubric_json` text,
	`critical_issue` integer DEFAULT 0 NOT NULL,
	`feedback` text,
	`reviewed_by` text,
	`reviewed_at` text,
	`submitted_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `practice_user_module_idx` ON `practice_submissions` (`user_id`,`module_id`,`submitted_at`);--> statement-breakpoint
CREATE INDEX `practice_review_queue_idx` ON `practice_submissions` (`status`,`submitted_at`);--> statement-breakpoint
CREATE TABLE `lesson_progress` (
	`user_id` text NOT NULL,
	`lesson_id` text NOT NULL,
	`consulted_at` text NOT NULL,
	`completed_at` text,
	PRIMARY KEY(`user_id`, `lesson_id`)
);
--> statement-breakpoint
CREATE TABLE `quiz_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`module_id` text NOT NULL,
	`cycle` integer DEFAULT 1 NOT NULL,
	`version` text NOT NULL,
	`answers_json` text NOT NULL,
	`score` integer NOT NULL,
	`total` integer DEFAULT 5 NOT NULL,
	`passed` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `quiz_attempts_user_module_idx` ON `quiz_attempts` (`user_id`,`module_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `quiz_cycles` (
	`user_id` text NOT NULL,
	`module_id` text NOT NULL,
	`cycle` integer DEFAULT 1 NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`user_id`, `module_id`)
);
--> statement-breakpoint
CREATE TABLE `upload_parts` (
	`upload_id` text NOT NULL,
	`part_number` integer NOT NULL,
	`etag` text NOT NULL,
	PRIMARY KEY(`upload_id`, `part_number`)
);
--> statement-breakpoint
CREATE TABLE `uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`lesson_id` text,
	`module_id` text,
	`kind` text NOT NULL,
	`object_key` text NOT NULL,
	`multipart_id` text NOT NULL,
	`filename` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text DEFAULT 'learner' NOT NULL,
	`job_path` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
