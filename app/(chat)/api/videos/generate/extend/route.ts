import { NextResponse } from "next/server";
import ai from "@/lib/gemini";
import { GenerateVideosOperation } from "@google/genai";
import { auth } from "@/auth";
import {
  deleteChatById,
  getChatById,
  getVideo,
  getLatestChainOrder,
  insertVideo,
} from "@/db/queries";
import { fileToBase64, generateUUID } from "@/lib/utils";
import { Video } from "@/db/schema";
import { objectStorageManager } from "@/lib/storage";

// Error types for better categorization
enum ErrorType {
  AUTHENTICATION_ERROR = 'authentication_error',
  QUOTA_EXCEEDED = 'quota_exceeded',
  INVALID_REQUEST = 'invalid_request',
  TIMEOUT_ERROR = 'timeout_error',
  NETWORK_ERROR = 'network_error',
  GENERATION_FAILED = 'generation_failed',
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
  } else if (errorMessage.includes('quota') || errorMessage.includes('rate limit') ||
      errorMessage.includes('too many requests') || error?.status === 429) {
    return {
      type: ErrorType.QUOTA_EXCEEDED,
      message: 'API quota exceeded or rate limit reached',
      statusCode: 429
    };
  } else if (errorMessage.includes('invalid') || errorMessage.includes('bad request') ||
      error?.status === 400) {
    return {
      type: ErrorType.INVALID_REQUEST,
      message: 'Invalid request parameters or format',
      statusCode: 400
    };
  } else if (errorMessage.includes('timeout') || errorMessage.includes('deadline') ||
      error?.code === 'DEADLINE_EXCEEDED') {
    return {
      type: ErrorType.TIMEOUT_ERROR,
      message: 'Request timed out',
      statusCode: 408
    };
  } else if (errorMessage.includes('network') || errorMessage.includes('connection') ||
      errorMessage.includes('fetch') || error?.code === 'ECONNREFUSED') {
    return {
      type: ErrorType.NETWORK_ERROR,
      message: 'Network connection error',
      statusCode: 503
    };
  } else if (errorMessage.includes('generation failed') || errorMessage.includes('content policy') ||
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

export async function POST(request: Request) {
  try {
    // Parse FormData (multipart)
    const formData = await request.formData();

    const prompt = formData.get("prompt");
    const referenceFrame = formData.get("referenceFrame");
    const mimeType = formData.get("mimeType") as string;
    const side = formData.get("side");
    const videoId = formData.get("videoId");

    // Validate incoming form fields
    if (
      typeof prompt !== "string" ||
      !referenceFrame ||
      (side !== "start" && side !== "end") ||
      typeof videoId !== "string"
    ) {
      return NextResponse.json(
        {
          error: "All fields (prompt, referenceFrame, side, videoId) are required",
          type: ErrorType.INVALID_REQUEST
        },
        { status: 400 }
      );
    }

    const session = await auth();

    // Optionally add authentication for creating extensions

    const encoder = new TextEncoder();
    let currentOperation: GenerateVideosOperation | null = null;

    const stream = new ReadableStream({
      async start(controller) {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ status: 'initiating', progress: 0 })}\n\n`)
          );

          const imageBytes = await fileToBase64(referenceFrame as Blob);

          currentOperation = await ai.models.generateVideos({
            model: 'veo-3.1-generate-preview',
            source: {
              prompt,
              image: { imageBytes, mimeType }
            },
            config: {
              numberOfVideos: 1,
              durationSeconds: 6,
              abortSignal: request.signal
            }
          });

          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ status: 'generating', progress: 10 })}\n\n`)
          );

          let pollCount = 0;
          const maxPolls = 60;

          while (!currentOperation.done && pollCount < maxPolls) {
            if (request.signal?.aborted) {
              try {
                if (currentOperation?.name) {
                  await ai.operations.getVideosOperation({
                    operation: currentOperation,
                    config: { abortSignal: request.signal }
                  });
                }
              } catch {}
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({
                  status: 'cancelled',
                  message: 'Request cancelled by client'
                })}\n\n`)
              );
              controller.close();
              return;
            }

            await new Promise((resolve) => setTimeout(resolve, 10000));
            try {
              currentOperation = await ai.operations.getVideosOperation({
                operation: currentOperation,
                config: { abortSignal: request.signal }
              });
            } catch (pollError) {
              const { type, message, statusCode } = categorizeError(pollError);
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({
                  status: 'error',
                  error: message,
                  type,
                  statusCode
                })}\n\n`)
              );
              controller.close();
              return;
            }
            pollCount++;
            const progress = Math.min(10 + (pollCount / maxPolls) * 120, 80);

            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({
                status: 'generating',
                progress: Math.round(progress),
                pollCount
              })}\n\n`)
            );
          }

          if (request.signal?.aborted) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({
                status: 'cancelled',
                message: 'Request cancelled by client'
              })}\n\n`)
            );
            controller.close();
            return;
          }

          if (!currentOperation.done) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({
                status: 'error',
                error: 'Video generation timed out after maximum polling attempts',
                type: ErrorType.TIMEOUT_ERROR,
                statusCode: 408
              })}\n\n`)
            );
            controller.close();
            return;
          }

          if (currentOperation.error) {
            const { type, message, statusCode } = categorizeError(currentOperation.error);
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({
                status: 'error',
                error: message,
                type,
                statusCode
              })}\n\n`)
            );
            controller.close();
            return;
          }

          if (!currentOperation.response?.generatedVideos?.[0]?.video?.uri) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({
                status: 'error',
                error: 'Video generation completed but no video was produced',
                type: ErrorType.GENERATION_FAILED,
                statusCode: 422
              })}\n\n`)
            );
            controller.close();
            return;
          }

          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ status: 'retrieving', progress: 85 })}\n\n`)
          );

          try {
            const generatedVideoFile = await ai.files.get({
              name: currentOperation.response.generatedVideos[0].video.uri,
            });

            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ status: 'ready', progress: 90 })}\n\n`)
            );


            const downloadUrl = new URL(generatedVideoFile.downloadUri!);
            downloadUrl.searchParams.set('key', process.env.GOOGLE_GENERATIVE_AI_API_KEY!);

            const videoDownloadResponse = await fetch(downloadUrl.toString());
            if (!videoDownloadResponse.ok) {
              throw new Error(`Failed to fetch generated video content: ${videoDownloadResponse.statusText}`);
            }
            const videoBuffer = await videoDownloadResponse.arrayBuffer();
            const videoContentType = generatedVideoFile.mimeType || 'video/mp4';

            const fileId = generateUUID(); // Generate a unique fileId for storage

            let storedVideoUri: string;
            let downloadUri: string | null = null;
            let expiresAt: Date | null = null;
            let isTemporary = false;
            let newChainOrder: number | null = null;

            let video: Video;
            if (session?.user) {
              // User is signed in: store permanently, save to DB
              storedVideoUri = await objectStorageManager.uploadVideo(
                fileId,
                Buffer.from(videoBuffer),
                videoContentType,
                false // Not temporary
              );

              // Generate a signed URL for download (long-lived or permanent)
              downloadUri = await objectStorageManager.getSignedVideoUrl(fileId, 60 * 24 * 365 * 10); // 10 years expiration

              // Determine chainOrder
              const parentVideo = await getVideo({ id: videoId });
              if (parentVideo) {
                const latestChainOrder = await getLatestChainOrder({ parentId: parentVideo.fileId, side });
                if (side === "start") {
                  newChainOrder = (latestChainOrder !== null && latestChainOrder !== undefined) ? latestChainOrder - 1 : -1;
                } else { // side === "end"
                  newChainOrder = (latestChainOrder !== null && latestChainOrder !== undefined) ? latestChainOrder + 1 : 1;
                }
              } else {
                // If parent video not found, treat as a new chain (or error, depending on desired behavior)
                // For now, let's assume it's the start of a new chain if parent not found
                newChainOrder = 0;
              }

              video = new Video({
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
                parentId: parentVideo?.fileId || null, // Link to parent video by its fileId
                chainOrder: newChainOrder,
              });
              await insertVideo(video); // Save video metadata to database
              console.log("[Generation] Extension video saved to DB and GCS for signed-in user:", video.id);

            } else {
              // User is not signed in: store temporarily (30 min expiration), do not save to DB
              isTemporary = true;
              expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes from now

              storedVideoUri = await objectStorageManager.uploadVideo(
                fileId,
                Buffer.from(videoBuffer),
                videoContentType,
                isTemporary || true
              );

              // Generate a signed URL for download with 30 min expiration
              downloadUri = await objectStorageManager.getSignedVideoUrl(fileId, 30); // 30 minutes expiration for unsigned users
              console.log("[Generation] Temporary extension video saved to GCS for unsigned user:", fileId);

              video = new Video({
                fileId: fileId,
                uri: storedVideoUri,
                downloadUri: downloadUri,
                isTemporary: isTemporary,
                prompt,
                id: generateUUID(),
                generatedFileName: generatedVideoFile.name,
                format: videoContentType,
                fileSize: videoBuffer.byteLength,
                status: "ready",
                createdAt: new Date(),
                updatedAt: new Date(),
                expiresAt: expiresAt,
                parentId: videoId, // Return parentId for client-side chaining
                chainOrder: newChainOrder,
              });
            }

            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({
                status: "complete",
                progress: 100,
                video,
              })}\n\n`)
            );

            controller.close();
          } catch (fileError) {
            const { type, message, statusCode } = categorizeError(fileError);
            console.error("[Generation] Error retrieving or storing generated video file:", fileError);

            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({
                status: "error",
                error: `Failed to retrieve or store video file: ${message}`,
                type,
                statusCode
              })}\n\n`)
            );
            controller.close();
          }
        } catch (error) {
          const { type, message, statusCode } = categorizeError(error);
          console.error("[Generation] Error in stream start handler:", error);

          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({
              status: "error",
              error: message,
              type,
              statusCode
            })}\n\n`)
          );
          controller.close();
        }
      },
      cancel() {
        console.log("[Generation] Stream cancelled by client");

        if (currentOperation?.name) {
          ai.operations.getVideosOperation({
            operation: currentOperation,
            config: { abortSignal: request.signal }
          }).then(() => {
            console.log("[Generation] Successfully cancelled Google Gen AI operation from cancel handler");
          }).catch((error) => {
            console.warn("[Generation] Failed to cancel Google Gen AI operation from cancel handler:", error);
          });
        }
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
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

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        {
          error: "Chat ID is required",
          type: ErrorType.INVALID_REQUEST
        },
        { status: 400 }
      );
    }

    const session = await auth();

    if (!session || !session.user) {
      return NextResponse.json(
        {
          error: "Authentication required",
          type: ErrorType.AUTHENTICATION_ERROR
        },
        { status: 401 }
      );
    }

    const chat = await getChatById({ id });

    if (!chat) {
      return NextResponse.json(
        {
          error: "Chat not found",
          type: ErrorType.INVALID_REQUEST
        },
        { status: 404 }
      );
    }

    if (chat.userId !== session.user.id) {
      return NextResponse.json(
        {
          error: "Unauthorized to delete this chat",
          type: ErrorType.AUTHENTICATION_ERROR
        },
        { status: 403 }
      );
    }

    await deleteChatById({ id });

    return NextResponse.json(
      {
        message: "Chat deleted successfully",
        id
      },
      { status: 200 }
    );
  } catch (error) {
    const { type, message, statusCode } = categorizeError(error);
    return NextResponse.json(
      {
        error: `Failed to delete chat: ${message}`,
        type,
        timestamp: new Date().toISOString()
      },
      { status: statusCode }
    );
  }
}