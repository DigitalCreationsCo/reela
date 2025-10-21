"use client";

import { Attachment, Message } from "ai";
import { useScrollToBottom } from "@/components/custom/use-scroll-to-bottom";
import { MultimodalInput } from "./multimodal-input";
import { Overview } from "./overview";
import { Session } from "next-auth";
import { useEffect, useState } from "react";
import { File } from "@google/genai";
import { MockVideoReel } from "../video/mock-reel";
import { createMockVideo } from "@/lib/mock-utils";
import { Video } from "@/db/schema";
import { SAMPLE_VIDEOS } from "@/lib/sample/sample_videos";

export async function mockAsyncFetch(url: string, options?: any) {
  const delay = (ms: number) => new Promise(res => setTimeout(res, ms));
  const randomMs = 600 + Math.random() * 800;

  console.log('[mockAsyncFetch] Invoked with:', { url, options, randomMs });

  const sampleVideo = SAMPLE_VIDEOS[Math.floor(Math.random() * SAMPLE_VIDEOS.length)];
  // /api/videos/stream: streaming binary video file dFata
  if (url.includes("/stream/")) {
    
    let sent = 0;
    let chunkNum = 0;
    const total = sampleVideo.fileSize; // Use actual file size from sample video
    console.log('[mockAsyncFetch] Simulating /stream/ endpoint for video:', { 
      videoId: sampleVideo.id, 
      title: sampleVideo.title, 
      fileSize: total,
      uri: sampleVideo.uri 
    });
    
    // Simulate binary chunks of the actual video file
    function createChunk(size: number) {
      console.log('[mockAsyncFetch] Creating chunk of size:', size);
      // Create more realistic video-like binary data instead of random
      const chunk = new Uint8Array(size);
      // Add some MP4-like headers for the first chunk
      if (chunkNum === 1) {
        // MP4 file signature bytes
        const mp4Header = [0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70]; // ftYp box start
        for (let i = 0; i < Math.min(mp4Header.length, size); i++) {
          chunk[i] = mp4Header[i];
        }
        // Fill rest with structured data
        for (let i = mp4Header.length; i < size; i++) {
          chunk[i] = (i % 256);
        }
      } else {
        // For subsequent chunks, use more structured data
        for (let i = 0; i < size; i++) {
          chunk[i] = ((sent + i) % 256);
        }
      }
      return chunk;
    }
    
    return {
      ok: true,
      status: 200,
      headers: new Map([
        ["Content-Length", `${total}`],
        ["Content-Type", "video/mp4"],
        // ["Content-Disposition", `attachment; filename="${sampleVideo.title.replace(/[^a-zA-Z0-9]/g, '_')}.mp4"`]
      ]),
      body: {
        // Simulate a getReader API for fetch streams
        getReader() {
          console.log('[mockAsyncFetch] getReader() for /stream/ - video:', sampleVideo.title);
          return {
            async read() {
              if (sent >= total) {
                console.log('[mockAsyncFetch] All stream chunks sent for video:', sampleVideo.title);
                return { done: true, value: undefined };
              }
              chunkNum++;
              const chunkSize = Math.min(
                512 * 1024 + chunkNum * 32 * 1024,
                total - sent
              );
              await delay(90 + Math.random() * 70); // Simulate chunk network delay
              sent += chunkSize;
              console.log(`[mockAsyncFetch] Sending chunk #${chunkNum} for "${sampleVideo.title}", size: ${chunkSize}, sent: ${sent}/${total}`);
              return {
                done: sent >= total,
                value: createChunk(chunkSize)
              };
            }
          };
        }
      },
      async blob() {
        // Return a mock blob for binary video data
        console.log('[mockAsyncFetch] Returning mock mp4 blob for /stream/ - video:', sampleVideo.title);
        const mockData = new Uint8Array(total);
        // Add MP4 signature at the beginning
        const mp4Header = [0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70];
        for (let i = 0; i < Math.min(mp4Header.length, total); i++) {
          mockData[i] = mp4Header[i];
        }
        // Fill rest with structured data
        for (let i = mp4Header.length; i < total; i++) {
          mockData[i] = (i % 256);
        }
        return new Blob([mockData], { type: 'video/mp4' });
      }
    };
  }

  // /api/videos/generate or /api/videos/generate/extend: stream NDJSON data for progress
  if (
    url.includes("/api/videos/generate/extend") ||
    (url.includes("/api/videos/generate") && !url.includes("/stream/"))
  ) {
    console.log('[mockAsyncFetch] Simulating /generate or /generate/extend endpoint.');
    // Simulate a streamed text/event response: each chunk is a JSON progress object (as NDJSON/SSE)
    // Real API: stream would look like:  data: {...}\n\n (SSE), we simulate as { value } in bytes

    const { uri, downloadUri, title: displayName, fileId: name, createdAt: createTime, fileSize: sizeBytes} = sampleVideo;
    
    const generatedVideo = {
      uri, downloadUri, name, displayName, createTime, sizeBytes
    };

    const steps = [
      { status: "initiating", progress: 0 },
      { status: "generating", progress: 10 },
      { status: "generating", progress: 30 },
      { status: "generating", progress: 55 },
      { status: "generating", progress: 80 },
      { status: "retrieving", progress: 85 },
      { status: "ready", progress: 90 },
      { status: "complete", progress: 100, video: generatedVideo },
    ];
    let idx = 0;
    return {
      ok: true,
      status: 200,
      headers: new Map([["Content-Type", "text/event-stream"]]),
      body: {
        getReader() {
          console.log('[mockAsyncFetch] getReader() for /generate');
          return {
            async read() {
              if (idx >= steps.length) {
                // End of stream
                await delay(180);
                console.log('[mockAsyncFetch] All event stream chunks sent.');
                return { done: true, value: undefined };
              }
              const event = steps[idx++];
              // Mimic SSE line: data: {...}\n\n
              const chunkStr = `data: ${JSON.stringify(event)}\n\n`;
              await delay(300 + Math.random() * 100);
              console.log(`[mockAsyncFetch] Sending event chunk:`, event);
              // Return as Uint8Array for fetch stream contract
              return {
                done: false,
                value: new TextEncoder().encode(chunkStr)
              };
            }
          }
        }
      },
      async blob() {
        // Return a mock blob for SSE data
        const allData = steps.map(step => `data: ${JSON.stringify(step)}\n\n`).join('');
        console.log('[mockAsyncFetch] Returning mock SSE blob for /generate.');
        return new Blob([allData], { type: 'text/event-stream' });
      }
    };
  }

  // fail fallback
  console.warn('[mockAsyncFetch] Fallback error for URL:', url);
  return {
    ok: false,
    status: 500,
    json: async () => ({
      error: "Mock fetch error"
    }),
    async text() { return "Mock fetch error"; },
    async blob() {
      // Return a mock error blob
      return new Blob(["Mock fetch error"], { type: 'text/plain' });
    }
  };
}

