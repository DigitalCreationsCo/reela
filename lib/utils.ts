import {
  CoreMessage,
  CoreToolMessage,
  generateId,
  Message,
  ToolInvocation,
} from "ai";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { Chat } from "@/db/schema";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ApplicationError extends Error {
  info: string;
  status: number;
}

export const fetcher = async (url: string) => {
  const res = await fetch(url);

  if (!res.ok) {
    const error = new Error(
      "An error occurred while fetching the data.",
    ) as ApplicationError;

    error.info = await res.json();
    error.status = res.status;

    throw error;
  }

  return res.json();
};

export function getLocalStorage(key: string) {
  if (typeof window !== "undefined") {
    return JSON.parse(localStorage.getItem(key) || "[]");
  }
  return [];
}

export function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function addToolMessageToChat({
  toolMessage,
  messages,
}: {
  toolMessage: CoreToolMessage;
  messages: Array<Message>;
}): Array<Message> {
  return messages.map((message) => {
    if (message.toolInvocations) {
      return {
        ...message,
        toolInvocations: message.toolInvocations.map((toolInvocation) => {
          const toolResult = toolMessage.content.find(
            (tool) => tool.toolCallId === toolInvocation.toolCallId,
          );

          if (toolResult) {
            return {
              ...toolInvocation,
              state: "result",
              result: toolResult.result,
            };
          }

          return toolInvocation;
        }),
      };
    }

    return message;
  });
}

export function convertToUIMessages(
  messages: Array<CoreMessage>,
): Array<Message> {
  return messages.reduce((chatMessages: Array<Message>, message) => {
    if (message.role === "tool") {
      return addToolMessageToChat({
        toolMessage: message as CoreToolMessage,
        messages: chatMessages,
      });
    }

    let textContent = "";
    let toolInvocations: Array<ToolInvocation> = [];

    if (typeof message.content === "string") {
      textContent = message.content;
    } else if (Array.isArray(message.content)) {
      for (const content of message.content) {
        if (content.type === "text") {
          textContent += content.text;
        } else if (content.type === "tool-call") {
          toolInvocations.push({
            state: "call",
            toolCallId: content.toolCallId,
            toolName: content.toolName,
            args: content.args,
          });
        }
      }
    }

    chatMessages.push({
      id: generateId(),
      role: message.role,
      content: textContent,
      toolInvocations,
    });

    return chatMessages;
  }, []);
}

export function getTitleFromChat(chat: Chat) {
  const messages = convertToUIMessages(chat.messages as Array<CoreMessage>);
  const firstMessage = messages[0];

  if (!firstMessage) {
    return "Untitled";
  }

  return firstMessage.content;
}

export const generationStatusMessage = (status: string): string => {
  switch (status) {
    case "initiating": return "Initiating video generation...";
    case "generating": return "Generating video...";
    case "retrieving": return "Retrieving video...";
    case "ready": return "Video ready, preparing download...";
    case "downloading": return "Downloading video...";
    case "complete": return "Complete!";
    case "error": return "Error occurred";
    default: return "";
  }
};

// Util: get the frame as JPEG dataURL from a video URL
export async function extractFrameDataUrl(videoUrl: string, at: "start" | "end" = "start", mimeType = "image/jpeg"): Promise<{ dataUrl: string; blob: Blob; mimeType: string; }> {
  return new Promise((resolve, reject) => {
    const videoEl = document.createElement("video");
    videoEl.src = videoUrl;
    videoEl.crossOrigin = "anonymous";
    videoEl.preload = "auto";
    videoEl.muted = true;
    let settled = false;

    const cleanup = () => {
      videoEl.pause();
      videoEl.src = "";
      videoEl.remove();
    };

    const handleSeeked = async () => {
      if (settled) return;
      settled = true;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = videoEl.videoWidth;
        canvas.height = videoEl.videoHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("No 2D context");
        ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL(mimeType, 0.92);
        const blob = await (await fetch(dataUrl)).blob();
        cleanup();
        resolve({ dataUrl, blob, mimeType: blob.type });
      } catch (e) {
        cleanup();
        reject(e);
      }
    };

    videoEl.addEventListener("loadedmetadata", () => {
      let seekTime = at === "start" ? 0 : Math.max(videoEl.duration - 0.05, 0);
      if (!isFinite(seekTime) || isNaN(seekTime)) seekTime = 0;
      videoEl.currentTime = seekTime;
    });

    videoEl.addEventListener("seeked", handleSeeked);

    videoEl.addEventListener("error", () => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(new Error("Unable to load video for frame extraction"));
      }
    });

    // Fallback timeout for extraction
    setTimeout(() => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(new Error("Timeout extracting frame"));
      }
    }, 8000);
  });
}

