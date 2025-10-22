import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";

const REMOTE_VIDEO_BASE_URL = process.env.REMOTE_VIDEO_BASE_URL || "http://localhost:3000/";

export async function GET(
  request: NextRequest,
  { params }: { params: { fileId: string } }
) {
  const session = await auth();

  if (process.env.NODE_ENV === "development") {
    const { fileId } = params;
    const safeFileId = fileId.replace(/[^a-zA-Z0-9._-]/g, "");
    const videoUrl = `${REMOTE_VIDEO_BASE_URL}/${safeFileId}.mp4`;

    try {
      const remoteResponse = await fetch(videoUrl);

      if (!remoteResponse.ok) {
        if (remoteResponse.status === 404) {
          return new Response("Video file not found", { status: 404 });
        }
        console.error("Failed to fetch remote video:", remoteResponse.statusText);
        return new Response("Error fetching remote video", { status: 502 });
      }

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

  const ai = (await import("@/lib/gemini")).default;

  try {
    const file = await ai.files.get({
      name: params.fileId,
    });

    const downloadUrl = new URL(file.downloadUri!);
    downloadUrl.searchParams.set('key', process.env.GOOGLE_GENERATIVE_AI_API_KEY!);

    const response = await fetch(downloadUrl.toString());

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error response:', errorText);
      throw new Error(`Failed to fetch video: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();

    const text = new TextDecoder().decode(arrayBuffer.slice(0, 500)); // First 500 bytes as text

    if (text.trim().startsWith('{')) {
      return new Response('Invalid video data received from API', { status: 500 });
    }

    return new NextResponse(arrayBuffer, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": arrayBuffer.byteLength.toString(),
        "Cache-Control": "public, max-age=31536000, immutable",
        "Accept-Ranges": "bytes",
      },
    });
  } catch (error) {
    console.error("Error fetching video:", error);
    return new Response("Error fetching video", { status: 500 });
  }
}