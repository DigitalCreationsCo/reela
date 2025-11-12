import { convertToCoreMessages, generateObject, Message, streamText } from "ai";
import { z } from "zod";
import { geminiProModel } from "@/ai";
import {
  generateReservationPrice,
  generateSampleFlightSearchResults,
  generateSampleFlightStatus,
  generateSampleSeatSelection,
} from "@/ai/actions";
import { auth } from "@/auth";
import {
  createReservation,
  deleteChatById,
  getChatById,
  getReservationById,
  saveChat,
} from "@/db/queries";
import { fileToBase64, generateUUID } from "@/lib/utils";
import ai from "@/lib/gemini";
import { NextResponse } from "next/server";
import { GenerateVideosOperation, GenerateVideosParameters } from "@google/genai";
import { AttachmentType } from "@/lib/types";
import { inMemoryFileStore, StoredFile } from "@/lib/memory-file-store";
import { Video } from "@/db/schema";
import { insertVideo } from "@/db/queries"; // Assuming insertVideo exists or will be created
import { objectStorageManager } from "@/lib/storage";

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

export async function POST(request: Request) {
  try {
    const { id, messages, modelName }: { id: string; messages: Array<any>; modelName?: string } =
      await request.json();

    const session = await auth();

    // Uncommented authentication check
    // if (!session || !session.user) {
    //   // For now, we allow unauthenticated users to generate temporary videos.
    //   // The logic below will handle temporary storage.
    // }

    if (!messages || !messages.length || !messages[messages.length - 1]?.content) {
      return NextResponse.json(
        {
          error: 'Invalid request: prompt is required',
          type: ErrorType.INVALID_REQUEST
        },
        { status: 400 }
      );
    }

    const encoder = new TextEncoder();
    let currentOperation: GenerateVideosOperation | null = null;

    const stream = new ReadableStream({
      async start(controller) {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ status: 'initiating', progress: 0 })}\n\n`)
          );

          const lastMessage = messages[messages.length - 1];
          const prompt = lastMessage.content;
          
          if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
            throw new Error('Prompt cannot be empty');
          }

          let attachments = lastMessage.attachments as Array<AttachmentType> || [];
          let videoGenOptions: GenerateVideosParameters;
          let usedAttachmentInfo: any = undefined;

          let calculatedDurationSeconds = lastMessage.durationSeconds || 8; // Default to 8
          const hasImageAttachment = attachments.some(att => att.contentType?.startsWith("image/"));

          if (hasImageAttachment) {
            calculatedDurationSeconds = 8; // Fixed to 8 when using reference images
          } else if (modelName === "veo-2.0-generate-001") {
            // Veo 2 models: 5-8, default 8
            if (calculatedDurationSeconds < 5 || calculatedDurationSeconds > 8) {
              calculatedDurationSeconds = 8; // Enforce default if outside range
            }
          } else if (modelName === "veo-3.1-generate-preview") {
            // Veo 3 models: 4, 6, or 8, default 8
            if (![4, 6, 8].includes(calculatedDurationSeconds)) {
              calculatedDurationSeconds = 8; // Enforce default if not 4, 6, or 8
            }
          }

          videoGenOptions = {
            model: modelName || "veo-3.1-generate-preview", // Use provided modelName or default
            source: {
              prompt,
            },
            config: {
              numberOfVideos: 1,
              durationSeconds: calculatedDurationSeconds,
              abortSignal: request.signal
            }
          };

          // Process attachments if present
          if (attachments && attachments.length > 0) {
            const attachment = attachments[0];
            console.log(`[Attachment] Processing attachment:`, {
              contentType: attachment.contentType,
              hasPointer: !!attachment.pointer,
              hasUrl: !!attachment.url,
              pathname: attachment.pathname
            });

            let fileRecord: StoredFile | undefined;
            if (attachment.pointer) {
              fileRecord = inMemoryFileStore.get(attachment.pointer);
              if (!fileRecord) {
                throw new Error(`File not found in memory store for pointer: ${attachment.pointer}`);
              }
              console.log(`[Attachment] Retrieved file from memory store:`, {
                name: fileRecord.name,
                size: fileRecord.buffer.byteLength,
                type: fileRecord.contentType
              });
            }

            switch (attachment.contentType) {
              // ===== IMAGE ATTACHMENTS =====
              case "image/png":
              case "image/jpeg":
              case "image/jpg":
              case "image/webp":
              case "image/gif": {
                try {
                  console.log(`[Image] Processing image attachment`);
                  let imageBytes: string;

                  if (fileRecord) {
                    validateFileSize(fileRecord.buffer.byteLength, 10 * 1024 * 1024, 'Image');
                    imageBytes = await fileToBase64(fileRecord.buffer);
                  } else if (attachment.url) {
                    const arrayBuffer = await fetchAttachment(attachment.url, attachment.contentType);
                    validateFileSize(arrayBuffer.byteLength, 10 * 1024 * 1024, 'Image');
                    imageBytes = await fileToBase64(arrayBuffer);
                  } else {
                    throw new Error("No image data available");
                  }

                  let imageDurationSeconds = 8; // Fixed to 8 when using reference images
                  videoGenOptions = {
                    model: modelName || "veo-3.1-generate-preview", // Use provided modelName or default
                    prompt,
                    image: {
                      imageBytes,
                      mimeType: attachment.contentType,
                    },
                    config: {
                      numberOfVideos: 1,
                      durationSeconds: imageDurationSeconds,
                      abortSignal: request.signal
                    }
                  };
                  usedAttachmentInfo = { type: attachment.contentType };
                  console.log(`[Image] Successfully prepared image for video generation`);
                } catch (error) {
                  console.error(`[Image] Error processing image:`, error);
                  throw new Error(`Failed to process image: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
                break;
              }

              // ===== AUDIO ATTACHMENTS =====
              case "audio/mpeg":
              case "audio/mp3":
              case "audio/wav":
              case "audio/x-wav":
              case "audio/ogg":
              case "audio/webm":
              case "audio/aac":
              case "audio/flac": {
                try {
                  console.log(`[Audio] Processing audio attachment for transcription`);
                  let audioBlob: Blob;
                  let mimeType = attachment.contentType;

                  if (fileRecord) {
                    validateFileSize(fileRecord.buffer.byteLength, 25 * 1024 * 1024, 'Audio');
                    audioBlob = new Blob([fileRecord.buffer], { type: fileRecord.contentType });
                    mimeType = fileRecord.contentType as typeof mimeType;
                  } else if (attachment.url) {
                    const arrayBuffer = await fetchAttachment(attachment.url, attachment.contentType);
                    validateFileSize(arrayBuffer.byteLength, 25 * 1024 * 1024, 'Audio');
                    audioBlob = new Blob([arrayBuffer], { type: mimeType });
                  } else {
                    throw new Error("No audio data available");
                  }

                  console.log(`[Audio] Audio blob created, size:`, audioBlob.size, 'type:', audioBlob.type);

                  const formData = new FormData();
                  formData.append("file", audioBlob, fileRecord?.name || "audio-file");

                  const transcribeEndpoint = `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/transcribe/audio`;
                  console.log(`[Audio] Sending to transcription endpoint:`, transcribeEndpoint);

                  const transcribeRes = await fetch(transcribeEndpoint, {
                    method: "POST",
                    body: formData,
                  });

                  if (!transcribeRes.ok) {
                    const errorText = await transcribeRes.text();
                    console.error(`[Audio] Transcription failed:`, errorText);
                    throw new Error(`Failed to transcribe audio: ${errorText}`);
                  }

                  const transcriptionData = await transcribeRes.json();
                  console.log(`[Audio] Transcription response:`, transcriptionData);

                  // Extract transcription text with better error handling
                  let transcriptionText = "";
                  try {
                    if (transcriptionData.result?.candidates?.[0]?.content?.parts?.[0]?.text) {
                      transcriptionText = transcriptionData.result.candidates[0].content.parts[0].text;
                    } else if (typeof transcriptionData.result === "string") {
                      transcriptionText = transcriptionData.result;
                    } else if (typeof transcriptionData.result?.content === "string") {
                      transcriptionText = transcriptionData.result.content;
                    } else if (typeof transcriptionData.text === "string") {
                      transcriptionText = transcriptionData.text;
                    }
                  } catch (parseError) {
                    console.error(`[Audio] Error parsing transcription:`, parseError);
                  }

                  if (!transcriptionText || transcriptionText.trim().length === 0) {
                    console.warn(`[Audio] No transcription text extracted, using original prompt only`);
                    transcriptionText = "";
                  } else {
                    console.log(`[Audio] Transcription extracted, length:`, transcriptionText.length);
                  }

                  const combinedPrompt = transcriptionText
                    ? `Audio transcription:\n${transcriptionText}\n\nUser request:\n${prompt}`
                    : prompt;

                  let audioDurationSeconds = 6; // Default for audio-only, will be overridden if image present
                  if (attachments.some(att => att.contentType?.startsWith("image/"))) {
                    audioDurationSeconds = 8; // If there's also an image, duration is 8
                  }
                  videoGenOptions = {
                    model: modelName || "veo-3.1-generate-preview", // Use provided modelName or default
                    prompt: combinedPrompt,
                    config: {
                      numberOfVideos: 1,
                      durationSeconds: audioDurationSeconds,
                      abortSignal: request.signal,
                    },
                  };
                  usedAttachmentInfo = { 
                    type: attachment.contentType, 
                    transcription: Boolean(transcriptionText),
                    transcriptionLength: transcriptionText.length
                  };
                  console.log(`[Audio] Successfully prepared audio-based video generation`);
                } catch (error) {
                  console.error(`[Audio] Error processing audio:`, error);
                  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                  
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({
                      status: 'error',
                      error: `Audio transcription failed: ${errorMessage}`,
                      type: ErrorType.TRANSCRIPTION_FAILED,
                      statusCode: 422
                    })}\n\n`)
                  );
                  controller.close();
                  return;
                }
                break;
              }

              // ===== VIDEO ATTACHMENTS =====
              case "video/mp4":
              case "video/quicktime":
              case "video/webm":
              case "video/x-matroska":
              case "video/avi":
              case "video/mpeg": {
                try {
                  console.log(`[Video] Processing video attachment`);
                  let videoFile: Blob;
                  let mimeType = attachment.contentType;
                  const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB

                  if (fileRecord) {
                    console.log(`[Video] Using file buffer, size:`, fileRecord.buffer.byteLength);
                    validateFileSize(fileRecord.buffer.byteLength, MAX_VIDEO_SIZE, 'Video');
                    
                    videoFile = new Blob([fileRecord.buffer], { type: fileRecord.contentType });
                    mimeType = fileRecord.contentType as typeof mimeType;
                    console.log(`[Video] Created blob from buffer, type:`, mimeType);
                  } else if (attachment.url) {
                    const arrayBuffer = await fetchAttachment(attachment.url, attachment.contentType);
                    validateFileSize(arrayBuffer.byteLength, MAX_VIDEO_SIZE, 'Video');
                    
                    videoFile = new Blob([arrayBuffer], { type: mimeType });
                    console.log(`[Video] Created blob from URL fetch, type:`, mimeType);
                  } else {
                    throw new Error("No video file or valid URL for video upload");
                  }

                  // Normalize MIME type for better compatibility
                  let normalizedMimeType = mimeType;
                  if (mimeType === 'video/quicktime') {
                    console.warn(`[Video] QuickTime format detected - may have compatibility issues`);
                    // Keep as quicktime, but warn user
                  } else if (mimeType === 'video/x-matroska') {
                    console.warn(`[Video] Matroska (MKV) format detected - converting to video/webm for better compatibility`);
                    normalizedMimeType = 'video/webm';
                  }

                  console.log(`[Video] Uploading video to Google AI:`, {
                    size: videoFile.size,
                    type: normalizedMimeType,
                    displayName: fileRecord?.name ?? attachment.pathname ?? 'video-upload.mp4'
                  });

                  const uploadedVideo = await ai.files.upload({
                    file: videoFile,
                    // config: {
                    //   mimeType: normalizedMimeType,
                    //   displayName: fileRecord?.name ?? attachment.pathname ?? 'video-upload.mp4',
                    // }
                  });

                  // console.log(`[Video] Successfully uploaded video:`, uploadedVideo);

                  // const videoBuffer = await videoFile.arrayBuffer();
                  let videoDurationSeconds = 6; // Default for video-only, will be overridden if image present
                  if (attachments.some(att => att.contentType?.startsWith("image/"))) {
                    videoDurationSeconds = 8; // If there's also an image, duration is 8
                  }
                  videoGenOptions = {
                    model: modelName || "veo-3.1-generate-preview", // Use provided modelName or default
                    prompt,
                    video: uploadedVideo,
                    config: {
                      numberOfVideos: 1,
                      durationSeconds: videoDurationSeconds,
                      abortSignal: request.signal
                    }
                  };

                  usedAttachmentInfo = { 
                    type: attachment.contentType,
                    fileName: fileRecord?.name ?? attachment.pathname,
                    fileSize: videoFile.size,
                    // uploadedFileId: uploadedVideo.name
                  };
                  console.log(`[Video] Successfully prepared video-based generation`);
                } catch (error) {
                  console.error(`[Video] Error processing video:`, error);
                  const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                  
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({
                      status: 'error',
                      error: `Video upload failed: ${errorMessage}`,
                      type: ErrorType.UPLOAD_FAILED,
                      statusCode: 400
                    })}\n\n`)
                  );
                  controller.close();
                  return;
                }
                break;
              }

              default:
                console.error(`[Attachment] Unsupported content type:`, attachment.contentType);
                throw new Error(`Unsupported attachment content type: ${attachment.contentType}`);
            }
          }

          console.log(`[Generation] Starting video generation with options:`, {
            model: videoGenOptions.model,
            hasImage: 'image' in videoGenOptions,
            hasVideo: 'video' in videoGenOptions,
            hasSource: 'source' in videoGenOptions,
            promptLength: prompt.length,
            usedAttachment: usedAttachmentInfo
          });

          currentOperation = await ai.models.generateVideos(videoGenOptions);

          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ 
              status: 'generating', 
              progress: 10, 
              usedAttachment: usedAttachmentInfo 
            })}\n\n`)
          );

          let pollCount = 0;
          const maxPolls = 60;

          while (!currentOperation.done && pollCount < maxPolls) {
            if (request.signal?.aborted) {
              console.log('[Generation] Client aborted the request, stopping video generation');

              try {
                if (currentOperation?.name) {
                  await ai.operations.getVideosOperation({
                    operation: currentOperation,
                    config: {
                      abortSignal: request.signal
                    }
                  });
                  console.log('[Generation] Successfully cancelled Google Gen AI operation');
                }
              } catch (cancelError) {
                console.warn('[Generation] Failed to cancel Google Gen AI operation:', cancelError);
              }

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
                config: {
                  abortSignal: request.signal
                }
              });
            } catch (pollError) {
              const { type, message, statusCode } = categorizeError(pollError);
              console.error('[Generation] Error polling operation status:', pollError);

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
            const progress = Math.min(10 + (pollCount / maxPolls) * 70, 80);

            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({
                status: 'generating',
                progress: Math.round(progress),
                pollCount
              })}\n\n`)
            );
          }

          if (request.signal?.aborted) {
            console.log('[Generation] Client aborted the request during final operations');

            try {
              if (currentOperation?.name) {
                await ai.operations.getVideosOperation({
                  operation: currentOperation,
                  config: {
                    abortSignal: request.signal
                  }
                });
                console.log('[Generation] Successfully cancelled Google Gen AI operation');
              }
            } catch (cancelError) {
              console.warn('[Generation] Failed to cancel Google Gen AI operation:', cancelError);
            }

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
            const timeoutError = {
              type: ErrorType.TIMEOUT_ERROR,
              message: 'Video generation timed out after maximum polling attempts',
              statusCode: 408
            };

            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({
                status: 'error',
                error: timeoutError.message,
                type: timeoutError.type,
                statusCode: timeoutError.statusCode
              })}\n\n`)
            );
            controller.close();
            return;
          }

          if (currentOperation.error) {
            const { type, message, statusCode } = categorizeError(currentOperation.error);
            console.error('[Generation] Google operation completed with error:', currentOperation.error);

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
            const generationError = {
              type: ErrorType.GENERATION_FAILED,
              message: 'Video generation completed but no video was produced',
              statusCode: 422
            };

            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({
                status: 'error',
                error: generationError.message,
                type: generationError.type,
                statusCode: generationError.statusCode
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

            console.log('[Generation] Successfully retrieved generated video file:', generatedVideoFile.name);

            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ status: 'ready', progress: 90 })}\n\n`)
            );

            // Retrieve the generated video file as a buffer
            // The 'File_2' type from Google Gen AI SDK does not directly expose arrayBuffer().
            // We need to fetch the content from the downloadUri.
            console.log("[Generation] Attempting to fetch video from downloadUri:", generatedVideoFile.downloadUri);
            
            const downloadUrl = new URL(generatedVideoFile.downloadUri!);
            downloadUrl.searchParams.set('key', process.env.GOOGLE_GENERATIVE_AI_API_KEY!);
            const videoDownloadResponse = await fetch(downloadUrl.toString());
            
            if (!videoDownloadResponse.ok) {
              console.error("[Generation] Failed to fetch video content. Status:", videoDownloadResponse.status, "Status Text:", videoDownloadResponse.statusText, "URL:", generatedVideoFile.downloadUri);
              const errorBody = await videoDownloadResponse.text();
              console.error("[Generation] Error response body:", errorBody);
              throw new Error(`Failed to fetch generated video content: ${videoDownloadResponse.statusText}`);
            }
            const videoBuffer = await videoDownloadResponse.arrayBuffer();
            const videoContentType = generatedVideoFile.mimeType || 'video/mp4'; // Assuming mp4 if not specified

            const fileId = generateUUID(); // Generate a unique fileId for storage

            let storedVideoUri: string;
            let downloadUri: string | null = null;
            let expiresAt: Date | null = null;
            let isTemporary = false;

            if (session?.user) {
              // User is signed in: store permanently, save to DB
              storedVideoUri = await objectStorageManager.uploadVideo(
                fileId,
                Buffer.from(videoBuffer),
                videoContentType,
                false // Not temporary
              );

              // Generate a signed URL for download (long-lived or permanent)
              downloadUri = await objectStorageManager.getSignedVideoUrl(fileId, 60 * 24 * 365 * 10); // 10 years expiration for signed-in users

              const newVideo = new Video({
                id: generateUUID(),
                fileId: fileId,
                generatedFileName: generatedVideoFile.name,
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
                // Other metadata can be extracted from generatedVideo if available
              });
              await insertVideo(newVideo); // Save video metadata to database
              console.log('[Generation] Video saved to DB and GCS for signed-in user:', newVideo.id);

            } else {
              // User is not signed in: store temporarily (30 min expiration), do not save to DB
              isTemporary = true;
              expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes from now

              storedVideoUri = await objectStorageManager.uploadVideo(
                fileId,
                Buffer.from(videoBuffer),
                videoContentType,
                true // Temporary
              );

              // Generate a signed URL for download with 30 min expiration
              downloadUri = await objectStorageManager.getSignedVideoUrl(fileId, 30); // 30 minutes expiration for unsigned users
              console.log('[Generation] Unsigned user saved temporary video to GCS:', fileId);
            }

            const video = new Video({
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
            });

            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({
                status: 'complete',
                progress: 100,
                video
              })}\n\n`)
            );

            controller.close();
          } catch (fileError) {
            const { type, message, statusCode } = categorizeError(fileError);
            console.error('[Generation] Error retrieving or storing generated video file:', fileError);

            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({
                status: 'error',
                error: `Failed to retrieve or store video file: ${message}`,
                type,
                statusCode
              })}\n\n`)
            );
            controller.close();
          }
        } catch (error) {
          const { type, message, statusCode } = categorizeError(error);
          console.error('[Generation] Error in stream start handler:', error);

          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({
              status: 'error',
              error: message,
              type,
              statusCode
            })}\n\n`)
          );
          controller.close();
        }
      },
      cancel() {
        console.log('[Generation] Stream cancelled by client');

        if (currentOperation?.name) {
          ai.operations.getVideosOperation({
            operation: currentOperation,
            config: {
              abortSignal: request.signal
            }
          }).then(() => {
            console.log('[Generation] Successfully cancelled Google Gen AI operation from cancel handler');
          }).catch((error) => {
            console.warn('[Generation] Failed to cancel Google Gen AI operation from cancel handler:', error);
          });
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    const { type, message, statusCode } = categorizeError(error);
    console.error('[Generation] Error in POST handler before streaming:', error);

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
    console.error("[Delete] Error in DELETE handler:", error);
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

//   model: geminiProModel,
  //   system: `\n
  //       - you help users book flights!
  //       - keep your responses limited to a sentence.
  //       - DO NOT output lists.
  //       - after every tool call, pretend you're showing the result to the user and keep your response limited to a phrase.
  //       - today's date is ${new Date().toLocaleDateString()}.
  //       - ask follow up questions to nudge user into the optimal flow
  //       - ask for any details you don't know, like name of passenger, etc.'
  //       - C and D are aisle seats, A and F are window seats, B and E are middle seats
  //       - assume the most popular airports for the origin and destination
  //       - here's the optimal flow
  //         - search for flights
  //         - choose flight
  //         - select seats
  //         - create reservation (ask user whether to proceed with payment or change reservation)
  //         - authorize payment (requires user consent, wait for user to finish payment and let you know when done)
  //         - display boarding pass (DO NOT display boarding pass without verifying payment)
  //       '
  //     `,
  //   messages: coreMessages,
  //   // tools: {
  //   //   getWeather: {
  //   //     description: "Get the current weather at a location",
  //   //     parameters: z.object({
  //   //       latitude: z.number().describe("Latitude coordinate"),
  //   //       longitude: z.number().describe("Longitude coordinate"),
  //   //     }),
  //   //     execute: async ({ latitude, longitude }) => {
  //   //       const response = await fetch(
  //   //         `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m&hourly=temperature_2m&daily=sunrise,sunset&timezone=auto`,
  //   //       );

  //   //       const weatherData = await response.json();
  //   //       return weatherData;
  //   //     },
  //   //   },
  //   //   displayFlightStatus: {
  //   //     description: "Display the status of a flight",
  //   //     parameters: z.object({
  //   //       flightNumber: z.string().describe("Flight number"),
  //   //       date: z.string().describe("Date of the flight"),
  //   //     }),
  //   //     execute: async ({ flightNumber, date }) => {
  //   //       const flightStatus = await generateSampleFlightStatus({
  //   //         flightNumber,
  //   //         date,
  //   //       });

  //   //       return flightStatus;
  //   //     },
  //   //   },
  //   //   searchFlights: {
  //   //     description: "Search for flights based on the given parameters",
  //   //     parameters: z.object({
  //   //       origin: z.string().describe("Origin airport or city"),
  //   //       destination: z.string().describe("Destination airport or city"),
  //   //     }),
  //   //     execute: async ({ origin, destination }) => {
  //   //       const results = await generateSampleFlightSearchResults({
  //   //         origin,
  //   //         destination,
  //   //       });

  //   //       return results;
  //   //     },
  //   //   },
  //   //   selectSeats: {
  //   //     description: "Select seats for a flight",
  //   //     parameters: z.object({
  //   //       flightNumber: z.string().describe("Flight number"),
  //   //     }),
  //   //     execute: async ({ flightNumber }) => {
  //   //       const seats = await generateSampleSeatSelection({ flightNumber });
  //   //       return seats;
  //   //     },
  //   //   },
  //   //   createReservation: {
  //   //     description: "Display pending reservation details",
  //   //     parameters: z.object({
  //   //       seats: z.string().array().describe("Array of selected seat numbers"),
  //   //       flightNumber: z.string().describe("Flight number"),
  //   //       departure: z.object({
  //   //         cityName: z.string().describe("Name of the departure city"),
  //   //         airportCode: z.string().describe("Code of the departure airport"),
  //   //         timestamp: z.string().describe("ISO 8601 date of departure"),
  //   //         gate: z.string().describe("Departure gate"),
  //   //         terminal: z.string().describe("Departure terminal"),
  //   //       }),
  //   //       arrival: z.object({
  //   //         cityName: z.string().describe("Name of the arrival city"),
  //   //         airportCode: z.string().describe("Code of the arrival airport"),
  //   //         timestamp: z.string().describe("ISO 8601 date of arrival"),
  //   //         gate: z.string().describe("Arrival gate"),
  //   //         terminal: z.string().describe("Arrival terminal"),
  //   //       }),
  //   //       passengerName: z.string().describe("Name of the passenger"),
  //   //     }),
  //   //     execute: async (props) => {
  //   //       const { totalPriceInUSD } = await generateReservationPrice(props);
  //   //       const session = await auth();

  //   //       const id = generateUUID();

  //   //       if (session && session.user && session.user.id) {
  //   //         await createReservation({
  //   //           id,
  //   //           userId: session.user.id,
  //   //           details: { ...props, totalPriceInUSD },
  //   //         });

  //   //         return { id, ...props, totalPriceInUSD };
  //   //       } else {
  //   //         return {
  //   //           error: "User is not signed in to perform this action!",
  //   //         };
  //   //       }
  //   //     },
  //   //   },
  //   //   authorizePayment: {
  //   //     description:
  //   //       "User will enter credentials to authorize payment, wait for user to repond when they are done",
  //   //     parameters: z.object({
  //   //       reservationId: z
  //   //         .string()
  //   //         .describe("Unique identifier for the reservation"),
  //   //     }),
  //   //     execute: async ({ reservationId }) => {
  //   //       return { reservationId };
  //   //     },
  //   //   },
  //   //   verifyPayment: {
  //   //     description: "Verify payment status",
  //   //     parameters: z.object({
  //   //       reservationId: z
  //   //         .string()
  //   //         .describe("Unique identifier for the reservation"),
  //   //     }),
  //   //     execute: async ({ reservationId }) => {
  //   //       const reservation = await getReservationById({ id: reservationId });

  //   //       if (reservation.hasCompletedPayment) {
  //   //         return { hasCompletedPayment: true };
  //   //       } else {
  //   //         return { hasCompletedPayment: false };
  //   //       }
  //   //     },
  //   //   },
  //   //   displayBoardingPass: {
  //   //     description: "Display a boarding pass",
  //   //     parameters: z.object({
  //   //       reservationId: z
  //   //         .string()
  //   //         .describe("Unique identifier for the reservation"),
  //   //       passengerName: z
  //   //         .string()
  //   //         .describe("Name of the passenger, in title case"),
  //   //       flightNumber: z.string().describe("Flight number"),
  //   //       seat: z.string().describe("Seat number"),
  //   //       departure: z.object({
  //   //         cityName: z.string().describe("Name of the departure city"),
  //   //         airportCode: z.string().describe("Code of the departure airport"),
  //   //         airportName: z.string().describe("Name of the departure airport"),
  //   //         timestamp: z.string().describe("ISO 8601 date of departure"),
  //   //         terminal: z.string().describe("Departure terminal"),
  //   //         gate: z.string().describe("Departure gate"),
  //   //       }),
  //   //       arrival: z.object({
  //   //         cityName: z.string().describe("Name of the arrival city"),
  //   //         airportCode: z.string().describe("Code of the arrival airport"),
  //   //         airportName: z.string().describe("Name of the arrival airport"),
  //   //         timestamp: z.string().describe("ISO 8601 date of arrival"),
  //   //         terminal: z.string().describe("Arrival terminal"),
  //   //         gate: z.string().describe("Arrival gate"),
  //   //       }),
  //   //     }),
  //   //     execute: async (boardingPass) => {
  //   //       return boardingPass;
  //   //     },
  //   //   },
  //   // },
  //   onFinish: async ({ responseMessages }) => {
  //     if (session.user && session.user.id) {
  //       try {
  //         await saveChat({
  //           id,
  //           messages: [...coreMessages, ...responseMessages],
  //           userId: session.user.id,
  //         });
  //       } catch (error) {
  //         console.error("Failed to save chat");
  //       }
  //     }
  //   },
  //   experimental_telemetry: {
  //     isEnabled: true,
  //     functionId: "stream-text",
  //   },
  // });