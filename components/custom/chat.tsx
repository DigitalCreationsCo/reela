"use client";

import { Attachment, Message } from "ai";
import { useChat } from "ai/react";
import { useEffect, useState } from "react";
import { Message as PreviewMessage } from "@/components/custom/message";
import { useScrollToBottom } from "@/components/custom/use-scroll-to-bottom";
import { MultimodalInput } from "./multimodal-input";
import { Overview } from "./overview";
import { File, GeneratedVideo } from "@google/genai";
import { LoaderIcon } from "lucide-react";

export function Chat({
  id,
  initialMessages,
}: {
  id: string;
  initialMessages: Array<Message>;
}) {
  const { messages, handleSubmit, input, setInput, append, isLoading, stop } =
    useChat({
      id,
      body: { id },
      initialMessages,
      maxSteps: 10,
      onResponse: async (res) => {
        setIsDownloading(true);
        console.log('res: ', res);

        const gv: File = await res.json();
        console.log('video ', gv);

        const fileId = gv.name!.replace('files/', '');
        
        const videoUrl = `/api/download/${fileId}?t=${Date.now()}`;
        console.log('Setting video URL:', videoUrl);
        setVideo(videoUrl);
        setIsDownloading(false);

        // window.history.replaceState({}, "", `/chat/${id}`);
      },
    });

  const [video, setVideo] = useState<string>('');
  const [attachments, setAttachments] = useState<Array<Attachment>>([]);
  const [messagesContainerRef, messagesEndRef] = useScrollToBottom<HTMLDivElement>();
  const [isDownloading, setIsDownloading] = useState(false);
  const [videoError, setVideoError] = useState<string>('');

  useEffect(() => {
    console.log('Video state changed:', video);
  }, [video]);
  
  return (
    <div className="flex flex-row justify-center pb-4 md:pb-8 h-dvh bg-background">
      <div className="flex flex-col justify-between items-center gap-4">
        <div
          ref={messagesContainerRef}
          className="flex flex-col gap-4 h-full w-dvw items-center overflow-y-scroll"
        >
          {messages.length === 0 && <Overview />}

          {isLoading && (
            <div className="flex items-center gap-2">
              <LoaderIcon className="animate-spin" />
              Generating...
            </div>
          )}
          
          {isDownloading && (
            <div className="flex items-center gap-2">
              <LoaderIcon className="animate-spin" />
              Downloading...
            </div>
          )}

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
            className="shrink-0 min-w-[24px] min-h-[24px]"
          />
        </div>

        {video && (
          <div>
            <video
              key={video} // Force remount when URL changes
              src={video}
              width={300}
              height={200}
              controls
              autoPlay
              preload="auto"
              style={{ marginTop: 24, borderRadius: 8, boxShadow: "0 2px 16px #0002" }}
              onLoadedMetadata={() => console.log('Video metadata loaded')}
              onLoadedData={() => console.log('Video data loaded')}
              onError={(e) => {
                console.error('Video error:', e);
                const videoElement = e.currentTarget;
                setVideoError(`Error loading video: ${videoElement.error?.message || 'Unknown error'}`);
              }}
              onCanPlay={() => console.log('Video can play')}
            >
              Your browser does not support the video tag.
            </video>
            {videoError && (
              <div className="text-red-500 text-sm mt-2">{videoError}</div>
            )}
          </div>
        )}

        <form className="flex flex-row gap-2 relative items-end w-full md:max-w-[500px] max-w-[calc(100dvw-32px) px-4 md:px-0">
          <MultimodalInput
            input={input}
            setInput={setInput}
            handleSubmit={handleSubmit}
            isLoading={isLoading}
            stop={stop}
            attachments={attachments}
            setAttachments={setAttachments}
            messages={messages}
            append={append}
          />
        </form>
      </div>
    </div>
  );
}
