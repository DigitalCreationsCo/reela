import { Video } from "@/db/schema";
import { useState, useRef, useEffect, useMemo } from "react";

export const VideoPlayer = ({ video, videoError, setVideoError }: { video: Video; videoError: string; setVideoError: any }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);

  const streamUrl = useMemo(() => {
    const url = `/api/videos/download/${video.fileId}?t=${Date.now()}`;
    console.log('VideoPlayer - Constructed stream URL:', url);
    console.log('VideoPlayer - video.fileId:', video.fileId);
    console.log('VideoPlayer - Full video object:', video);
    return url;
  }, [video]);
  
  // Add this useEffect to debug when streamUrl changes
  useEffect(() => {
    console.log('VideoPlayer - streamUrl changed to:', streamUrl);
  }, [streamUrl]);
  
  useEffect(() => {
    console.log('video: ', JSON.stringify(video));

    const videoElement = videoRef.current;
    if (!videoElement) return;

    const handleProgress = () => {
      if (videoElement.buffered.length > 0) {
        const bufferedEnd = videoElement.buffered.end(videoElement.buffered.length - 1);
        const duration = videoElement.duration;
        if (duration > 0) {
          setLoadProgress((bufferedEnd / duration) * 100);
        }
      }
    };

    const handleLoadStart = () => {
      setIsLoading(true);
      setVideoError('');
    };

    const handleCanPlay = () => {
      setIsLoading(false);
      console.log('Video can play');
    };

    const handleError = (e: Event) => {
      console.error('Video error:', e);
      const target = e.currentTarget as HTMLVideoElement;
      setIsLoading(false);
      
      let errorMessage = 'Unknown error occurred';
      if (target.error) {
        switch (target.error.code) {
          case MediaError.MEDIA_ERR_ABORTED:
            errorMessage = 'Video playback was aborted';
            break;
          case MediaError.MEDIA_ERR_NETWORK:
            errorMessage = 'Network error occurred while loading video';
            break;
          case MediaError.MEDIA_ERR_DECODE:
            errorMessage = 'Video format not supported or corrupted';
            break;
          case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
            errorMessage = 'Video format not supported by your browser';
            break;
          default:
            errorMessage = target.error.message || 'Unknown error occurred';
        }
      }
      setVideoError(`Error loading video: ${errorMessage}`);
    };

    videoElement.addEventListener('progress', handleProgress);
    videoElement.addEventListener('loadstart', handleLoadStart);
    videoElement.addEventListener('canplay', handleCanPlay);
    videoElement.addEventListener('error', handleError);

    return () => {
      videoElement.removeEventListener('progress', handleProgress);
      videoElement.removeEventListener('loadstart', handleLoadStart);
      videoElement.removeEventListener('canplay', handleCanPlay);
      videoElement.removeEventListener('error', handleError);
    };
  }, [setVideoError]);

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="relative">
        <video
          ref={videoRef}
          key={video.id}
          src={streamUrl}
          className="w-full h-auto aspect-video rounded-lg shadow-lg"
          controls
          preload="metadata" // Changed from "auto" to "metadata" for better performance
          style={{ marginTop: 24 }}
          onLoadedMetadata={() => console.log('Video metadata loaded')}
          onLoadedData={() => console.log('Video data loaded')}
          crossOrigin="anonymous" // Add if needed for CORS
        >
          Your browser does not support the video tag.
        </video>
        
        {/* Loading indicator */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 rounded-lg" style={{ marginTop: 24 }}>
            <div className="text-white text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-2"></div>
              <div>Loading video...</div>
              {loadProgress > 0 && (
                <div className="text-sm mt-1">{Math.round(loadProgress)}% buffered</div>
              )}
            </div>
          </div>
        )}
      </div>
      
      {videoError && (
        <div className="text-red-500 text-sm mt-2 p-2 bg-red-50 rounded border border-red-200">
          {videoError}
        </div>
      )}
    </div>
  )
}