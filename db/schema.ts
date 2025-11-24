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
  genre: varchar("genre", { length: 64 }),
});

export type Chat = Omit<InferSelectModel<typeof chat>, "messages"> & {
  messages: Array<Message>;
};

export const reservation = pgTable("Reservation", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  createdAt: timestamp("createdAt").notNull(),
  details: json("details").notNull(),
  userId: uuid("userId")
  .notNull()
  .references(() => user.id),
  hasCompletedPayment: boolean("hasCompletedPayment").notNull().default(false),
});

export type Reservation = InferSelectModel<typeof reservation>;


export const video = pgTable("Video", {
  id: uuid("id").primaryKey().notNull().defaultRandom(),
  fileId: varchar("fileId", { length: 40 }).notNull(),
  generatedFileName: text("generatedFileName").notNull(),
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
  chatId: uuid("chatId"),
  author: varchar("author", { length: 64 }), // Stores the username as a string (denormalized for performance), now optional
  expiresAt: timestamp("expiresAt"), // New field for video expiration
  isTemporary: boolean("isTemporary").notNull().default(false), // New field to mark temporary videos
  parentId: uuid("parentId"), // New field for chaining videos
  chainOrder: integer("chainOrder"), // New field for ordering videos in a chain
});