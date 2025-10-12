import { convertToCoreMessages, generateObject, Message, streamText } from "ai";
import { z } from "zod";

import { geminiProModel } from "@/ai";
import {
  generateReservationPrice,
  generateSampleFlightSearchResults,
  generateSampleFlightStatus,
  generateSampleSeatSelection,
} from "@/ai/actions";
import { auth } from "@/app/(auth)/auth";
import {
  createReservation,
  deleteChatById,
  getChatById,
  getReservationById,
  saveChat,
} from "@/db/queries";
import { generateUUID } from "@/lib/utils";
import ai from "@/lib/gemini";
import { NextResponse } from "next/server";
import { GenerateVideosOperation } from "@google/genai";

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
  
  // Authentication/Authorization errors
  if (errorMessage.includes('unauthorized') || errorMessage.includes('authentication') || 
      errorMessage.includes('permission') || error?.status === 401 || error?.status === 403) {
    return {
      type: ErrorType.AUTHENTICATION_ERROR,
      message: 'Authentication failed or insufficient permissions',
      statusCode: 401
    };
  }
  
  // Quota/Rate limiting errors
  if (errorMessage.includes('quota') || errorMessage.includes('rate limit') || 
      errorMessage.includes('too many requests') || error?.status === 429) {
    return {
      type: ErrorType.QUOTA_EXCEEDED,
      message: 'API quota exceeded or rate limit reached',
      statusCode: 429
    };
  }
  
  // Invalid request errors
  if (errorMessage.includes('invalid') || errorMessage.includes('bad request') || 
      error?.status === 400) {
    return {
      type: ErrorType.INVALID_REQUEST,
      message: 'Invalid request parameters or format',
      statusCode: 400
    };
  }
  
  // Timeout errors
  if (errorMessage.includes('timeout') || errorMessage.includes('deadline') ||
      error?.code === 'DEADLINE_EXCEEDED') {
    return {
      type: ErrorType.TIMEOUT_ERROR,
      message: 'Request timed out',
      statusCode: 408
    };
  }
  
  // Network/connection errors
  if (errorMessage.includes('network') || errorMessage.includes('connection') ||
      errorMessage.includes('fetch') || error?.code === 'ECONNREFUSED') {
    return {
      type: ErrorType.NETWORK_ERROR,
      message: 'Network connection error',
      statusCode: 503
    };
  }
  
  // Generation specific failures
  if (errorMessage.includes('generation failed') || errorMessage.includes('content policy') ||
      errorMessage.includes('safety') || error?.status === 422) {
    return {
      type: ErrorType.GENERATION_FAILED,
      message: 'Video generation failed due to content policy or safety restrictions',
      statusCode: 422
    };
  }
  
  // Default to unknown error
  return {
    type: ErrorType.UNKNOWN_ERROR,
    message: errorMessage,
    statusCode: 500
  };
}

export async function POST(request: Request) {
  try {
    const { id, messages }: { id: string; messages: Array<Message> } =
      await request.json();
    
    const session = await auth();
    
    // Check authentication
    // if (!session || !session.user) {
    //   return NextResponse.json(
    //     { 
    //       error: 'Authentication required',
    //       type: ErrorType.AUTHENTICATION_ERROR
    //     },
    //     { status: 401 }
    //   );
    // }
    
    // Validate request data
    if (!messages || messages.length === 0 || !messages[0]?.content) {
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

          currentOperation = await ai.models.generateVideos({
            model: 'veo-2.0-generate-001',
            source: {
              prompt: messages[0].content,
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
              console.log('Client aborted the request, stopping video generation');
              
              try {
                if (currentOperation?.name) {
                  await ai.operations.getVideosOperation({
                    operation: currentOperation,
                    config: {
                      abortSignal: request.signal
                    }
                  })
                  console.log('Successfully cancelled Google Gen AI operation');
                }
              } catch (cancelError) {
                console.warn('Failed to cancel Google Gen AI operation:', cancelError);
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
              console.error('Error polling operation status:', pollError);
              
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
            console.log('Client aborted the request during final operations');
            
            try {
              if (currentOperation?.name) {
                await ai.operations.getVideosOperation({
                  operation: currentOperation,
                  config: {
                    abortSignal: request.signal
                  }
                });
                console.log('Successfully cancelled Google Gen AI operation');
              }
            } catch (cancelError) {
              console.warn('Failed to cancel Google Gen AI operation:', cancelError);
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

          // Check if operation completed successfully
          if (currentOperation.error) {
            const { type, message, statusCode } = categorizeError(currentOperation.error);
            console.error('Google operation completed with error:', currentOperation.error);
            
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

          // Check if we have a valid response
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
            const generatedVideo = await ai.files.get({
              name: currentOperation.response.generatedVideos[0].video.uri,
            });

            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ status: 'ready', progress: 90 })}\n\n`)
            );

            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ 
                status: 'complete', 
                progress: 100,
                video: generatedVideo 
              })}\n\n`)
            );

            controller.close();
          } catch (fileError) {
            const { type, message, statusCode } = categorizeError(fileError);
            console.error('Error retrieving generated video file:', fileError);
            
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ 
                status: 'error',
                error: `Failed to retrieve video file: ${message}`,
                type,
                statusCode
              })}\n\n`)
            );
            controller.close();
          }
        } catch (error) {
          // Instead of handling and sending via SSE, rethrow to let it bubble up to the top-level error handler.
          throw error;
        }
      },
      cancel() {
        console.log('Stream cancelled by client');
        
        if (currentOperation?.name) {
          ai.operations.getVideosOperation({
            operation: currentOperation,
            config: {
              abortSignal: request.signal
            }
          }).then(() => {
            console.log('Successfully cancelled Google Gen AI operation from cancel handler');
          }).catch((error) => {
            console.warn('Failed to cancel Google Gen AI operation from cancel handler:', error);
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
    // Handle errors that occur before streaming starts
    const { type, message, statusCode } = categorizeError(error);
    console.error('Error in POST handler before streaming:', error);
    
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
    console.error("Error in DELETE handler:", error);
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