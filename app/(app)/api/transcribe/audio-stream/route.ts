import { NextResponse } from "next/server";
import ai from "@/lib/gemini";
import { fileToBase64 } from "@/lib/utils";

// Error types for better categorization (copied and simplified for re-use)
enum ErrorType {
  AUTHENTICATION_ERROR = 'authentication_error',
  QUOTA_EXCEEDED = 'quota_exceeded',
  INVALID_REQUEST = 'invalid_request',
  TIMEOUT_ERROR = 'timeout_error',
  NETWORK_ERROR = 'network_error',
  GENERATION_FAILED = 'generation_failed',
  UNKNOWN_ERROR = 'unknown_error'
}

// Helper function to categorize errors
function categorizeError(error: any): { type: ErrorType; message: string; statusCode: number } {
  const errorMessage = error?.message || error?.toString() || 'Unknown error';

  if (errorMessage.includes('unauthorized') || errorMessage.includes('authentication') ||
      errorMessage.includes('permission') || error?.status === 401 || error?.status === 403) {
    return {
      type: ErrorType.AUTHENTICATION_ERROR,
      message: 'Authentication failed or insufficient permissions',
      statusCode: 401
    };
  }
  if (errorMessage.includes('quota') || errorMessage.includes('rate limit') || 
      errorMessage.includes('too many requests') || error?.status === 429) {
    return {
      type: ErrorType.QUOTA_EXCEEDED,
      message: 'API quota exceeded or rate limit reached',
      statusCode: 429
    };
  }
  if (errorMessage.includes('invalid') || errorMessage.includes('bad request') || 
      error?.status === 400) {
    return {
      type: ErrorType.INVALID_REQUEST,
      message: 'Invalid request parameters or format',
      statusCode: 400
    };
  }
  if (errorMessage.includes('timeout') || errorMessage.includes('deadline') ||
      error?.code === 'DEADLINE_EXCEEDED') {
    return {
      type: ErrorType.TIMEOUT_ERROR,
      message: 'Request timed out',
      statusCode: 408
    };
  }
  if (errorMessage.includes('network') || errorMessage.includes('connection') ||
      errorMessage.includes('fetch') || error?.code === 'ECONNREFUSED') {
    return {
      type: ErrorType.NETWORK_ERROR,
      message: 'Network connection error',
      statusCode: 503
    };
  }
  if (errorMessage.includes('generation failed') || errorMessage.includes('content policy') ||
      errorMessage.includes('safety') || error?.status === 422) {
    return {
      type: ErrorType.GENERATION_FAILED,
      message: 'Audio transcription failed due to content policy or safety restrictions',
      statusCode: 422
    };
  }
  return {
    type: ErrorType.UNKNOWN_ERROR,
    message: errorMessage,
    statusCode: 500
  };
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        {
          error: "Request must be multipart/form-data with an audio file",
          type: ErrorType.INVALID_REQUEST
        },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const audioFile: File | null = formData.get("file") as File;

    if (!audioFile || !(audioFile instanceof Blob)) {
      return NextResponse.json(
        {
          error: "No audio file provided",
          type: ErrorType.INVALID_REQUEST
        },
        { status: 400 }
      );
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ status: 'initiating', progress: 0 })}\n\n`)
          );

          // Progress update: uploading
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ status: 'uploading', progress: 10 })}\n\n`)
          );

          // Encode File/Blob to base64
          let base64Audio: string;
          try {
            base64Audio = await fileToBase64(audioFile);
          } catch (err) {
            throw new Error("Failed to convert audio to base64");
          }

          // Create request contents as per template and user instructions
          const contents = [
            {
              text: "Generate a highly detailed description of the audio, featuring speech transcription and description of all sounds in the soundscape. Use timestamps to accurately depict the soundscape, including when sounds start, when they stop, and how they change through the audio."
            },
            {
              inlineData: {
                mimeType: audioFile.type || "audio/mp3", 
                data: base64Audio,
              }
            }
          ];

          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ status: 'processing', progress: 25 })}\n\n`)
          );

          const aiResult = await ai.models.generateContentStream({
            model: "gemini-2.5-flash",
            contents,
            config: {
              abortSignal: (request as any).signal
            }
          });

          let gotContent = false;

          for await (const chunk of aiResult) {
            gotContent = true;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: "stream", chunk })}\n\n`));
          }

          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ status: 'complete', progress: 100 })}\n\n`)
          );
          controller.close();
        } catch (error) {
          const { type, message, statusCode } = categorizeError(error);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                status: "error",
                error: message,
                type: type,
                statusCode
              })}\n\n`
            )
          );
          controller.close();
        }
      },
      cancel() {
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });
  } catch (error) {
    const { type, message, statusCode } = categorizeError(error);
    return NextResponse.json(
      {
        error: message,
        type,
        timestamp: new Date().toISOString()
      },
      { status: statusCode }
    );
  }
}
