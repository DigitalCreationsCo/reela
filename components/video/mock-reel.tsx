import { useRef, useState, useEffect } from "react";
import { LoaderIcon } from "lucide-react";
import { MockVideoEditor } from "./mock-editor";
import { Session } from "next-auth";
import { MockVideoInfo } from "./mock-info";
import { Progress } from "./progress";
import { Video } from "@/db/schema";
import { useFeed } from "@/hooks/useFeed";
import { generationStatusMessage } from "@/lib/utils";

/**
 * VideoReel renders a vertical snap-scrolling feed with only one video player in the DOM at a time.
 * Each video "page" uses snap-y scroll. Only the visible video is rendered. Scrolling works as intended.
 */
interface MockVideoReelProps {
  videos: Video[];
  session: Session | null;
  isGenerating: boolean;
  progress: number;
  generationStatus: string;
  onSaveVideo?: (id: string, url: string, prompt: string) => Promise<void>;
  onDeleteVideo?: (id: string) => void;
  onPlay?: (id: string) => void;
  onDownload?: (id: string) => void;
  className?: string;
}

export function MockVideoReel({
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
}: MockVideoReelProps) {
  const { containerRef, refs, activeIndex } = useFeed(videos);
  const status = generationStatusMessage(generationStatus);

  if (!videos.length && !isGenerating) return null;

  if (!videos.length && isGenerating) {
    return (
      <div className="flex h-200 items-center justify-center">
        <Progress progress={progress} status={status} />
      </div>
    );
  }

  return (
    <div className={`relative h-full ${className}`}>
      {(
        // Only render <VideoPlayer/> for the visible snap page; use "pages" to allow scroll/snap.
        <div
          ref={containerRef}
          className="overflow-y-auto scrollbar-hide snap-y snap-mandatory h-[78vh]"
          // Set scrollBehavior to 'auto' for instant, very fast scroll
          style={{ scrollBehavior: "auto" }}
        >
          {videos.map((video, i) => {
            const isActive = i === activeIndex;
            const shouldRenderEditor = Math.abs(i - activeIndex) <= 1;
            return (
              <div
                key={`${video.id}}`}
                ref={(el) => { refs.current[i] = el; }}
                className="snap-start w-full flex items-center justify-center h-[100vh] sm:h-[90vh] md:h-[85vh] lg:h-[80vh] xl:h-[78vh] relative"
                style={{
                  overflow: "hidden",
                  transition: "opacity 0.2s ease-in-out, transform 0.2s ease-in-out",
                  opacity: isActive ? 1 : 0.3,
                  transform: isActive ? "scale(1)" : "scale(0.95)",
                  pointerEvents: isActive ? "auto" : "none",
                  zIndex: isActive ? 2 : 1,
                }}
                tabIndex={-1}
                aria-current={isActive}
              >
                {/* Always render a placeholder, but only render VideoPlayer for active */}
                {shouldRenderEditor ? (
                  <div className="w-full flex flex-col lg:flex-row items-stretch justify-center h-full mx-auto">
                    {/* VideoInfo (left sidebar) for lg+ */}
                    <div className="hidden lg:flex flex-col items-stretch w-72 xl:w-80 flex-shrink-0 border-r bg-background/90 backdrop-blur-sm">
                      {!isGenerating && (
                        <MockVideoInfo video={video} session={session} />
                      )}
                    </div>

                    <div className="flex flex-col w-full relative min-h-0">
                      {isActive && (
                        <div className="flex-1 flex items-center justify-center p-2 sm:p-4 lg:p-6">
                          <div className="w-full max-w-4xl aspect-video">
                            <MockVideoEditor
                              video={video}
                            />
                          </div>
                        </div>
                      )}

                      {/* On mobile/tablet, show VideoInfo below the player */}
                      <div className="w-full lg:hidden flex-shrink-0 border-t bg-background/95 backdrop-blur-sm">
                        {!isGenerating && isActive && (
                          <div className="p-3 sm:p-4">
                            <MockVideoInfo video={video} session={session} />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  // Spacer block for scroll feed, ensures correct snap-to "page"
                  <div className="w-full h-full bg-muted/10 flex items-center justify-center">
                    <div className="text-muted-foreground text-sm sm:text-base">Video {i + 1}</div>
                  </div>
                )}
                {/* Overlay progress for the currently generating video */}
                {i === videos.length - 1 && isActive && isGenerating && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-[10] p-4">
                    <div className="w-full max-w-sm">
                      <Progress progress={progress} status={status} />
                    </div>
                  </div>
                )}
              </div>
            )}
          )}
        </div>
      )}
    </div>
  );
}

// Hide scrollbar utility for this component (add to global styles if needed)
export const scrollbarHideStyles = `
.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
`;
