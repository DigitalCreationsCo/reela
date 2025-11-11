import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import ai from "@/lib/gemini";
import { GenerateVideosOperation, GenerateVideosParameters } from "@google/genai";
import { AttachmentType } from "@/lib/types";
import { inMemoryFileStore, StoredFile } from "@/lib/memory-file-store";
import { fileToBase64, generateUUID } from "@/lib/utils";
import { GoogleCloudStorageProvider, ObjectStorageManager } from "@/lib/storage";
import { auth } from "@/auth";
import { Video } from "@/db/schema";
import { insertVideo } from "@/db/queries";

// Error types for better categorization
enum ErrorType {
  AUTHENTICATION_ERROR = 'authentication_error',
  QUOTA_EXCEEDED = 'quota_exceeded',
  INVALID_REQUEST = 'invalid_request',
  TIMEOUT_ERROR = 'timeout_error',
  NETWORK_ERROR = 'network_error',
  GENERATION_FAILED = 'generation_failed',
  UPLOAD_FAILED = 'upload_failed',
  TRANSCRIPTION_FAILED = 'transcription_failed',
  UNKNOWN_ERROR = 'unknown_error'
}

// Helper function to categorize Google API errors
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
      message: 'Video generation failed due to content policy or safety restrictions',
      statusCode: 422
    };
  }

  return {
    type: ErrorType.UNKNOWN_ERROR,
    message: errorMessage,
    statusCode: 500
  };
}

// Validate file size
function validateFileSize(size: number, maxSize: number, fileType: string): void {
  if (size === 0) {
    throw new Error(`${fileType} file is empty (0 bytes)`);
  }
  if (size > maxSize) {
    throw new Error(
      `${fileType} file too large: ${(size / 1024 / 1024).toFixed(2)}MB (max ${maxSize / 1024 / 1024}MB)`
    );
  }
}

// Fetch and validate attachment from URL
async function fetchAttachment(url: string, expectedType: string): Promise<ArrayBuffer> {
  console.log(`[Attachment] Fetching from URL:`, url);
  
  const fetchRes = await fetch(url);
  if (!fetchRes.ok) {
    throw new Error(`Failed to fetch attachment at url: ${url}, status: ${fetchRes.status}`);
  }

  // Verify content type from response
  const contentType = fetchRes.headers.get('content-type');
  console.log(`[Attachment] Response content-type:`, contentType);
  
  if (contentType && !contentType.startsWith(expectedType.split('/')[0])) {
    console.warn(`[Attachment] Content-type mismatch. Expected: ${expectedType}, Got: ${contentType}`);
  }

  const arrayBuffer = await fetchRes.arrayBuffer();
  console.log(`[Attachment] Fetched size:`, arrayBuffer.byteLength, 'bytes');
  
  if (arrayBuffer.byteLength === 0) {
    throw new Error("Fetched attachment data is empty");
  }

  return arrayBuffer;
}

