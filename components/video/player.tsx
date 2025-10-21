import { DetailedHTMLProps, VideoHTMLAttributes } from "react"

export const VideoPlayer = ({ ref, key, src, onLoadedData, onWaiting }: Pick<DetailedHTMLProps<VideoHTMLAttributes<HTMLVideoElement>, HTMLVideoElement>, "key" | "src" | "ref" | "onLoadedData" | "onWaiting">) => {
  return (
    <video
      ref={ref}
      key={key}
      src={src}
      className="w-full h-auto aspect-video shadow-lg"
      controls
      preload="metadata"
      style={{ marginTop: 24 }}
      crossOrigin="anonymous"
      onLoadedData={onLoadedData}
      onWaiting={onWaiting}
    >
      Your browser does not support the video tag.
    </video>
  )
}

