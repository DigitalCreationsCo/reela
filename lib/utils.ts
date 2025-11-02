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
export async function extractFrameDataUrl(videoUrl: string, at: "start" | "end" = "start"): Promise<{ dataUrl: string; blob: Blob }> {
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
        const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
        const blob = await (await fetch(dataUrl)).blob();
        cleanup();
        resolve({ dataUrl, blob });
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
 * Converts a Blob or Buffer (image, audio, video, etc.) to a base64 string.
 * The output is the raw base64 (without data URL prefix).
 * Supports running in both browser and Node.js.
 */
export async function fileToBase64(input: Blob | ArrayBuffer | Uint8Array): Promise<string> {
  // If it's a browser Blob or File, handle as before
  if (typeof window !== "undefined" && typeof FileReader !== "undefined" && (input instanceof Blob)) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(",")[1] ?? "";
        resolve(base64);
      };
      reader.onerror = (e) => {
        reject(new Error("Failed to read file as base64"));
      };
      reader.readAsDataURL(input);
    });
  }

  // Node.js or ArrayBuffer/Uint8Array in browser
  let buffer: Uint8Array;
  if (input instanceof ArrayBuffer) {
    buffer = new Uint8Array(input);
  } else if (ArrayBuffer.isView(input)) {
    buffer = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  } else {
    throw new Error("Unsupported fileToBase64 input type");
  }

  // Node.js: Buffer is available
  if (typeof Buffer !== "undefined") {
    // @ts-ignore: Buffer might not be defined in browsers
    // eslint-disable-next-line no-undef
    return Buffer.from(buffer).toString("base64");
  }

  // Fallback for browser: use btoa on binary string
  let binary = "";
  for (let i = 0; i < buffer.length; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  return btoa(binary);
}