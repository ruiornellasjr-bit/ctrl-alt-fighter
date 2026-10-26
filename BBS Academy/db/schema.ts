// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
export {};
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  role: text("role").notNull().default("learner"),
  jobPath: text("job_path"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const lessonContent = sqliteTable("lesson_content", {
  lessonId: text("lesson_id").primaryKey(),
  videoUrl: text("video_url"),
  videoFileId: text("video_file_id"),
  handoutsJson: text("handouts_json").notNull().default("[]"),
  handoutFileIdsJson: text("handout_file_ids_json").notNull().default("[]"),
  status: text("status").notNull().default("em_producao"),
  author: text("author"),
  reviewer: text("reviewer"),
  dueDate: text("due_date"),
  pendingNotes: text("pending_notes"),
  updatedBy: text("updated_by").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const progress = sqliteTable(
  "lesson_progress",
  {
    userId: text("user_id").notNull(),
    lessonId: text("lesson_id").notNull(),
    consultedAt: text("consulted_at").notNull(),
    completedAt: text("completed_at"),
  },
  (table) => [primaryKey({ columns: [table.userId, table.lessonId] })],
);

export const quizAttempts = sqliteTable(
  "quiz_attempts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    moduleId: text("module_id").notNull(),
    cycle: integer("cycle").notNull().default(1),
    version: text("version").notNull(),
    answersJson: text("answers_json").notNull(),
    score: integer("score").notNull(),
    total: integer("total").notNull().default(5),
    passed: integer("passed").notNull().default(0),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("quiz_attempts_user_module_idx").on(table.userId, table.moduleId, table.createdAt),
  ],
);

export const quizCycles = sqliteTable(
  "quiz_cycles",
  {
    userId: text("user_id").notNull(),
    moduleId: text("module_id").notNull(),
    cycle: integer("cycle").notNull().default(1),
    updatedBy: text("updated_by").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.moduleId] })],
);

export const practiceSubmissions = sqliteTable(
  "practice_submissions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    moduleId: text("module_id").notNull(),
    submissionNumber: integer("submission_number").notNull(),
    responseText: text("response_text").notNull(),
    fileIdsJson: text("file_ids_json").notNull().default("[]"),
    status: text("status").notNull().default("enviada"),
    score: integer("score"),
    rubricJson: text("rubric_json"),
    criticalIssue: integer("critical_issue").notNull().default(0),
    feedback: text("feedback"),
    reviewedBy: text("reviewed_by"),
    reviewedAt: text("reviewed_at"),
    submittedAt: text("submitted_at").notNull(),
  },
  (table) => [
    index("practice_user_module_idx").on(table.userId, table.moduleId, table.submittedAt),
    index("practice_review_queue_idx").on(table.status, table.submittedAt),
  ],
);

export const certificates = sqliteTable("certificates", {
  code: text("code").primaryKey(),
  userId: text("user_id").notNull(),
  moduleId: text("module_id").notNull(),
  title: text("title").notNull(),
  fullName: text("full_name").notNull(),
  workloadMinutes: integer("workload_minutes").notNull(),
  version: text("version").notNull(),
  status: text("status").notNull().default("valido"),
  issuedBy: text("issued_by").notNull(),
  issuedAt: text("issued_at").notNull(),
});

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedBy: text("updated_by").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const uploads = sqliteTable("uploads", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  lessonId: text("lesson_id"),
  moduleId: text("module_id"),
  kind: text("kind").notNull(),
  objectKey: text("object_key").notNull(),
  multipartId: text("multipart_id").notNull(),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  createdAt: text("created_at").notNull(),
});

export const uploadParts = sqliteTable(
  "upload_parts",
  {
    uploadId: text("upload_id").notNull(),
    partNumber: integer("part_number").notNull(),
    etag: text("etag").notNull(),
  },
  (table) => [primaryKey({ columns: [table.uploadId, table.partNumber] })],
);

export const contentFiles = sqliteTable(
  "content_files",
  {
    id: text("id").primaryKey(),
    uploadedBy: text("uploaded_by").notNull(),
    lessonId: text("lesson_id"),
    moduleId: text("module_id"),
    kind: text("kind").notNull(),
    objectKey: text("object_key").notNull(),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("content_files_lesson_idx").on(table.lessonId, table.kind, table.createdAt),
  ],
);
