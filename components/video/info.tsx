import { LoaderIcon, TrashIcon, DownloadIcon } from "lucide-react";
import { Session } from "next-auth";
import { useState, useCallback } from "react";
import { Button } from "../ui/button";
import { Video } from "@/db/schema";

export const VideoInfo = ({ fetchFn, video, session }: { fetchFn: any, video: Video, session: Session | null }) => {
    const [collapsed, setCollapsed] = useState(true);
    const [isDownloading, setIsDownloading] = useState(false);
    
    const genre = (video.genre || (video.metadata && typeof video.metadata === "object" && (video.metadata as any).genre)) ?? "N/A";
    const title = video.title && String(video.title).trim().length > 0 ? video.title : null;
    const createdAt = video.createdAt
        ? (typeof video.createdAt === "string"
            ? new Date(video.createdAt).toLocaleString()
            : video.createdAt.toLocaleString())
        : "N/A";
    const description = video.prompt || <span className="italic text-xs text-gray-400">(No description)</span>;
    const views = video.views !== undefined ? video.views : "N/A";
    const author = video.author ?? "Anonymous";


    const handleDeleteVideo = useCallback((videoId: string) => {
        //     if (onDeleteVideo) {
        //       onDeleteVideo(videoId);
        //     }
        //   }, [onDeleteVideo]);
        
        //   if (videos.length === 0) {
        //     return null;
    }, []);

    const handleDownload = async () => {
        setIsDownloading(true);
        try {
            const response = await fetchFn(`/api/videos/stream/${video.fileId}`);
            
            if (!response.ok) {
                throw new Error('Failed to download video');
            }

            const blob = await response.blob();
            
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            
            const fileName = title 
                ? `${title.replace(/[^a-zA-Z0-9]/g, '_')}.mp4`
                : `video_${video.fileId}.mp4`;
            a.download = fileName;
            
            document.body.appendChild(a);
            a.click();
            
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (error) {
            console.error('Download failed:', error);
            alert('Failed to download video. Please try again.');
        } finally {
            setIsDownloading(false);
        }
    };

    return (
        <div className={`border p-4 space-y-4 ${collapsed && 'cursor-pointer'}`} onClick={(e) => { e.stopPropagation();setCollapsed(false); }}>
        <div className="rounded-lg flex flex-col gap-2">
            
            <div className="text-lg font-medium text-foreground">{title}</div>
            <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-muted-foreground">Description</div>
                <button
                type="button"
                onClick={(e) => { e.stopPropagation();setCollapsed(!collapsed); }}
                className={`${collapsed && 'hidden'} self-end text-xs rounded transition`}
                aria-expanded={!collapsed}
                >
                {collapsed ? "Show more" : "Hide details"}
                </button>
            </div>
            <div className="text-sm text-muted-foreground break-words mb-2">{collapsed ? description.toString().slice(0,180) + '...' : description}</div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground border-t pt-2">
                <div>
                    <span className="font-medium">Author:</span> {author}
                </div>
                <div>
                    <span className="font-medium">Created</span> {createdAt}
                </div>
                
                <div>{views} views</div>

                <div>{genre}</div>
            </div>
        </div>
        {!collapsed && (
            <>
            <div className="flex flex-col grid gap-2 sm:grid-cols-2 text-xs text-muted-foreground pt-2 sm:pt-0">
                <div className="flex items-center gap-1">
                <span className="font-medium">Video ID:</span>
                <span className="truncate" title={video.id}>{video.id}</span>
                </div>
                {video.format && (
                <div className="flex items-center gap-1">
                    <span className="font-medium">Format:</span>
                    <span>{video.format}</span>
                </div>
                )}
                {(
                <div className="flex items-center gap-1">
                    <span className="font-medium">Duration:</span>
                    <span>{video.duration}</span>
                </div>
                )}
                {(
                <div className="flex items-center gap-1">
                    <span className="font-medium">Size:</span>
                    <span>{(typeof video.fileSize === "number" 
                    ? (video.fileSize / 1024 / 1024).toFixed(2) + " MB"
                    : video.fileSize) }</span>
                </div>
                )}
                {(
                <div className="flex items-center gap-1 text-xs">
                    <span className="font-medium">Status:</span>
                    <span>{video.status}</span>
                </div>
                )}
                {(
                <div className="flex items-center gap-1">
                    <span className="font-medium">Updated </span>
                    <span>
                    {(typeof video.updatedAt === "string"
                        ? new Date(video.updatedAt).toLocaleString()
                        : video.updatedAt.toLocaleString())}
                    </span>
                </div>
                )}
                {video.fileId && (
                <div className="flex items-center gap-1">
                    <span className="font-medium">File:</span>
                    <span className="truncate" title={video.fileId}>{video.fileId}</span>
                </div>
                )}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center mt-2">
                <div className="flex items-center gap-2">
                    <Button
                        onClick={(e) => {
                            e.stopPropagation();
                            handleDownload();
                        }}
                        disabled={isDownloading}
                        variant="outline"
                        size="sm"
                        className="flex items-center gap-2"
                    >
                        {isDownloading ? (
                            <>
                                <LoaderIcon className="animate-spin" size={14} />
                                Downloading...
                            </>
                        ) : (
                            <>
                                <DownloadIcon size={14} />
                                Download
                            </>
                        )}
                    </Button>
                        
                    {session?.user && (
                        <Button
                        onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteVideo("");
                        }}
                        variant="outline"
                        size="sm"
                        className="flex items-center gap-2 text-red-600 hover:text-red-700"
                        >
                            <TrashIcon size={14} />
                            Delete
                        </Button>
                    )}
                </div>
            </div>
        </>
        )}
        </div>
    );
};