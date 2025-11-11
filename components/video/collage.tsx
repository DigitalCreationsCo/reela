'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Video } from '@/db/schema';

interface VideoCollageProps {
  videos?: Video[];
  fetchUrl?: string;
  columns?: number;
  maxVideos?: number;
  autoPlay?: boolean;
  showControls?: boolean;
  className?: string;
  onVideoClick?: (video: Video) => void;
  cacheTimeout?: number; // in milliseconds
}

// Cache implementation
class VideoCache {
  private cache = new Map<string, { data: Video[]; timestamp: number }>();
  private readonly timeout: number;

  constructor(timeout: number = 5 * 60 * 1000) { // 5 minutes default
    this.timeout = timeout;
  }

  set(key: string, data: Video[]): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  get(key: string): Video[] | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() - entry.timestamp > this.timeout) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data;
  }

  clear(): void {
    this.cache.clear();
  }
}

// Global cache instance
const videoCache = new VideoCache();

// Mock data generator for demo purposes
const generateMockVideos = (count: number): any[] => {
  return Array.from({ length: count }, (_, i) => ({
    id: `video-${i + 1}`,
    uri: `https://sample-videos.com/zip/10/mp4/SampleVideo_${720}x${480}_${1}mb.mp4`,
    fileId: '',
    prompt: "A cat driving a racecar",
    thumbnail: `https://picsum.photos/320/180?random=${i + 1}`,
    title: `Sample Video ${i + 1}`,
    duration: Math.floor(Math.random() * 300) + 30,
    views: Math.floor(Math.random() * 1000000),
    author: `Creator ${i + 1}`,
    description: '', 
    userId: '', 
    createdAt: new Date(),
    downloadUri: "https://sample-videos.com/zip/10/mp4/SampleVideo_${720}x${480}_${1}mb.mp4", 
    metadata: {}, 
    format: "", 
    fileSize: 100,
    thumbnailUri: "", 
    status: "", 
    updatedAt: new Date(),
  }));
};

