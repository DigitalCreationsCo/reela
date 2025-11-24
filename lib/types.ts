import { InferSelectModel } from "drizzle-orm";
import { video } from "@/db/schema";
import { generateUUID } from "./utils";

export type VideoGenerationStatus = 'idle' | 'initiating' | 'generating' | 'retrieving' | 'ready' | 'downloading' | 'complete' | 'error';

export type AttachmentType = {
    contentType: string;
    url: string;
    pathname: string;
    pointer: string;
};

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
  generatedFileName: string;
  chatId: string | null;

  constructor({
    id,
    uri,
    prompt,
    fileId,
    generatedFileName,
    chatId = null,
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
    chainOrder = null, // New field,
  }: Partial<Video> & { uri: string; fileId: string; prompt: string; generatedFileName: string }) { // userId and author are now optional in constructor
    this.id = id ?? generateUUID();
    this.uri = uri;
    this.chatId = chatId;
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
    this.generatedFileName = generatedFileName!;
  }
}

export const genres = [
  "action", "romance", "cartoon", "anime", "education", "scifi", "portrait", "animals", "music", "comedy"
];