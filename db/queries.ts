import "server-only";

import { genSaltSync, hashSync } from "bcrypt-ts";
import { desc, eq, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { user, chat, User, reservation, video, Video, genres } from "./schema";

// Optionally, if not using email/pass login, you can
// use the Drizzle adapter for Auth.js / NextAuth
// https://authjs.dev/reference/adapter/drizzle
let client = postgres(`${process.env.POSTGRES_URL!}?sslmode=require`);
let db = drizzle(client);

export async function getUser(email: string): Promise<Array<User>> {
  try {
    return await db.select().from(user).where(eq(user.email, email));
  } catch (error) {
    console.error("Failed to get user from database");
    throw error;
  }
}

export async function createUser(newUser: typeof user.$inferInsert) {
  let salt = genSaltSync(10);
  let hash = hashSync(newUser.password!, salt);
  try {
    return await db.insert(user).values({ ...user, password: hash } as unknown as typeof user.$inferInsert);
  } catch (error) {
    console.error("Failed to create user in database");
    throw error;
  }
}

export async function saveChat({
  id,
  messages,
  userId,
}: {
  id: string;
  messages: any;
  userId: string;
}) {
  try {
    const selectedChats = await db.select().from(chat).where(eq(chat.id, id));

    if (selectedChats.length > 0) {
      return await db
        .update(chat)
        .set({
          messages: JSON.stringify(messages),
        })
        .where(eq(chat.id, id));
    }

    return await db.insert(chat).values({
      id,
      createdAt: new Date(),
      messages: JSON.stringify(messages),
      userId,
    });
  } catch (error) {
    console.error("Failed to save chat in database");
    throw error;
  }
}

export async function deleteChatById({ id }: { id: string }) {
  try {
    return await db.delete(chat).where(eq(chat.id, id));
  } catch (error) {
    console.error("Failed to delete chat by id from database");
    throw error;
  }
}

export async function getChatsByUserId({ id }: { id: string }) {
  try {
    return await db
      .select()
      .from(chat)
      .where(eq(chat.userId, id))
      .orderBy(desc(chat.createdAt));
  } catch (error) {
    console.error("Failed to get chats by user from database");
    throw error;
  }
}

export async function getChatById({ id }: { id: string }) {
  try {
    const [selectedChat] = await db.select().from(chat).where(eq(chat.id, id));
    return selectedChat;
  } catch (error) {
    console.error("Failed to get chat by id from database");
    throw error;
  }
}

export async function createReservation({
  id,
  userId,
  details,
}: {
  id: string;
  userId: string;
  details: any;
}) {
  return await db.insert(reservation).values({
    id,
    createdAt: new Date(),
    userId,
    hasCompletedPayment: false,
    details: JSON.stringify(details),
  });
}

export async function getReservationById({ id }: { id: string }) {
  const [selectedReservation] = await db
    .select()
    .from(reservation)
    .where(eq(reservation.id, id));

  return selectedReservation;
}

export async function updateReservation({
  id,
  hasCompletedPayment,
}: {
  id: string;
  hasCompletedPayment: boolean;
}) {
  return await db
    .update(reservation)
    .set({
      hasCompletedPayment,
    })
    .where(eq(reservation.id, id));
}

// Video CRUD operations

export async function insertVideo(newVideo: Video) {
  try {
    const result = await db.insert(video).values(newVideo).returning();
    return result[0];
  } catch (error) {
    console.error("Failed to insert video into database");
    throw error;
  }
}

export async function saveVideo(videoData: {
  uri: string;
  fileId: string;
  prompt: string;
  userId?: string; // Make userId optional
  genre?: (typeof genres)[number];
  title?: string;
  description?: string;
  format?: string;
  duration?: number;
  fileSize?: number;
  thumbnailUri?: string;
  status?: "processing" | "ready" | "failed";
  expiresAt?: Date | null; // Add expiresAt
  isTemporary?: boolean; // Add isTemporary
  parentId?: string | null; // Add parentId
  chainOrder?: number | null; // Add chainOrder
}) {
  let username: string | null = null;
  if (videoData.userId) {
    const userData = await db.select({ username: user.username })
      .from(user)
      .where(eq(user.id, videoData.userId))
      .limit(1);
    
    if (!userData.length) {
      throw new Error(`User with id ${videoData.userId} not found`);
    }
    username = userData[0].username;
  }
  
  const newVideo = new Video({
    ...videoData,
    author: username,
  });
  
  const result = await db.insert(video).values(newVideo).returning();
  return result[0];
}

export async function getVideosByParentId({ parentId }: { parentId: string }) {
  try {
    return await db
      .select()
      .from(video)
      .where(eq(video.parentId, parentId))
      .orderBy(video.chainOrder);
  } catch (error) {
    console.error("Failed to get videos by parentId from database");
    throw error;
  }
}

export async function getLatestChainOrder({ parentId, side }: { parentId: string; side: "start" | "end" }) {
  try {
    const result = await db
      .select({ chainOrder: video.chainOrder })
      .from(video)
      .where(eq(video.parentId, parentId))
      .orderBy(side === "start" ? desc(video.chainOrder) : video.chainOrder)
      .limit(1);

    return result[0]?.chainOrder;
  } catch (error) {
    console.error("Failed to get latest chain order from database");
    throw error;
  }
}

export async function getAllVideos() {
  try {
    return await db
      .select()
      .from(video)
      .orderBy(desc(video.createdAt));
  } catch (error) {
    console.error("Failed to get all videos");
    throw error;
  }
}

export async function getVideos({ userId }: { userId: string }) {
  try {
    return await db
      .select()
      .from(video)
      .where(eq(video.userId, userId))
      .orderBy(desc(video.createdAt));
  } catch (error) {
    console.error("Failed to get videos by user");
    throw error;
  }
}

export async function getVideo({ id }: { id: string }) {
  try {
    const [selectedVideo] = await db.select().from(video).where(eq(video.id, id));
    return selectedVideo;
  } catch (error) {
    console.error("Failed to get video by id from database");
    throw error;
  }
}

export async function updateVideo({
  id,
  uri,
  downloadUri,
  metadata,
  format,
  title,
  description,
  duration,
  fileSize,
  thumbnailUri,
  status,
}: {
  id: string;
  uri?: string;
  downloadUri?: string;
  metadata?: any;
  format?: string;
  title?: string;
  description?: string;
  duration?: number;
  fileSize?: number;
  thumbnailUri?: string;
  status?: string;
}) {
  try {
    const updateData: any = {
      updatedAt: new Date(),
    };

    if (uri !== undefined) updateData.uri = uri;
    if (downloadUri !== undefined) updateData.downloadUri = downloadUri;
    if (metadata !== undefined) updateData.metadata = JSON.stringify(metadata);
    if (format !== undefined) updateData.format = format;
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (duration !== undefined) updateData.duration = duration;
    if (fileSize !== undefined) updateData.fileSize = fileSize;
    if (thumbnailUri !== undefined) updateData.thumbnailUri = thumbnailUri;
    if (status !== undefined) updateData.status = status;

    return await db.update(video).set(updateData).where(eq(video.id, id));
  } catch (error) {
    console.error("Failed to update video in database");
    throw error;
  }
}

export async function deleteVideo({ id }: { id: string }) {
  try {
    return await db.delete(video).where(eq(video.id, id));
  } catch (error) {
    console.error("Failed to delete video from database");
    throw error;
  }
}

export async function getVideosByStatus({ 
  status, 
  userId 
}: { 
  status: string; 
  userId: string; 
}) {
  try {
    return await db
      .select()
      .from(video)
      .where(and(eq(video.status, status), eq(video.userId, userId)))
      .orderBy(desc(video.createdAt));
  } catch (error) {
    console.error("Failed to get videos by status from database");
    throw error;
  }
}

export async function getVideoByFileId({ fileId }: { fileId: string }) {
  const [result] = await db
    .select()
    .from(video)
    .where(eq(video.fileId, fileId))
    .limit(1);

  return result;
}

// Optional: If you want to get only non-temporary videos
export async function getPermanentVideoByFileId({ fileId }: { fileId: string }) {
  const [result] = await db
    .select()
    .from(video)
    .where(and(eq(video.fileId, fileId), eq(video.isTemporary, false)))
    .limit(1);

  return result;
}

// Optional: Get video with user info
export async function getVideoWithUserByFileId({ fileId }: { fileId: string }) {
  const [result] = await db
    .select({
      video: video,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      }
    })
    .from(video)
    .leftJoin(user, eq(video.userId, user.id))
    .where(eq(video.fileId, fileId))
    .limit(1);

  return result;
}