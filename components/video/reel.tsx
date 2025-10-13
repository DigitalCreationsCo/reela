import { Message as PreviewMessage } from "@/components/custom/message"
import { Attachment, Message } from "ai";
import { useScrollToBottom } from "@/components/custom/use-scroll-to-bottom";
import { LoaderIcon, SaveIcon, LogInIcon, TrashIcon } from "lucide-react";
import { VideoPlayer } from "../video/player";
import { Session } from "next-auth";
import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "../ui/button";
import { Video } from "@/db/schema";
import { VideoInfo } from "./info";

interface VideoReelProps {
    videos: Video[];
    session: Session | null;
    onSaveVideo?: (videoId: string, videoUrl: string, prompt: string) => Promise<void>;
    onDeleteVideo?: (videoId: string) => void;
    className?: string;
  }
  
  export function VideoReel({ 
    videos, 
    session, 
    onSaveVideo, 
    onDeleteVideo,
    className = "" 
  }: VideoReelProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [visibleVideos, setVisibleVideos] = useState<Set<number>>(new Set([0]));
    const [savingVideos, setSavingVideos] = useState<Set<string>>(new Set());
    const observerRef = useRef<IntersectionObserver | null>(null);
    const prevVideoCountRef = useRef(0); // Track previous video count
  
    useEffect(() => {
      if (!containerRef.current) return;
  
      observerRef.current = new IntersectionObserver(
        (entries) => {
          setVisibleVideos((prev) => {
            const newVisibleVideos = new Set(prev);
            
            entries.forEach((entry) => {
              const index = parseInt(entry.target.getAttribute('data-index') || '0');
              if (entry.isIntersecting) {
                newVisibleVideos.add(index);
                console.log('VideoReel - Video became visible:', index);
              } else {
                newVisibleVideos.delete(index);
                console.log('VideoReel - Video became hidden:', index);
              }
            });
            
            console.log('VideoReel - Visible videos:', Array.from(newVisibleVideos));
            return newVisibleVideos;
          });
        },
        {
          root: containerRef.current,
          rootMargin: '100px 0px', 
          threshold: 0.1
        }
      );
  
      return () => {
        if (observerRef.current) {
          observerRef.current.disconnect();
        }
      };
    }, []);
  
    // Observe video elements when videos array changes
    useEffect(() => {
      if (!observerRef.current) return;
  
      const videoElements = containerRef.current?.querySelectorAll('[data-video-item]');
      
      console.log('VideoReel - Observing elements:', videoElements?.length);
      
      videoElements?.forEach((element) => {
        observerRef.current?.observe(element);
      });
  
      return () => {
        videoElements?.forEach((element) => {
          observerRef.current?.unobserve(element);
        });
      };
    }, [videos]);
  
    // Auto-scroll to and show newly added videos
    useEffect(() => {
      if (videos.length > prevVideoCountRef.current) {
        const newVideoIndex = videos.length - 1;
        console.log('VideoReel - New video added at index:', newVideoIndex);
        
        // Mark the new video as visible immediately
        setVisibleVideos((prev) => {
          const updated = new Set(prev);
          updated.add(newVideoIndex);
          console.log('VideoReel - Marking new video as visible:', newVideoIndex);
          return updated;
        });
  
        // Scroll to the new video
        setTimeout(() => {
          const videoElement = containerRef.current?.querySelector(
            `[data-index="${newVideoIndex}"]`
          );
          if (videoElement) {
            videoElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
            console.log('VideoReel - Scrolled to new video');
          }
        }, 100);
      }
      
      prevVideoCountRef.current = videos.length;
    }, [videos]);
  
    // Debug: Log when videos change
    useEffect(() => {
      console.log('VideoReel - Videos updated:', videos.length, videos);
    }, [videos]);
  
    const handleSaveVideo = useCallback(async (videoId: string, videoUrl: string, prompt: string) => {
      if (!onSaveVideo || !session?.user) return;
      
      setSavingVideos(prev => new Set([...prev, videoId]));
      
      try {
        await onSaveVideo(videoId, videoUrl, prompt);
      } catch (error) {
        console.error('Error saving video:', error);
      } finally {
        setSavingVideos(prev => {
          const newSet = new Set(prev);
          newSet.delete(videoId);
          return newSet;
        });
      }
    }, [onSaveVideo, session]);
  
    const handleDeleteVideo = useCallback((videoId: string) => {
      if (onDeleteVideo) {
        onDeleteVideo(videoId);
      }
    }, [onDeleteVideo]);
  
    if (videos.length === 0) {
      return null;
    }
  
    console.log('VideoReel - Rendering with videos:', videos.length);
  
    return (
      <div className={`relative ${className}`}>
        <div 
          ref={containerRef}
          className="h-[70vh] overflow-y-auto scroll-smooth scrollbar-hide"
          style={{
            scrollSnapType: 'y mandatory',
            scrollBehavior: 'smooth'
          }}
        >
          <div className="space-y-4 p-4">
            {videos.map((video, index) => {
              const isVisible = visibleVideos.has(index);
              console.log(`VideoReel - Rendering video ${index}, visible:`, isVisible, 'video:', video);

              return (
                <div
                  key={video.id}
                  data-index={index}
                  data-video-item
                  className="relative min-h-[60vh] flex flex-col items-center justify-center"
                  style={{ scrollSnapAlign: 'start' }}
                >
                  {/* Video Player - Only render if visible for performance */}
                  {isVisible ? (
                    <div className="w-full max-w-2xl mx-auto p-4">
                      <VideoPlayer 
                        video={video}
                        videoError=""
                        setVideoError={() => {}}
                      />
                      <VideoInfo video={video} session={session} />

                    </div>
                  ) : (
                    // Placeholder for non-visible videos to maintain scroll position
                    <div className="w-full max-w-2xl mx-auto p-4 h-[400px] flex items-center justify-center">
                      <div className="animate-pulse bg-secondary/30 rounded-lg w-full h-full flex items-center justify-center">
                        <span className="text-muted-foreground">Loading video...</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Scroll Indicator */}
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-1">
          {videos.map((_, index) => (
            <div
              key={index}
              className={`w-1 h-6 rounded-full transition-colors ${
                visibleVideos.has(index) 
                  ? 'bg-primary' 
                  : 'bg-secondary'
              }`}
            ></div>
          ))}
        </div>
      </div>
    )
  };
  
  // Custom CSS for hiding scrollbar (add to globals.css)
  export const scrollbarHideStyles = `
  .scrollbar-hide {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
  
  .scrollbar-hide::-webkit-scrollbar {
    display: none;
  }
  `;

//   {videos && !isGenerating && (
//     <div className="flex-1 flex flex-col items-center justify-center gap-4 p-4">
//     <VideoPlayer 
//         video={video} 
//         videoError={videoError} 
//         setVideoError={setVideoError}
//     />
    
//     {/* Save/Login Section */}
//     <div className="flex flex-col items-center gap-3">
//         {!session?.user && (
//         <div className="flex flex-col items-center gap-2 p-4 bg-secondary/50 rounded-lg border">
//             <p className="text-sm text-muted-foreground text-center">
//             Log in to save your generated videos
//             </p>
//             <Button 
//             // onClick={handleLogin}
//             variant="default" 
//             size="sm"
//             className="flex items-center gap-2"
//             >
//             <LogInIcon size={16} />
//             Log In to Save
//             </Button>
//         </div>
//         )}

//         {session?.user && (
//         <div className="flex items-center gap-2">
//             {!isSaved ? (
//             <Button 
//                 onClick={saveVideo}
//                 disabled={isSaving}
//                 variant="default" 
//                 size="sm"
//                 className="flex items-center gap-2"
//             >
//                 {isSaving ? (
//                 <LoaderIcon className="animate-spin" size={16} />
//                 ) : (
//                 <SaveIcon size={16} />
//                 )}
//                 {isSaving ? 'Saving...' : 'Save Video'}
//             </Button>
//             ) : (
//             <div className="flex items-center gap-2 text-green-600">
//                 <SaveIcon size={16} />
//                 <span className="text-sm font-medium">Video Saved!</span>
//             </div>
//             )}
//         </div>
//         )}
//     </div>

//     <VideoReel videos={videos} />

    
//     {messages.length > 0 && (
//         <div className="max-w-2xl w-full">
//         <div className="bg-secondary/50 rounded-lg p-4 border">
//             <h3 className="text-sm font-medium text-muted-foreground mb-2">Video Description</h3>
//             <p className="text-sm">{messages[messages.length - 1]?.content}</p>
//         </div>
//         </div>
//     )}
//     </div>
// )}