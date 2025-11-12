import { VideoEditor } from "./editor";
import { Session } from "next-auth";
import { Progress } from "./progress";
import { Video } from "@/db/schema";
import { useFeed } from "@/hooks/useFeed";
import { generationStatusMessage } from "@/lib/utils";
import { VideoGenerationStatus } from "@/lib/types";

/**
 * Responsive and minimal UI. No unnecessary padding/margins.
 */
interface VideoReelProps {
  videos: Video[];
  session: Session | null;
  isGenerating: boolean;
  progress: number;
  generationStatus: VideoGenerationStatus;
  onSaveVideo?: (id: string, url: string, prompt: string) => Promise<void>;
  onDeleteVideo?: (id: string) => void;
  onPlay?: (id: string) => void;
  onDownload?: (id: string) => void;
  className?: string;
  fetchFn: any;
  duration: number;
  error: string | null;
}

export function VideoReel({
  videos,
  session,
  onSaveVideo,
  onDeleteVideo,
  onPlay,
  onDownload,
  isGenerating,
  generationStatus,
  progress,
  className = "",
  fetchFn,
  duration,
  error,
}: VideoReelProps) {
  const { containerRef, refs, activeIndex } = useFeed(videos);
  const status = generationStatusMessage(generationStatus);
  
  if (generationStatus === "error" && !isGenerating) return (
    <div className='h-full flex items-center justify-center'>
      <div className="flex border p-10 rounded">
        {status + `${error ? (': ' + error) : ''}`}
      </div>
    </div>
  );

  if (!videos.length && !isGenerating) return (
    <div className=''>
      {null}
    </div>
  );

  if (!videos.length && isGenerating) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <Progress progress={progress} status={status} />
      </div>
    );
  }

  return (
    <div className={`relative h-full w-full ${className}`}>
      <div
        ref={containerRef}
        className="overflow-y-auto scrollbar-hide snap-y snap-mandatory h-full"
        style={{ scrollBehavior: "auto" }}
      >
        {videos.map((video, i) => {
          const isActive = i === activeIndex;
          const shouldRenderEditor = Math.abs(i - activeIndex) <= 1;
          return (
            <div
              key={video.id}
              ref={el => { refs.current[i] = el; }}
              className="snap-start w-full flex items-center justify-center h-full relative"
              style={{
                overflow: "hidden",
                transition: "opacity 0.2s, transform 0.2s",
                opacity: isActive ? 1 : 0.4,
                transform: isActive ? "scale(1)" : "scale(0.97)",
                pointerEvents: isActive ? "auto" : "none",
                zIndex: isActive ? 2 : 1
              }}
              tabIndex={-1}
              aria-current={isActive}
            >
              {shouldRenderEditor ? (
                <div className="flex flex-col w-full h-full">
                  {isActive && (
                    <div className="flex flex-1 items-center justify-center">
                      <div className="w-full max-w-4xl aspect-video">
                        <VideoEditor
                          video={video}
                          fetchFn={fetchFn}
                          duration={duration}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="w-full h-full bg-muted/10 flex items-center justify-center">
                  <div className="text-xs text-muted-foreground">Video {i + 1}</div>
                </div>
              )}
              {i === videos.length - 1 && isActive && isGenerating && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/70 z-10">
                  <div className="w-full max-w-xs">
                    <Progress progress={progress} status={status} />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Hide scrollbar utility for this component (for minimal visual chrome)
export const scrollbarHideStyles = `
.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
`;
