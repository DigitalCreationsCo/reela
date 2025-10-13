"use client";

import { Message as PreviewMessage } from "@/components/custom/message"
import { Attachment, Message } from "ai";
import { useScrollToBottom } from "@/components/custom/use-scroll-to-bottom";
import { MultimodalInput } from "./multimodal-input";
import { Overview } from "./overview";
import { LoaderIcon } from "lucide-react";
import { Session } from "next-auth";
import { useEffect, useState } from "react";
import { Video } from "@/db/schema";
import { File } from "@google/genai";
import { VideoReel } from "../video/reel";
import { SAMPLE_VIDEOS } from "@/lib/sample_videos";

type VideoGenerationStatus = 'idle' | 'initiating' | 'generating' | 'retrieving' | 'ready' | 'downloading' | 'complete' | 'error';

export function Chat({
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
  };
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [videos, setVideos] = useState<Video[]>(SAMPLE_VIDEOS);
  const [attachments, setAttachments] = useState<Array<Attachment>>([]);
  const [messagesContainerRef, messagesEndRef] = useScrollToBottom<HTMLDivElement>();
  const [videoError, setVideoError] = useState<string>('');

  const [generationStatus, setGenerationStatus] = useState<VideoGenerationStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  // Check if user has reached video limit
  const hasReachedLimit = !session?.user && videos.length >= 1;

  // const saveVideo = async () => {
  //   if (!session?.user) return;
    
  //   setIsSaving(true);
  //   try {
  //     const response = await fetch('/api/videos', {
  //       method: 'POST',
  //       headers: {
  //         'Content-Type': 'application/json',
  //       },
  //       body: JSON.stringify({
  //         videoUrl: video,
  //         prompt: messages[messages.length - 1]?.content,
  //         chatId: id,
  //       }),
  //     });

  //     if (response.ok) {
  //       setIsSaved(true);
  //     } else {
  //       console.error('Failed to save video');
  //     }
  //   } catch (error) {
  //     console.error('Error saving video:', error);
  //   } finally {
  //     setIsSaving(false);
  //   }
  // };

  useEffect(() => {
    console.log('Video state changed:',);
    console.log('video ', videos[videos.length -1]);
  }, [videos]);
  
  const stop = () => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
    }
    setIsGenerating(false);
    setGenerationStatus('idle');
    setProgress(0);
    setVideoError('');
  };

  const handleVideoGeneration = async (prompt: string) => {
    setIsGenerating(true);
    setGenerationStatus('initiating');
    setProgress(0);
    setVideoError('');

    const controller = new AbortController();
    setAbortController(controller);

    try {
      const response = await fetch('/api/videos/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id,
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error('Failed to start video generation');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data: { 
              status: VideoGenerationStatus;
              progress: number;
              video: File;
              error?: any;
            } = JSON.parse(line.slice(6));
            
            if (data.status) {
              setGenerationStatus(data.status);
            }
            
            if (data.progress !== undefined) {
              setProgress(data.progress);
            }

            if (data.status === 'complete' && data.video) {
              setGenerationStatus('downloading');
              setProgress(95);

              const { uri, downloadUri, name, displayName, createTime, sizeBytes } = data.video;
              console.log('Chat - Received video data:', { uri, downloadUri, name, createTime });

              const fileId = name!.replace('files/', '');
              console.log('Chat - Extracted fileId:', fileId);

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
              })

              console.log('Chat - Created new Video object:', newVideo);
              console.log('Chat - newVideo.fileId:', newVideo.fileId);

              setVideos((prev) => {
                const updated = [...prev, newVideo];
                console.log('Chat - Updated videos array:', updated);
                return updated;
              });

              setProgress(100);
              setGenerationStatus('complete');
              setIsGenerating(false);
              setAbortController(null);
            }

            if (data.status === 'error') {
              setVideoError(data.error || 'An error occurred');
              setIsGenerating(false);
              setAbortController(null); 
            }
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Video generation aborted by user');
        setVideoError('Video generation cancelled');
      } else {
        console.error('Error:', error);
        setVideoError(error instanceof Error ? error.message : 'Unknown error');
      }
      setIsGenerating(false);
      setGenerationStatus('error');
      setAbortController(null);
    }
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    console.log('customHandleSubmit event: ', e);

    e?.preventDefault();
    if (!input.trim()) return;

    const prompt = input;
    setInput('');
    
    append({
      role: 'user',
      content: prompt,
    });

    await handleVideoGeneration(prompt);
  };

  const getStatusMessage = () => {
    switch (generationStatus) {
      case 'initiating':
        return 'Initiating video generation...';
      case 'generating':
        return 'Generating video...';
      case 'retrieving':
        return 'Retrieving video...';
      case 'ready':
        return 'Video ready, preparing download...';
      case 'downloading':
        return 'Downloading video...';
      case 'complete':
        return 'Complete!';
      case 'error':
        return 'Error occurred';
      default:
        return '';
    }
  };

  return (
    <div className="flex flex-col justify-center p-4 md:p-8 min-h-[88vh] bg-background">
      <div className="flex flex-col h-full max-w-4xl mx-auto w-full">
        
        {!videos.length && !isGenerating && !messages.length && (
          <div className="flex-1 flex items-center justify-center min-h-200">
            <Overview />
          </div>
        )}

        <VideoReel videos={videos} session={session} />

        {isGenerating && (
          <div className="flex-1 flex items-center justify-center min-h-200">
            <div className="flex flex-col items-center gap-2 p-4 bg-secondary rounded-lg min-w-[300px]">
              <div className="flex items-center gap-2">
                <LoaderIcon className="animate-spin" size={20} />
                <span className="text-sm font-medium">{getStatusMessage()}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                <div 
                  className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
              <span className="text-xs text-muted-foreground">{progress}%</span>
            </div>
          </div>
        )}

        {messages.length > 0 && !videos.length && !isGenerating && (
          <div
            ref={messagesContainerRef}
            className="flex-1 flex flex-col gap-4 overflow-y-auto px-4 py-2"
          >
            {messages.map((message) => (
              <PreviewMessage
                key={message.id}
                chatId={id}
                role={message.role}
                content={message.content}
                attachments={message.experimental_attachments}
                toolInvocations={message.toolInvocations}
              />
            ))}
            <div
              ref={messagesEndRef}
              className="shrink-0 min-h-[24px]"
            />
          </div>
        )}

        <div className="p-4">
          <form 
            onSubmit={handleSubmit}
            className="flex flex-row gap-2 relative items-end w-full max-w-2xl mx-auto"
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
}
