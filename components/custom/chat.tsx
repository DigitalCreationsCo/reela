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

export function MockChat({
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
  const [attachments, setAttachments] = useState<Array<Attachment>>([]);

  const { state, actions } = useVideoState();
  const { videos, generationStatus, progress, isGenerating } = state;
  const { setStatus, setProgress, setError, setIsGenerating } = actions;

  const fetchFn = process.env.NODE_ENV === "development" ? mockAsyncFetch : fetch;

  const { generate, abort } = useVideoGenerator({ fetchFn });

  const append = useCallback((m: any) => setMessages(prev => [...prev, m]), []);

  const handleGenerateVideo = useCallback(async (prompt: string) => {
    setIsGenerating(true);
    setStatus('initiating');
    setProgress(0);
    setError(null);

    await generate(id,prompt, (evt) => {
      switch (evt.type) {
        case 'status':
          actions.setStatus(evt.payload as any);
          break;
        case 'progress':
          actions.setProgress(evt.payload as number);
          break;
        case 'complete': {
          const video = evt.payload;
          const item = new Video({
            uri: video.uri,
            fileId: (video.name || '').replace('files/', ''),
            downloadUri: video.downloadUri || null,
            prompt,
            author: session?.user?.name || 'Anonymous',
            userId: session?.user?.id || 'anonymous',
            format: 'mp4',
            fileSize: Number(video.sizeBytes || 0),
            status: 'ready' as const,
            createdAt: video.createTime ? new Date(video.createTime) : new Date()
          });
          actions.addVideo(item);
          actions.setProgress(100);
          actions.setStatus('complete');
          actions.setIsGenerating(false);
          break;
        }
        case 'error':
          actions.setError(evt.payload ?? 'Error');
          actions.setIsGenerating(false);
          actions.setStatus('error');
          break;
        case 'aborted':
          actions.setError('Generation aborted');
          actions.setIsGenerating(false);
          actions.setStatus('idle');
          break;
      }
    });
  }, [actions, generate, session]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e?.preventDefault();
    const content = input.trim();
    if (!content) {
      return;
    }

    append({
      role: 'user',
      content,
    });
    setInput('');
    await handleGenerateVideo(content);
  }, [input, handleGenerateVideo, append]);

  const stop = useCallback(() => {
    abort();
  }, [abort]);

  return (
    <div className="flex flex-col h-[92vh] justify-center bg-background">
      <div className="flex flex-col mx-auto w-full h-full">
        
        {!videos.length && !isGenerating && !messages.length && (
          <div className="flex-1 flex items-center justify-center h-200">
            <Overview />
          </div>
        ) || null}

        <VideoReel 
          videos={videos} 
          session={session} 
          isGenerating={isGenerating} 
          generationStatus={generationStatus}
          progress={progress}
          onPlay={(v) => { console.log('play', v); }}
          onDownload={(v) => { console.log('download', v); }}
          fetchFn={fetchFn}
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