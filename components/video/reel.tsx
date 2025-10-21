import { useRef, useState, useEffect } from "react";
import { LoaderIcon } from "lucide-react";
import { VideoEditor } from "./editor";
import { Session } from "next-auth";
import { Video } from "@/db/schema";
import { VideoInfo } from "./info";

/**
 * VideoReel renders a vertical snap-scrolling feed with only one video player in the DOM at a time.
 * Each video "page" uses snap-y scroll. Only the visible video is rendered. Scrolling works as intended.
 */
interface VideoReelProps {
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

export function VideoReel({
  videos,
  session,
  onSaveVideo,
  onDeleteVideo,
  isGenerating,
  generationStatus,
  progress,
  className = "",
}: VideoReelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Set initial load flag for intro transitions
  useEffect(() => {
    if (videos.length > 0 && isInitialLoad) {
      setTimeout(() => setIsInitialLoad(false), 300);
    }
  }, [videos, isInitialLoad]);

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

  return (
    <div className={`relative h-full ${className}`}>
      {videos.length === 0 && isGenerating ? (
        <div className="flex items-center justify-center">
          <div className="flex flex-col items-center gap-2 bg-secondary rounded-lg min-w-[300px] max-w-xs">
            <div className="flex items-center gap-2">
              <LoaderIcon className="animate-spin" size={20} />
              <span className="text-sm font-medium">{getStatusMessage()}</span>
            </div>
            <div className="w-full bg-background/20 rounded-full h-2.5">
              <div className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
            </div>
            <span className="text-xs text-muted-foreground">{progress}%</span>
          </div>
        </div>
      ) : (
        // Only render <VideoPlayer/> for the visible snap page; use "pages" to allow scroll/snap.
        <div
          ref={containerRef}
          className="overflow-y-auto scrollbar-hide snap-y snap-mandatory h-[78vh]"
          // Set scrollBehavior to 'auto' for instant, very fast scroll
          style={{ scrollBehavior: "auto", maxHeight: "90vh" }}
        >
          {videos.map((video, i) => (
            <div
              key={video.id}
              ref={(el) => { videoRefs.current[i] = el; }}
              className="snap-start w-full flex items-center justify-center h-[78vh] relative"
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
                <div className="w-full flex flex-col xl:flex-row items-stretch justify-center h-full">
                  {/* VideoInfo (left sidebar) for xl+ */}
                  <div className="hidden xl:flex flex-col items-stretch w-80 max-w-xs flex-shrink-0 border-r bg-background/90 backdrop-blur-sm">
                    {!isGenerating && !isInitialLoad && (
                      <VideoInfo video={video} session={session} />
                    )}
                  </div>
                  <div className="flex flex-col w-full relative">
                    {i === activeIndex && (
                      <VideoEditor
                        video={video}
                        videoError=""
                        setVideoError={() => {}}
                        key={video.fileId || video.id}
                      />
                    )}
                    {/* On mobile, show VideoInfo below the player */}
                    <div className="w-full xl:hidden flex">
                      {!isGenerating && !isInitialLoad && i === activeIndex && (
                        <VideoInfo video={video} session={session} />
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                // Spacer block for scroll feed, ensures correct snap-to "page"
                <div className="w-full h-full bg-muted/10 flex items-center justify-center">
                  <div className="text-muted-foreground text-sm">Video {i + 1}</div>
                </div>
              )}
              {/* Overlay progress for the currently generating video */}
              {i === videos.length - 1 && isGenerating && i === activeIndex && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-[10]">
                  <div className="flex flex-col items-center gap-2 p-4 bg-secondary rounded-lg min-w-[300px] max-w-xs">
                    <div className="flex items-center gap-2">
                      <LoaderIcon className="animate-spin" size={20} />
                      <span className="text-sm font-medium">{getStatusMessage()}</span>
                    </div>
                    <div className="w-full bg-background/20 rounded-full h-2.5">
                      <div className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
                    </div>
                    <span className="text-xs text-muted-foreground">{progress}%</span>
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
