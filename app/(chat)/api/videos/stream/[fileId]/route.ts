import { auth } from "@/auth";
import ai from "@/lib/gemini";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: { fileId: string } }
) {
  const session = await auth();
  
  try {
    const file = await ai.files.get({
      name: params.fileId,
    });
    
    console.log('File metadata:', JSON.stringify(file, null, 2));
    
    // Add the API key as a query parameter
    const downloadUrl = new URL(file.downloadUri!);
    downloadUrl.searchParams.set('key', process.env.GOOGLE_GENERATIVE_AI_API_KEY!);
    
    console.log('Fetching from URL:', downloadUrl.toString());
    
    const response = await fetch(downloadUrl.toString());
    
    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error response:', errorText);
      throw new Error(`Failed to fetch video: ${response.status}`);
    }
    
    // Check what we're actually getting
    const arrayBuffer = await response.arrayBuffer();
    console.log('arrayBuffer: ', arrayBuffer);
    
    const text = new TextDecoder().decode(arrayBuffer.slice(0, 500)); // First 500 bytes as text
    
    console.log('Video size:', arrayBuffer.byteLength, 'bytes');
    console.log('First 500 bytes as text:', text);
    
    // If it's JSON, it's probably an error or metadata, not the video
    if (text.trim().startsWith('{')) {
      console.error('Response appears to be JSON, not video data');
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