// Video item component
const VideoItem: React.FC<{
  video: Video;
  autoPlay: boolean;
  showControls: boolean;
  onClick?: (video: Video) => void;
}> = ({ video, autoPlay, showControls, onClick }) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleVideoLoad = useCallback(() => {
    setIsLoaded(true);
  }, []);

  const handlePlay = useCallback(() => {
    setIsPlaying(true);
  }, []);

  const handlePause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
    if (autoPlay && videoRef.current) {
      videoRef.current.play();
    }
  }, [autoPlay]);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
    if (autoPlay && videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  }, [autoPlay]);

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatViews = (views: number): string => {
    if (views >= 1000000) return `${(views / 1000000).toFixed(1)}M`;
    if (views >= 1000) return `${(views / 1000).toFixed(1)}K`;
    return views.toString();
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      whileHover={{ scale: 1.05 }}
      className="relative group cursor-pointer bg-gray-900 rounded-lg overflow-hidden shadow-lg"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={() => onClick?.(video)}
    >
      {/* Video Element */}
      <div className="relative aspect-video">
        <div className='z-10 md:hidden absolute top-0 left-0 p-4'>
            <h3 className="text-white font-semibold text-sm mb-1 line-clamp-2">
                {video.title}
            </h3>
            <div className="flex items-center justify-between text-gray-300 text-xs gap-2">
                <span>{video.author}</span>
                <span>{video.views && formatViews(video.views)} views</span>
            </div>
        </div>
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          poster={video.thumbnailUri?.toString()}
          muted
          loop
          preload="metadata"
          onLoadedData={handleVideoLoad}
          onPlay={handlePlay}
          onPause={handlePause}
        >
          <source src={video.uri} type="video/mp4" />
        </video>

        {/* Loading skeleton */}
        {!isLoaded && (
          <div className="absolute inset-0 bg-gray-800 animate-pulse flex items-center justify-center">
            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}

        {/* Overlay with video info */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <div className="absolute top-0 left-0 right-0 p-4">
            <h3 className="text-white font-semibold text-sm mb-1 line-clamp-2">
              {video.title}
            </h3>
            <div className="flex items-center justify-between text-gray-300 text-xs">
              <span>{video.author}</span>
              <span>{video.views && formatViews(video.views)} views</span>
            </div>
          </div>
        </div>

        {/* Duration badge */}
        {video.duration && (
          <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs rounded">
            {formatDuration(video.duration)}
          </div>
        )}

        {/* Play button overlay */}
        {!autoPlay && (
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <div className="w-16 h-16 bg-background/20 rounded-full flex items-center justify-center backdrop-blur-sm">
              <svg className="w-8 h-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        )}

        {/* Controls */}
        {showControls && isHovered && (
          <div className="absolute bottom-4 left-4 right-4">
            <div className="flex items-center space-x-2">
              <button
                className="w-8 h-8 bg-background/20 rounded-full flex items-center justify-center backdrop-blur-sm hover:bg-background/30 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  if (videoRef.current) {
                    if (isPlaying) {
                      videoRef.current.pause();
                    } else {
                      videoRef.current.play();
                    }
                  }
                }}
              >
                {isPlaying ? (
                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};

// Main VideoCollage component
export const VideoCollage: React.FC<VideoCollageProps> = ({
  videos,
  fetchUrl,
  columns = 4,
  maxVideos = 12,
  autoPlay = false,
  showControls = true,
  className = '',
  onVideoClick,
  cacheTimeout = 5 * 60 * 1000
}) => {
  const [videoList, setVideoList] = useState<Video[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  // Initialize cache with custom timeout
  useEffect(() => {
    if (cacheTimeout !== 5 * 60 * 1000) {
      videoCache.clear();
    }
  }, [cacheTimeout]);

  // Fetch videos function
  const fetchVideos = useCallback(async (pageNum: number = 1, append: boolean = false) => {
    if (videos) {
      setVideoList(videos.slice(0, maxVideos));
      return;
    }

    const cacheKey = `${fetchUrl || 'mock'}-${pageNum}`;
    const cachedData = videoCache.get(cacheKey);

    if (cachedData) {
      if (append) {
        setVideoList(prev => [...prev, ...cachedData]);
      } else {
        setVideoList(cachedData);
      }
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let newVideos: Video[];

      if (fetchUrl) {
        const response = await fetch(`${fetchUrl}?page=${pageNum}&limit=${maxVideos}`);
        if (!response.ok) throw new Error('Failed to fetch videos');
        const data = await response.json();
        newVideos = data.videos || data;
      } else {
        // Use mock data for demo
        await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate network delay
        newVideos = generateMockVideos(Math.min(maxVideos, 6));
      }

      videoCache.set(cacheKey, newVideos);

      if (append) {
        setVideoList(prev => [...prev, ...newVideos]);
      } else {
        setVideoList(newVideos);
      }

      setHasMore(newVideos.length === maxVideos);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [videos, fetchUrl, maxVideos]);

  // Initial load
  useEffect(() => {
    fetchVideos(1, false);
  }, [fetchVideos]);

  // Load more function
  const loadMore = useCallback(() => {
    if (!loading && hasMore) {
      const nextPage = page + 1;
      setPage(nextPage);
      fetchVideos(nextPage, true);
    }
  }, [loading, hasMore, page, fetchVideos]);

  // Grid styles
  const gridStyles = useMemo(() => ({
    gridTemplateColumns: `repeat(${columns}, 1fr)`,
  }), [columns]);

  if (error) {
    return (
      <div className={`p-8 text-center ${className}`}>
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <svg className="w-12 h-12 text-red-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="text-lg font-semibold text-red-800 mb-2">Error Loading Videos</h3>
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => fetchVideos(1, false)}
            className="bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`w-full p-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Trending Collection
        </h2>
        <div className="flex items-center space-x-4">
          <span className="text-sm text-gray-500">
            {videoList.length} video{videoList.length !== 1 ? 's' : ''}
          </span>
          <button
            onClick={() => {
              videoCache.clear();
              fetchVideos(1, false);
            }}
            className="text-sm text-blue-600 hover:text-blue-700 transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Video Grid */}
      <div 
        className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 mb-8"
        // style={gridStyles}
      >
        <AnimatePresence>
          {videoList.map((video) => (
            <VideoItem
              key={video.id}
              video={video}
              autoPlay={autoPlay}
              showControls={showControls}
              onClick={onVideoClick}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex justify-center py-8">
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-gray-600">Loading videos...</span>
          </div>
        </div>
      )}

      {/* Load more button */}
      {!loading && hasMore && videoList.length > 0 && (
        <div className="flex justify-center">
          <button
            onClick={loadMore}
            className="bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Load More Videos
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && videoList.length === 0 && (
        <div className="text-center py-12">
          <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            No Videos Found
          </h3>
          <p className="text-gray-500 mb-4">
            There are no videos to display at the moment.
          </p>
        </div>
      )}
    </div>
  );
};

export default VideoCollage;