type VideoGenerationStatus = 'idle' | 'initiating' | 'generating' | 'retrieving' | 'ready' | 'downloading' | 'complete' | 'error';

export function MockChat({
  id,
  initialMessages,
  session,
}: {
  id: string;
  initialMessages: Array<Message>;
  session: Session | null;
}) {
  const append =(message: any) => {
    setMessages(prev => [...prev, message]);
    console.log('[MockChat] Appended message:', message);
  };
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [videos, setVideos] = useState<Video[]>([]);
  const [attachments, setAttachments] = useState<Array<Attachment>>([]);
  const [messagesContainerRef, messagesEndRef] = useScrollToBottom<HTMLDivElement>();
  const [videoError, setVideoError] = useState<string>('');

  const [generationStatus, setGenerationStatus] = useState<VideoGenerationStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  useEffect(() => {
    console.log('[MockChat] Video state changed. Current videos:', videos);
    console.log('[MockChat] Most recent video in array:', videos[videos.length -1]);
  }, [videos]);
  
  const stop = () => {
    console.log('[MockChat] stop() called. (Would trigger abort in real scenario)');
  };

  const handleVideoGeneration = async (prompt: string) => {
    console.log('[MockChat] handleVideoGeneration called with prompt:', prompt);
    setIsGenerating(true);
    setGenerationStatus('initiating');
    setProgress(0);
    setVideoError('');

    const controller = new AbortController();
    setAbortController(controller);

    try {
      console.log('[MockChat] Calling mockAsyncFetch for /api/videos/generate');
      const response = await mockAsyncFetch('/api/videos/generate')
      console.log('[MockChat] mockAsyncFetch response:', response);

      if (!response.ok) {
        console.error('[MockChat] mockAsyncFetch responded with not ok:', response.status);
        throw new Error('Failed to start video generation');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        console.error('[MockChat] No response body returned from fetch');
        throw new Error('No response body');
      }

      let chunkCount = 0;
      while (true) {
        const { done, value } = await reader.read();
        chunkCount++;
        console.log(`[MockChat] Read chunk #${chunkCount} from video generation stream. done: ${done}, value length: ${value ? value.length : 0}`);
        if (done) break;

        const chunk = decoder.decode(value);
        console.log(`[MockChat] Decoded chunk:`, chunk);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            let data;
            try {
              data = JSON.parse(line.slice(6));
              console.log('[MockChat] SSE Data:', data);
            } catch (e) {
              console.error('[MockChat] Failed to parse SSE data line:', line, 'Error:', e);
              continue;
            }

            if (data.status) {
              setGenerationStatus(data.status);
              console.log('[MockChat] Updated generationStatus:', data.status);
            }
            
            if (data.progress !== undefined) {
              setProgress(data.progress);
              console.log('[MockChat] Updated progress:', data.progress);
            }

            if (data.status === "complete" && data.video) {
              setGenerationStatus('downloading');
              setProgress(95);
              console.log('[MockChat] Video generation complete, preparing video UI.');
              console.log('[MockChat] data: ', data);

              const { uri, downloadUri, name, displayName, createTime, sizeBytes } = data.video;
              const fileId = name!.replace('files/', '');
              const newVideo = new Video({
                uri: uri!,
                fileId,
                downloadUri: downloadUri || null,
                prompt,
                author: session?.user?.name || 'Anonymous',
                userId: session?.user?.id || 'anonymous', 
                format: 'mp4',
                fileSize: Number(sizeBytes),
                status: 'ready',
                createdAt: new Date(createTime!)
              });

              setVideos((prev: any) => [...prev, newVideo]);

              setProgress(data.progress);
              setGenerationStatus(data.status);
              setIsGenerating(false);
              setAbortController(null);

              console.log('[MockChat] Video appended and generation marked complete.');
            }

            if (data.status === 'error') {
              console.error('[MockChat] Video generation error:', data.error);
              setVideoError(data.error || 'An error occurred');
              setIsGenerating(false);
              setAbortController(null); 
            }
          }
        }
      }
      console.log('[MockChat] handleVideoGeneration stream finished.');
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('[MockChat] Video generation aborted by user');
        setVideoError('Video generation cancelled');
      } else {
        console.error('[MockChat] Error during mock fetch:', error);
        setVideoError(error instanceof Error ? error.message : 'Unknown error');
      }
      setIsGenerating(false);
      setGenerationStatus('error');
      setAbortController(null);
    }
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    console.log('[MockChat] handleSubmit event:', e);

    e?.preventDefault();
    if (!input.trim()) {
      console.log('[MockChat] Input trimmed empty, not submitting.');
      return;
    }

    const prompt = input;
    setInput('');
    
    append({
      role: 'user',
      content: prompt,
    });

    console.log('[MockChat] Calling handleVideoGeneration with prompt:', prompt);
    await handleVideoGeneration(prompt);
  };

  console.log('[MockChat] Rendering MockChat. Current state:', {
    input,
    messages,
    videos,
    isGenerating,
    generationStatus,
    progress,
    videoError,
    attachments
  });

  return (
    <div className="flex flex-col h-[92vh] justify-center bg-background">
      <div className="flex flex-col mx-auto w-full h-full">
        
        {!videos.length && !isGenerating && !messages.length && (
          <div className="flex-1 flex items-center justify-center h-200">
            <Overview />
          </div>
        ) || <></>}

        <MockVideoReel 
          videos={videos} 
          session={session} 
          isGenerating={isGenerating} 
          generationStatus={generationStatus}
          progress={progress}
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
            />
          </form>
        </div>
      </div>
    </div>
  );
};