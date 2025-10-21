import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";

// Expanded file type support: add common video types.
const ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "application/pdf",
  "video/mp4",
  "video/quicktime",     // .mov
  "video/webm",
  "video/x-matroska",    // .mkv
];

const ACCEPTED_LABEL = "JPEG, PNG, PDF, or Video (MP4, MOV, WEBM, MKV)";

// Increase file size limit for videos to 4GB, keep smaller for images/pdfs.
const MAX_IMAGE_PDF_SIZE = 5 * 1024 * 1024;           // 5MB
const MAX_VIDEO_SIZE = 4 * 1024 * 1024 * 1024;        // 4GB

const FileSchema = z.object({
  file: z
    .instanceof(File)
    .refine((file) => {
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
    }, {
      message: `File size should be <= 5MB for images or PDFs, <= 4GB for videos`,
    })
    .refine(
      (file) => ACCEPTED_TYPES.includes(file.type),
      {
        message: `File type should be ${ACCEPTED_LABEL}`,
      },
    ),
});

// Simple in-memory storage for demo/development (not for production)
type StoredFile = {
  buffer: ArrayBuffer;
  contentType: string;
  name: string;
  size: number;
};
const inMemoryFileStore: Map<string, StoredFile> = new Map();

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
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const validatedFile = FileSchema.safeParse({ file });

    if (!validatedFile.success) {
      const errorMessage = validatedFile.error.errors
        .map((error) => error.message)
        .join(", ");

      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }

    const filename = file.name;
    const fileBuffer = await file.arrayBuffer();

    // Store file in memory (overwrites if filename exists)
    inMemoryFileStore.set(filename, {
      buffer: fileBuffer,
      contentType: file.type,
      name: filename,
      size: file.size,
    });

    // Mimic blob/put API response minimally for client compatibility
    const fakeURL = `/preview/${encodeURIComponent(filename)}`;

    return NextResponse.json({
      url: fakeURL,
      pathname: filename,
      contentType: file.type,
      size: file.size,
      // You could add more fields if needed
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to process request: ${JSON.stringify(error)}` },
      { status: 500 },
    );
  }
}
