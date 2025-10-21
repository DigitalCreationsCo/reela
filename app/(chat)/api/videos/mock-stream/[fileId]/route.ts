import { NextRequest, NextResponse } from "next/server";

// The base URL of your backend or CDN where videos are hosted
// Example: http://localhost:3002 or https://your-cdn.com
const REMOTE_VIDEO_BASE_URL = process.env.REMOTE_VIDEO_BASE_URL || "http://localhost:3000/";

export async function GET(
  request: NextRequest,
  { params }: { params: { fileId: string } }
) {
  // No authentication required for mock streaming

  const { fileId } = params;
  console.log('[API: mock-stream] params.fileId: ', fileId, params);
  // For security: only allow filenames that are simple, no path traversal
  const safeFileId = fileId.replace(/[^a-zA-Z0-9._-]/g, "");
  const videoUrl = `${REMOTE_VIDEO_BASE_URL}/${safeFileId}.mp4`;

  console.log('Fetching remote videoUrl: ', videoUrl);

  try {
    const remoteResponse = await fetch(videoUrl);

    if (!remoteResponse.ok) {
      if (remoteResponse.status === 404) {
        return new Response("Video file not found", { status: 404 });
      }
      console.error("Failed to fetch remote video:", remoteResponse.statusText);
      return new Response("Error fetching remote video", { status: 502 });
    }

    // Clone headers but override as necessary
    const headers = new Headers(remoteResponse.headers);
    headers.set("Content-Type", "video/mp4");
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
    headers.set("Accept-Ranges", "bytes");

    return new Response(remoteResponse.body, {
      status: 200,
      headers,
    });
  } catch (error: any) {
    console.error("Error fetching remote video:", error);
    return new Response("Error proxying remote video", { status: 500 });
  }
}