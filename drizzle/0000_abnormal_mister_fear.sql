CREATE TABLE `documents` (
	`id` integer PRIMARY KEY NOT NULL,
	`doc_type` text NOT NULL,
	`path` text NOT NULL,
	`source_path` text,
	`title` text NOT NULL,
	`start_offset` integer,
	`end_offset` integer,
	`content` text NOT NULL,
	CONSTRAINT "documents_doc_type_check" CHECK("documents"."doc_type" IN ('summary','raw'))
);
--> statement-breakpoint
CREATE INDEX `documents_type_id` ON `documents` (`doc_type`,`id`);--> statement-breakpoint
CREATE INDEX `documents_source` ON `documents` (`doc_type`,`source_path`);--> statement-breakpoint
CREATE TABLE `memories` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`memory_key` text NOT NULL,
	`content` text NOT NULL,
	`category` text NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`pinned` integer DEFAULT 0 NOT NULL,
	`source_quote` text NOT NULL,
	`consent` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	CONSTRAINT "memories_category_check" CHECK("memories"."category" IN ('preference','fact','project','interaction','roleplay'))
);
--> statement-breakpoint
CREATE INDEX `memories_owner_time` ON `memories` (`owner`,`updated_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `memories_owner_key` ON `memories` (`owner`,`memory_key`);--> statement-breakpoint
CREATE TABLE `meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
