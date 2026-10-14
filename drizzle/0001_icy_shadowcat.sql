CREATE TABLE `corpus_files` (
	`path` text PRIMARY KEY NOT NULL,
	`sha256` text NOT NULL,
	`byte_size` integer NOT NULL,
	`char_count` integer,
	`doc_type` text NOT NULL,
	`source_path` text,
	`title` text NOT NULL,
	`r2_key` text NOT NULL,
	`verified` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE `documents` ADD `sha256` text;