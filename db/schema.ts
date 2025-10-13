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
  username: varchar("username", { length: 64 }).notNull(),
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
  prompt: varchar("title", { length: 1200 }),
  description: text("description"),
  duration: integer("duration"),
  fileSize: integer("fileSize"),
  views: integer("views"),
  thumbnailUri: text("thumbnailUri"),
  status: varchar("status", { length: 32 }).notNull().default("processing"), 
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  userId: uuid("userId")
    .notNull()
    .references(() => user.id),
  author: varchar("author")
    .notNull()
    .references(() => user.username),
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
  author: string;
  userId: string;
  views: number;
  thumbnailUri: string;
  status: "processing" | "ready" | "failed";
  genre: (typeof genres)[number];
  createdAt: Date;
  updatedAt: Date;

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
    author,
    userId,
    views = 0,
    thumbnailUri = "",
    status = "processing",
    genre,
    createdAt = new Date(),
    updatedAt = new Date(),
  }: Partial<Video> & { uri: string; fileId: string; prompt: string; author: string; userId: string }) {
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
    this.genre = genre!;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }
}

export const genres = [
  "action", "romance", "cartoon", "anime", "education", "scifi", "portrait", "animals", "music", "comedy"
]