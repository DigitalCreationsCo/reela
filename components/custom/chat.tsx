"use client";

import { Attachment, Message } from "ai";
import { useScrollToBottom } from "@/components/custom/use-scroll-to-bottom";
import { MultimodalInput } from "./multimodal-input";
import { Overview } from "./overview";
import { Session } from "next-auth";
import { useCallback, useEffect, useState } from "react";
import { VideoReel } from "../video/reel";
import { Video } from "@/db/schema";
import { useVideoState } from "@/hooks/useVideoState";
import { useVideoGenerator } from "@/hooks/useVideoGenerator";
import { mockAsyncFetch } from "@/lib/mock-async-fetch";
import { AttachmentType } from "@/lib/types";

// WebSocket / connection error indicator state
function useWebSocketConnectionStatus() {
  const [wsError, setWsError] = useState<string | null>(null);

  useEffect(() => {
    // Replace with your actual WebSocket URL if known, or adjust the detection logic as needed.
    // If your backend requires authentication or a specific protocol, update wsUrl accordingly.
    // This demonstrates a generic ws:// (or wss://) connection attempt to illustrate network failure.
    let wsUrl = process.env.NEXT_PUBLIC_WS_URL || ""; // fallback to empty string if env not set
    if (!wsUrl) return;

    let ws: WebSocket | null = null;
    let didUnmount = false;

    function handleOpen() {
      if (!didUnmount) setWsError(null);
    }
    function handleError() {
      if (!didUnmount) setWsError("Could not connect to server (WebSocket error). Please check your network or try again later.");
    }
    function handleClose(e: CloseEvent) {
      if (!didUnmount && e.code !== 1000) { // 1000 = clean close
        setWsError("Lost connection to the server (WebSocket closed). Please try refreshing or check your connection.");
      }
    }

    try {
      ws = new WebSocket(wsUrl);
      ws.addEventListener("open", handleOpen);
      ws.addEventListener("error", handleError);
      ws.addEventListener("close", handleClose);
    } catch (err) {
      if (!didUnmount) setWsError("Could not initialize WebSocket connection.");
    }

    return () => {
      didUnmount = true;
      if (ws) {
        ws.removeEventListener("open", handleOpen);
        ws.removeEventListener("error", handleError);
        ws.removeEventListener("close", handleClose);
        ws.close();
      }
    };
  }, []);

  return wsError;
}

