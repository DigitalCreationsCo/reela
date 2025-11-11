import { generateUUID } from "@/lib/utils";
import { Message } from "ai";
import { InferSelectModel } from "drizzle-orm";
import {
  pgTable,
  varchar,
  timestamp,
  json,
  uuid,
  boolean,
  integer,
  text,
} from "drizzle-orm/pg-core";

export const user = pgTable("User", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  email: varchar("email", { length: 64 }).notNull(),
  name: varchar("name", { length: 64 }).notNull(),
  username: varchar("username", { length: 32 }).notNull().unique(),
  password: varchar("password", { length: 64 }),
});

export type User = InferSelectModel<typeof user>;

export const chat = pgTable("Chat", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  createdAt: timestamp("createdAt").notNull(),
  messages: json("messages").notNull(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id),
});

export type Chat = Omit<InferSelectModel<typeof chat>, "messages"> & {
  messages: Array<Message>;
};

export const reservation = pgTable("Reservation", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  createdAt: timestamp("createdAt").notNull(),
  details: json("details").notNull(),
  hasCompletedPayment: boolean("hasCompletedPayment").notNull().default(false),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id),
});

export type Reservation = InferSelectModel<typeof reservation>;

export const video = pgTable("Video", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  fileId: varchar("fileId", { length: 40 }).notNull(),
  uri: text("uri").notNull(),
  downloadUri: text("downloadUri"),
  metadata: json("metadata"),
  genre: varchar("genre", { length: 64 }), 
  format: varchar("format", { length: 32 }),
  title: varchar("title", { length: 255 }),
  prompt: varchar("prompt", { length: 1200 }),
  description: text("description"),
  duration: integer("duration"),
  fileSize: integer("fileSize"),
  views: integer("views"),
  thumbnailUri: text("thumbnailUri"),
  status: varchar("status", { length: 32 }).notNull().default("processing"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  userId: uuid("userId")
    .references(() => user.id), // Foreign key reference to User table, now optional
  author: varchar("author", { length: 64 }), // Stores the username as a string (denormalized for performance), now optional
  expiresAt: timestamp("expiresAt"), // New field for video expiration
  isTemporary: boolean("isTemporary").notNull().default(false), // New field to mark temporary videos
  parentId: uuid("parentId"), // New field for chaining videos
  chainOrder: integer("chainOrder"), // New field for ordering videos in a chain
});

export class Video implements InferSelectModel<typeof video> {
  id: string;
  uri: string;
  fileId: string;
  downloadUri: string | null;
  metadata: unknown;
  format: string | null;
  title: string | null;
  prompt: string;
  description: string | null;
  duration: number | null;
  fileSize: number | null;
  author: string | null; // Now optional
  userId: string | null; // Now optional
  views: number;
  thumbnailUri: string;
  status: "processing" | "ready" | "failed";
  genre: (typeof genres)[number] | null; // Made optional
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date | null; // New field
  isTemporary: boolean; // New field
  parentId: string | null; // New field for chaining videos
  chainOrder: number | null; // New field for ordering videos in a chain

  constructor({
    id,
    uri,
    prompt,
    fileId,
    downloadUri = null,
    metadata = null,
    format = null,
    title = null,
    description = null,
    duration = null,
    fileSize = null,
    author = null, // Now optional
    userId = null, // Now optional
    views = 0,
    thumbnailUri = "",
    status = "processing",
    genre = null, // Made optional
    createdAt = new Date(),
    updatedAt = new Date(),
    expiresAt = null, // New field
    isTemporary = false, // New field
    parentId = null, // New field
    chainOrder = null, // New field
  }: Partial<Video> & { uri: string; fileId: string; prompt: string }) { // userId and author are now optional in constructor
    this.id = id ?? generateUUID();
    this.uri = uri;
    this.fileId = fileId;
    this.downloadUri = downloadUri;
    this.metadata = metadata;
    this.format = format;
    this.title = title;
    this.prompt = prompt!;
    this.description = description;
    this.duration = duration;
    this.fileSize = fileSize;
    this.author = author;
    this.userId = userId;
    this.views = views;
    this.thumbnailUri = thumbnailUri;
    this.status = status;
    this.genre = genre; // Assign new field
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.expiresAt = expiresAt; // Assign new field
    this.isTemporary = isTemporary; // Assign new field
    this.parentId = parentId; // Assign new field
    this.chainOrder = chainOrder; // Assign new field
  }
}

export const genres = [
  "action", "romance", "cartoon", "anime", "education", "scifi", "portrait", "animals", "music", "comedy"
]
