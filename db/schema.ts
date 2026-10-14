import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, index, unique, check } from 'drizzle-orm/sqlite-core';
export const documents = sqliteTable('documents', {
 id: integer('id').primaryKey(), docType: text('doc_type').notNull(), path: text('path').notNull(), sourcePath: text('source_path'), title: text('title').notNull(), startOffset: integer('start_offset'), endOffset: integer('end_offset'), content: text('content').notNull(), sha256: text('sha256'),
}, t => [index('documents_type_id').on(t.docType,t.id), index('documents_source').on(t.docType,t.sourcePath), check('documents_doc_type_check',sql`${t.docType} IN ('summary','raw')`)]);
export const meta = sqliteTable('meta', {key:text('key').primaryKey(),value:text('value').notNull()});
export const corpusFiles = sqliteTable('corpus_files', {
 path:text('path').primaryKey(), sha256:text('sha256').notNull(), byteSize:integer('byte_size').notNull(), charCount:integer('char_count'), docType:text('doc_type').notNull(), sourcePath:text('source_path'), title:text('title').notNull(), r2Key:text('r2_key').notNull(), verified:integer('verified').notNull().default(0),
});
export const memories = sqliteTable('memories', {
 id:text('id').primaryKey(),owner:text('owner').notNull(),memoryKey:text('memory_key').notNull(),content:text('content').notNull(),category:text('category').notNull(),tags:text('tags').notNull().default('[]'),pinned:integer('pinned').notNull().default(0),sourceQuote:text('source_quote').notNull(),consent:text('consent').notNull(),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull(),version:integer('version').notNull().default(1),
},t=>[unique('memories_owner_key').on(t.owner,t.memoryKey),index('memories_owner_time').on(t.owner,t.updatedAt),check('memories_category_check',sql`${t.category} IN ('preference','fact','project','interaction','roleplay')`)]);