const handler = createMcpHandler(
  (server) => {
    server.tool(
      "generate_video",
      "Generates a video based on a prompt and returns a public download link.",
      z.object({
        prompt: z.string().describe("The prompt for video generation."),
        modelName: z.string().default("veo-3.1-generate-preview").describe("The model to use for video generation."),
        abortSignal: z.any().optional().describe("An AbortSignal to cancel the video generation."),
      }),
      async ({ prompt, modelName, abortSignal }) => {
        try {
          const session = await auth();

          const gcsProvider = new GoogleCloudStorageProvider(process.env.GCS_BUCKET_NAME || 'reela-videos');
          const objectStorageManager = new ObjectStorageManager(gcsProvider);

          let videoGenOptions: GenerateVideosParameters = {
            model: modelName,
            source: {
              prompt,
            },
            config: {
              numberOfVideos: 1,
              durationSeconds: 8, // Default duration, can be made configurable if needed
              abortSignal: abortSignal,
            }
          };

          console.log(`[Generation] Starting video generation with options:`, {
            model: videoGenOptions.model,
            promptLength: prompt.length,
          });

          let currentOperation: GenerateVideosOperation = await ai.models.generateVideos(videoGenOptions);

          let pollCount = 0;
          const maxPolls = 60;

          while (!currentOperation.done && pollCount < maxPolls) {
            if (abortSignal?.aborted) {
              console.log('[Generation] Client aborted the request, stopping video generation');
              try {
                if (currentOperation?.name) {
                  await ai.operations.getVideosOperation({
                    operation: currentOperation,
                    config: {
                      abortSignal: abortSignal
                    }
                  });
                  console.log('[Generation] Successfully cancelled Google Gen AI operation');
                }
              } catch (cancelError) {
                console.warn('[Generation] Failed to cancel Google Gen AI operation:', cancelError);
              }
              return { error: 'Video generation cancelled by client' };
            }

            await new Promise((resolve) => setTimeout(resolve, 10000));

            try {
              currentOperation = await ai.operations.getVideosOperation({
                operation: currentOperation,
                config: {
                  abortSignal: abortSignal
                }
              });
            } catch (pollError) {
              const { message } = categorizeError(pollError);
              console.error('[Generation] Error polling operation status:', pollError);
              return { error: `Error polling video generation status: ${message}` };
            }

            pollCount++;
          }

          if (!currentOperation.done) {
            return { error: 'Video generation timed out after maximum polling attempts' };
          }

          if (currentOperation.error) {
            const { message } = categorizeError(currentOperation.error);
            console.error('[Generation] Google operation completed with error:', currentOperation.error);
            return { error: `Video generation failed: ${message}` };
          }

          if (!currentOperation.response?.generatedVideos?.[0]?.video?.uri) {
            return { error: 'Video generation completed but no video was produced' };
          }

          const generatedVideoFile = await ai.files.get({
            name: currentOperation.response.generatedVideos[0].video.uri,
          });

          console.log('[Generation] Successfully retrieved generated video file:', generatedVideoFile.name);

          const videoDownloadResponse = await fetch(generatedVideoFile.downloadUri!); 
          if (!videoDownloadResponse.ok) {
            const errorBody = await videoDownloadResponse.text();
            console.error("[Generation] Failed to fetch video content. Status:", videoDownloadResponse.status, "Status Text:", videoDownloadResponse.statusText, "URL:", generatedVideoFile.downloadUri);
            console.error("[Generation] Error response body:", errorBody);
            throw new Error(`Failed to fetch generated video content: ${videoDownloadResponse.statusText}`);
          }
          const videoBuffer = await videoDownloadResponse.arrayBuffer();
          const videoContentType = generatedVideoFile.mimeType || 'video/mp4';

          const fileId = generateUUID();

          let storedVideoUri: string;
          let downloadUri: string | null = null;
          let expiresAt: Date | null = null;
          let isTemporary = false;

          if (session?.user) {
            storedVideoUri = await objectStorageManager.uploadVideo(
              fileId,
              Buffer.from(videoBuffer),
              videoContentType,
              false
            );
            downloadUri = await objectStorageManager.getSignedVideoUrl(fileId, 60 * 24 * 365 * 10);

            const newVideo = new Video({
              id: generateUUID(),
              fileId: fileId,
              uri: storedVideoUri,
              downloadUri: downloadUri,
              prompt: prompt,
              userId: session.user.id,
              author: session.user.name || "Anonymous",
              format: videoContentType,
              fileSize: videoBuffer.byteLength,
              status: "ready",
              isTemporary: false,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
            await insertVideo(newVideo);
            console.log('[Generation] Video saved to DB and GCS for signed-in user:', newVideo.id);

          } else {
            isTemporary = true;
            expiresAt = new Date(Date.now() + 30 * 60 * 1000);

            storedVideoUri = await objectStorageManager.uploadVideo(
              fileId,
              Buffer.from(videoBuffer),
              videoContentType,
              true
            );
            downloadUri = await objectStorageManager.getSignedVideoUrl(fileId, 30);
            console.log('[Generation] Temporary video saved to GCS for unsigned user:', fileId);
          }

          return { publicDownloadLink: downloadUri };

        } catch (error) {
          const { message } = categorizeError(error);
          console.error('[Generation] Error in video generation tool:', error);
          return { error: `Video generation failed: ${message}` };
        }
      }
    );
  },
  {
    // Optional server options
  },
  {
    // Optional redis config
    redisUrl: process.env.REDIS_URL,
    basePath: '/api',
    maxDuration: 60,
    verboseLogs: true,
  }
);

export { handler as GET, handler as POST };