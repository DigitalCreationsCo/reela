import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { GoogleCloudStorageProvider, ObjectStorageManager } from "@/lib/storage";
import { getVideoByFileId } from "@/db/queries"; // You'll need this query

const REMOTE_VIDEO_BASE_URL = process.env.REMOTE_VIDEO_BASE_URL || "http://localhost:3000/";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const session = await auth();
  const { fileId } = await params;

  if (process.env.NODE_ENV === "test") {
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

  // Production mode - use GCS with Gen AI fallback
  const gcsProvider = new GoogleCloudStorageProvider(
    process.env.GCS_BUCKET_NAME || 'reela-videos'
  );
  const objectStorageManager = new ObjectStorageManager(gcsProvider);

  try {
    // STRATEGY 1: Try to get from GCS first (permanent storage)
    console.log(`[Stream] Attempting to fetch from GCS: ${fileId}`);
    try {
      const videoBuffer = await objectStorageManager.getVideo(fileId);
      
      console.log(`[Stream] Successfully retrieved from GCS, size: ${videoBuffer.byteLength}`);
      
      return new NextResponse(videoBuffer as any, {
        headers: {
          "Content-Type": "video/mp4",
          "Content-Length": videoBuffer.byteLength.toString(),
          "Cache-Control": "public, max-age=31536000, immutable",
          "Accept-Ranges": "bytes",
        },
      });
    } catch (gcsError) {
      console.log(`[Stream] File not in GCS, trying Gen AI files as fallback...`);
      
      // STRATEGY 2: Fallback to Gen AI files (for recently generated videos)
      const ai = (await import("@/lib/gemini")).default;
      
      try {
        const file = await ai.files.get({
          name: fileId,
        });

        const downloadUrl = new URL(file.downloadUri!);
        downloadUrl.searchParams.set('key', process.env.GOOGLE_GENERATIVE_AI_API_KEY!);

        const response = await fetch(downloadUrl.toString());

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[Stream] Error fetching from Gen AI:', errorText);
          throw new Error(`Failed to fetch video: ${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();

        // Validate it's actually video data
        const text = new TextDecoder().decode(arrayBuffer.slice(0, 500));
        if (text.trim().startsWith('{')) {
          return new Response('Invalid video data received from API', { status: 500 });
        }

        console.log(`[Stream] Successfully retrieved from Gen AI files, size: ${arrayBuffer.byteLength}`);

        // IMPORTANT: Upload to GCS for future requests
        console.log(`[Stream] Uploading to GCS for future requests...`);
        try {
          await objectStorageManager.uploadVideo(
            fileId,
            Buffer.from(arrayBuffer),
            'video/mp4',
            false // Not temporary
          );
          console.log(`[Stream] Successfully uploaded to GCS`);
        } catch (uploadError) {
          console.warn(`[Stream] Failed to upload to GCS (non-fatal):`, uploadError);
        }

        return new NextResponse(arrayBuffer, {
          headers: {
            "Content-Type": "video/mp4",
            "Content-Length": arrayBuffer.byteLength.toString(),
            "Cache-Control": "public, max-age=31536000, immutable",
            "Accept-Ranges": "bytes",
          },
        });
      } catch (genAiError) {
        console.error('[Stream] File not found in Gen AI files either:', genAiError);
        throw genAiError;
      }
    }
  } catch (error) {
    console.error("[Stream] Error fetching video from all sources:", error);
    return new Response("Video file not found", { status: 404 });
  }
}