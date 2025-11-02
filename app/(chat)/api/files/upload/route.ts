import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";

import { auth } from "@/auth";

// Expanded file type support: add common video types.
const ACCEPTED_TYPES = [
  // Images
  "image/jpeg",
  "image/png",
  // Documents
  "application/pdf",
  "text/plain",
  "application/x-tex",
  "application/x-latex",
  // Audio
  "audio/mpeg",      // .mp3
  "audio/wav",       // .wav
  "audio/x-wav",
  "audio/ogg",       // .ogg
  "audio/webm",      // .webm audio
  // Video
  "video/mp4",
  "video/quicktime",     // .mov
  "video/webm",
  "video/x-matroska",    // .mkv
];

const ACCEPTED_LABEL =
  "Image (JPEG, PNG), Document (PDF, TXT, TEX, LaTeX), Audio (MP3, WAV, OGG, WEBM), or Video (MP4, MOV, WEBM, MKV)";
const MAX_IMAGE_PDF_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_VIDEO_SIZE = 4 * 1024 * 1024 * 1024; // 4GB

const FileSchema = z.object({
  file: z
    .instanceof(File)
    .refine(
      (file) => {
        if (
          ["image/jpeg", "image/png", "application/pdf"].includes(file.type)
        ) {
          return file.size <= MAX_IMAGE_PDF_SIZE;
        }
        if (
          [
            "video/mp4",
            "video/quicktime",
            "video/webm",
            "video/x-matroska",
          ].includes(file.type)
        ) {
          return file.size <= MAX_VIDEO_SIZE;
        }
        // fallback
        return false;
      },
      {
        message:
          `File size should be <= 5MB for images or PDFs, <= 4GB for videos`,
      }
    )
    .refine((file) => ACCEPTED_TYPES.includes(file.type), {
      message: `File type should be ${ACCEPTED_LABEL}`,
    }),
});

// In-memory store for uploaded files, keyed by UUID pointer
type FilePointer = string;
type StoredFile = {
  buffer: ArrayBuffer;
  contentType: string;
  name: string;
  size: number;
};
const inMemoryFileStore: Map<FilePointer, StoredFile> = new Map();

export const maxDuration = 200;

export async function POST(request: Request) {
  const session = await auth();

  // if (!session) {
  //   return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // }

  if (request.body === null) {
    return new Response("Request body is empty", { status: 400 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { error: "No file uploaded" },
        { status: 400 }
      );
    }

    const validatedFile = FileSchema.safeParse({ file });

    if (!validatedFile.success) {
      const errorMessage = validatedFile.error.errors
        .map((error) => error.message)
        .join(", ");

      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }

    // Generate a unique file pointer (simple UUID)
    const pointer = randomUUID();
    const fileBuffer = await file.arrayBuffer();

    // Store file in memory (overwrites if pointer exists, but that's extremely unlikely)
    inMemoryFileStore.set(pointer, {
      buffer: fileBuffer,
      contentType: file.type,
      name: file.name,
      size: file.size,
    });

    // Return the "pointer" and metadata as the reference
    // The pointer can then be used for further streaming/download endpoints
    return NextResponse.json({
      pointer, // client should store this and use it for referencing the file in further requests (e.g., /api/files/view?pointer=...)
      url: `/api/files/upload?pointer=${encodeURIComponent(pointer)}`,
      // for legacy UI code, also return "pathname" as the original filename (for display purposes)
      pathname: file.name,
      contentType: file.type,
      size: file.size,
      // You could add more fields if needed
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to process request: ${JSON.stringify(error)}` },
      { status: 500 }
    );
  }
}

// Add a GET request handler to retrieve a file buffer by pointer
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const pointer = searchParams.get("pointer");

    if (!pointer) {
      return NextResponse.json(
        { error: "Missing pointer parameter" },
        { status: 400 }
      );
    }

    const fileRecord = inMemoryFileStore.get(pointer);

    if (!fileRecord) {
      return NextResponse.json(
        { error: "File not found" },
        { status: 404 }
      );
    }

    // Create a Buffer from ArrayBuffer for Response consumption
    const buffer = Buffer.from(fileRecord.buffer);

    // Return the file as a binary response with proper headers
    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": fileRecord.contentType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(fileRecord.name)}"`,
        "Content-Length": fileRecord.size.toString(),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to retrieve file: ${JSON.stringify(error)}` },
      { status: 500 }
    );
  }
}
