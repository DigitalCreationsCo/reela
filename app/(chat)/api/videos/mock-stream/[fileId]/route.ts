import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { promises as fs } from "fs";

const SAMPLE_VIDEO_DIR = path.join(process.cwd());

export async function GET(
  request: NextRequest,
  { params }: { params: { fileId: string } }
) {
  // No authentication required for local mock streaming

  // For security: only allow filenames that are simple, no path traversal
  const safeFileId = await params.fileId.replace(/[^a-zA-Z0-9._-]/g, "");
  const videoPath = path.join(SAMPLE_VIDEO_DIR, `${safeFileId}.mp4`);

  try {
    // Check file existence and get file info (for Content-Length)
    const stat = await fs.stat(videoPath);
    if (!stat.isFile()) {
      return new Response("Video file not found", { status: 404 });
    }

    // Read the entire video file
    const fileBuffer = await fs.readFile(videoPath);

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": stat.size.toString(),
        "Cache-Control": "public, max-age=31536000, immutable",
        "Accept-Ranges": "bytes",
      },
    });
  } catch (error: any) {
    if (error.code === "ENOENT") {
      return new Response("Video file not found", { status: 404 });
    }
    console.error("Error reading local video:", error);
    return new Response("Error reading local video", { status: 500 });
  }
}