export function Chat({
  id,
  initialMessages,
  session,
}: {
  id: string;
  initialMessages: Array<Message>;
  session: Session | null;
}) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<any[]>([]);
  const [attachments, setAttachments] = useState<Array<AttachmentType>>([]);
  const [modelName, setModelName] = useState<string>("veo-3.1-generate-preview"); // Default model
  const [duration, setDuration] = useState<number>(8); // Default duration to 8

  const availableModels = [
    { name: "Veo 2", id: "veo-2.0-generate-001", durations: [5, 6, 7, 8], defaultDuration: 8 },
    { name: "Veo 3", id: "veo-3.1-generate-preview", durations: [4, 6, 8], defaultDuration: 8 },
  ];

  const currentModel = availableModels.find(model => model.id === modelName) || availableModels[1]; // Fallback to Veo 3

  useEffect(() => {
    // Adjust duration if the current duration is not valid for the selected model
    if (!currentModel.durations.includes(duration)) {
      setDuration(currentModel.defaultDuration);
    }
  }, [modelName, duration, currentModel]);

  const { state, actions } = useVideoState();
  const { videos, generationStatus, progress, isGenerating } = state;
  const { setStatus, setProgress, setError, setIsGenerating } = actions;

  const fetchFn = process.env.NODE_ENV === "test" ? mockAsyncFetch : fetch;

  const { generate, abort } = useVideoGenerator({ fetchFn });

  const append = useCallback((m: any) => setMessages(prev => [...prev, m]), []);

  const handleGenerateVideo = useCallback(
    async (prompt: string, durationSeconds: number, model: string, extraAttachments?: Array<AttachmentType>) => {
      setIsGenerating(true);
      setStatus("initiating");
      setProgress(0);
      setError(null);

      const attachmentsToSend = (extraAttachments !== undefined
        ? [...attachments, ...extraAttachments]
        : attachments
      ) || [];

      await generate(id, prompt, durationSeconds, model, (evt) => {
        switch (evt.type) {
          case "status":
            actions.setStatus(evt.payload);
            break;
          case "progress":
            actions.setProgress(evt.payload);
            break;
          case "complete": {
            const video = new Video(evt.payload);
            // const item = new Video({
            //   uri: video.uri,
            //   fileId: (video.name || "").replace("files/", ""),
            //   downloadUri: video.downloadUri || null,
            //   prompt,
            //   author: session?.user?.name || "Anonymous",
            //   userId: session?.user?.id || "anonymous",
            //   format: "mp4",
            //   fileSize: Number(video.sizeBytes || 0),
            //   status: "ready" as const,
            //   createdAt: video.createTime ? new Date(video.createTime) : new Date(),
            //   // Optionally include attachments here if your Video model supports them
            //   // attachments: attachmentsToSend.length > 0 ? attachmentsToSend : undefined,
            // });
            actions.addVideo(video);
            actions.setProgress(100);
            actions.setStatus("complete");
            actions.setIsGenerating(false);
            break;
          }
          case "error":
            actions.setError(evt.payload ?? "Error");
            actions.setIsGenerating(false);
            actions.setStatus("error");
            break;
          case "aborted":
            actions.setError("Generation aborted");
            actions.setIsGenerating(false);
            actions.setStatus("idle");
            break;
        }
      }, attachmentsToSend); // <-- Pass as 4th param if generate supports it, or bundle in request
    },
    [actions, generate, session, attachments]
  );

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e?.preventDefault();
    const content = input.trim();
    if (!content) {
      return;
    }

    append({
      role: "user",
      content,
      durationSeconds: duration,
      modelName: modelName,
    });
    setInput("");
    await handleGenerateVideo(content, duration, modelName);
  }, [input, handleGenerateVideo, append, duration, modelName]);

  const stop = useCallback(() => {
    abort();
  }, [abort]);

  // Check websocket connection status and display error if present
  const wsError = useWebSocketConnectionStatus();

  return (
    <div className="flex flex-col h-[92vh] justify-center bg-background">
      <div className="flex flex-col mx-auto w-full h-full">
        {wsError ? (
          <div className="flex flex-row items-center justify-center w-full p-4 bg-red-100 text-red-800 border border-red-400 rounded mb-4 text-center select-none">
            <span className="mx-2">{wsError}</span>
          </div>
        ) : null}
        {
          !videos.length && !isGenerating && !messages.length && (
            <div className="flex-1 flex items-center justify-center h-200">
              <Overview />
            </div>
          ) || null
        }

        <VideoReel 
          videos={videos} 
          session={session} 
          isGenerating={isGenerating} 
          generationStatus={generationStatus}
          error={state.error}
          progress={progress}
          onPlay={(v) => { console.log('play', v); }}
          onDownload={(v) => { console.log('download', v); }}
          fetchFn={fetchFn}
          duration={duration}
        />

        <div className="p-4">
          <form 
            onSubmit={handleSubmit}
            className="flex flex-row gap-2 relative items-end w-full h-full max-w-2xl mx-auto"
          >
            <MultimodalInput
              input={input}
              setInput={setInput}
              handleSubmit={handleSubmit}
              isLoading={isGenerating}
              stop={stop}
              attachments={attachments}
              setAttachments={setAttachments}
              messages={messages}
              append={append}
              duration={duration}
              setDuration={setDuration}
              availableModels={availableModels}
              modelName={modelName}
              setModelName={setModelName}
            />
          </form>
        </div>
      </div>
    </div>
  );
};