/**
 * Converts a Blob, ArrayBuffer, or Uint8Array to a base64 string (raw base64, no data URL prefix).
 * Handles both browser and Node.js environments.
 * Provides verbose error handling.
 *
 * @param input - Input can be Blob (including File), ArrayBuffer, or Uint8Array
 * @returns Base64 string
 */
export async function fileToBase64(
  input: Blob | ArrayBuffer | Uint8Array
): Promise<string> {
  if (
    typeof window !== "undefined" &&
    typeof FileReader !== "undefined" &&
    input instanceof Blob
  ) {
    return new Promise<string>((resolve, reject) => {
      try {
        const reader = new FileReader();
        reader.onload = () => {
          try {
            if (!reader.result) {
              reject(new Error("FileReader produced empty result."));
              return;
            }
            if (typeof reader.result !== "string") {
              reject(
                new Error(
                  `Unexpected FileReader result type: ${typeof reader.result}. Expected string.`
                )
              );
              return;
            }
            const parts = reader.result.split(",");
            if (parts.length < 2 || !parts[1]) {
              reject(
                new Error(
                  "FileReader returned an invalid data URL: missing base64 payload."
                )
              );
              return;
            }
            resolve(parts[1]);
          } catch (err) {
            reject(
              new Error(
                `Failed to extract base64 string from FileReader result: ${(err as Error).message}`
              )
            );
          }
        };
        reader.onerror = (e) => {
          const error = reader.error;
          reject(
            new Error(
              `Failed to read file as base64 (${
                error ? error.name + ": " + error.message : "unknown error"
              })`
            )
          );
        };
        reader.readAsDataURL(input);
      } catch (err) {
        reject(
          new Error(
            `Unexpected error while reading Blob/File as base64: ${(err as Error).message}`
          )
        );
      }
    });
  }

  let buffer: Uint8Array;

  if (input instanceof ArrayBuffer) {
    buffer = new Uint8Array(input);
  } else if (
    typeof ArrayBuffer !== "undefined" &&
    ArrayBuffer.isView(input) &&
    input instanceof Uint8Array
  ) {
    buffer = input;
  } else if (
    typeof ArrayBuffer !== "undefined" &&
    ArrayBuffer.isView(input)
  ) {
    buffer = new Uint8Array((input as ArrayBufferView).buffer, (input as ArrayBufferView).byteOffset, (input as ArrayBufferView).byteLength);
  } else {
    const actualType =
      input === null
        ? "null"
        : typeof input === "object"
        ? input.constructor?.name || typeof input
        : typeof input;
    throw new Error(
      `Unsupported fileToBase64 input type: ${actualType}. Only Blob, ArrayBuffer, Uint8Array, and TypedArray views are supported.`
    );
  }

  try {
    if (
      typeof Buffer !== "undefined" &&
      typeof Buffer.from === "function"
    ) {
      return Buffer.from(buffer).toString("base64");
    }
  } catch (err) {
  }

  try {
    let binary = "";
    for (let i = 0; i < buffer.length; i++) {
      binary += String.fromCharCode(buffer[i]);
    }
    return btoa(binary);
  } catch (err) {
    throw new Error(
      `Failed to convert buffer to base64 string using browser btoa: ${(err as Error).message}`
    );
  }
}