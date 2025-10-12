import { Video } from "@/db/schema";

export const VideoPlayer = ({ video, videoError, setVideoError }: { video: Video; videoError: string; setVideoError: any }) => {
  const download = `/api/videos/download/${video.fileId}?t=${Date.now()}`;
  return (
    <div className="w-full max-w-4xl mx-auto">
        <video
          key={video.id} 
          src={download}
          className="w-full h-auto aspect-video rounded-lg shadow-lg"
          controls
          autoPlay
          preload="auto"
          style={{ marginTop: 24 }}
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
  )
}