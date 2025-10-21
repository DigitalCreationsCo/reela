import { useRef, useState, useEffect } from "react";
import { LoaderIcon } from "lucide-react";
import { MockVideoEditor } from "./mock-editor";
import { Session } from "next-auth";
import { MockVideoInfo } from "./mock-info";
import { Progress } from "./progress";
import { Video } from "@/db/schema";

/**
 * VideoReel renders a vertical snap-scrolling feed with only one video player in the DOM at a time.
 * Each video "page" uses snap-y scroll. Only the visible video is rendered. Scrolling works as intended.
 */
interface MockVideoReelProps {
  videos: Video[];
  session: Session | null;
  onSaveVideo?: (videoId: string, videoUrl: string, prompt: string) => Promise<void>;
  onDeleteVideo?: (videoId: string) => void;
  isGenerating: boolean;
  isDownloading?: boolean;
  generationStatus: string;
  progress: number;
  className?: string;
}

export function MockVideoReel({
  videos,
  session,
  onSaveVideo,
  onDeleteVideo,
  isGenerating,
  generationStatus,
  progress,
  className = "",
}: MockVideoReelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  // Initialize video refs array when videos change
  useEffect(() => {
    videoRefs.current = videoRefs.current.slice(0, videos.length);
  }, [videos.length]);

  // Intersection Observer for detecting active video
  useEffect(() => {
    if (!containerRef.current || videos.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
            const index = videoRefs.current.findIndex(ref => ref === entry.target);
            if (index !== -1 && index !== activeIndex) {
              setActiveIndex(index);
            }
          }
        });
      },
      {
        root: containerRef.current,
        rootMargin: "0px",
        threshold: [0.5, 0.75, 1.0], // Multiple thresholds for better detection
      }
    );

    // Observe all video elements
    videoRefs.current.forEach((ref) => {
      if (ref) observer.observe(ref);
    });

    return () => {
      observer.disconnect();
    };
  }, [videos.length, activeIndex]);

  // On mount/videos change: If videos are appended, scroll to last
  useEffect(() => {
    if (containerRef.current && videos.length > 0) {
      const el = containerRef.current;
      const lastIdx = videos.length - 1;
      // Use requestAnimationFrame for smoother scrolling
      requestAnimationFrame(() => {
        el.scrollTo({
          top: lastIdx * el.clientHeight,
          behavior: "auto",
        });
        // Don't set activeIndex here - let the observer handle it
      });
    }
    // eslint-disable-next-line
  }, [videos.length]);

  // Scroll to active video when activeIndex changes programmatically -- Make instantly fast
  const scrollToVideo = (index: number) => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const targetScroll = index * el.clientHeight;

    // Instantly scroll -- disables animation for "very fast"
    requestAnimationFrame(() => {
      el.scrollTo({
        top: targetScroll,
        behavior: "auto"
      });
    });
  };

  const getStatusMessage = () => {
    switch (generationStatus) {
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

  if (!videos.length && !isGenerating) return <></>;

  if (!videos.length && isGenerating) {
    return (
      <div className="flex h-200 items-center justify-center">
        <Progress progress={progress} status={getStatusMessage()} />
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
          {videos.map((video, i) => (
            <div
              key={`${video.id}}`}
              ref={(el) => { videoRefs.current[i] = el; }}
              className="snap-start w-full flex items-center justify-center h-[100vh] sm:h-[90vh] md:h-[85vh] lg:h-[80vh] xl:h-[78vh] relative"
              style={{
                overflow: "hidden",
                transition: "opacity 0.2s ease-in-out, transform 0.2s ease-in-out",
                opacity: i === activeIndex ? 1 : 0.3,
                transform: i === activeIndex ? "scale(1)" : "scale(0.95)",
                pointerEvents: i === activeIndex ? "auto" : "none",
                zIndex: i === activeIndex ? 2 : 1,
              }}
              tabIndex={-1}
              aria-current={i === activeIndex}
            >
              {/* Always render a placeholder, but only render VideoPlayer for active */}
              {Math.abs(i - activeIndex) <= 1 ? (
                <div className="w-full flex flex-col lg:flex-row items-stretch justify-center h-full mx-auto">
                  {/* VideoInfo (left sidebar) for lg+ */}
                  <div className="hidden lg:flex flex-col items-stretch w-72 xl:w-80 flex-shrink-0 border-r bg-background/90 backdrop-blur-sm">
                    {!isGenerating && (
                      <MockVideoInfo video={video} session={session} />
                    )}
                  </div>
                  <div className="flex flex-col w-full relative min-h-0">
                    {i === activeIndex && (
                      <div className="flex-1 flex items-center justify-center p-2 sm:p-4 lg:p-6">
                        <div className="w-full max-w-4xl aspect-video">
                          <MockVideoEditor
                            video={video}
                            videoError=""
                            setVideoError={() => {}}
                            key={video.id}
                          />
                        </div>
                      </div>
                    )}
                    {/* On mobile/tablet, show VideoInfo below the player */}
                    <div className="w-full lg:hidden flex-shrink-0 border-t bg-background/95 backdrop-blur-sm">
                      {!isGenerating && i === activeIndex && (
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
              {i === videos.length - 1 && i === activeIndex && isGenerating && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-[10] p-4">
                  <div className="w-full max-w-sm">
                    <Progress progress={progress} status={getStatusMessage()} />
                  </div>
                </div>
              )}
            </div>
          ))}
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
