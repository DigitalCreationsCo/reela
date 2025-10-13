import { LoaderIcon, SaveIcon, LogInIcon, TrashIcon } from "lucide-react";
import { Session } from "next-auth";
import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "../ui/button";
import { Video } from "@/db/schema";


// Video Info and Actions
// Collapsible Info Card:
// - collapsed by default
// - shows description, title, author, createdAt, views, genre (on collapsed)
// - expand to show more (everything else)

export const VideoInfo = ({ video, session }: { video: Video, session: Session | null }) => {
    // For unique collapse state per video, key by id (should use parent, but for this example do inline)
    const [collapsed, setCollapsed] = useState(true);
    // genre: fallback to video.metadata?.genre or video.genre, else N/A
    const genre = (video.genre || (video.metadata && typeof video.metadata === "object" && (video.metadata as any).genre)) ?? "N/A";
    // Title fallback: treat undefined/null/empty as false
    const title = video.title && String(video.title).trim().length > 0 ? video.title : null;
    // Created Date
    const createdAt = video.createdAt
        ? (typeof video.createdAt === "string"
            ? new Date(video.createdAt).toLocaleString()
            : video.createdAt.toLocaleString())
        : "N/A";
    // Description fallback
    const description = video.prompt || <span className="italic text-xs text-gray-400">(No description)</span>;
    // Views fallback
    const views = video.views !== undefined ? video.views : "N/A";
    // Author fallback
    const author = video.author ?? "Anonymous";

    const handleDeleteVideo = useCallback((videoId: string) => {
    //     if (onDeleteVideo) {
    //       onDeleteVideo(videoId);
    //     }
    //   }, [onDeleteVideo]);
    
    //   if (videos.length === 0) {
    //     return null;
    }, []);

    return (
        <div className={`mt-4 space-y-4 ${collapsed && 'cursor-pointer'}`} onClick={(e) => { e.stopPropagation();setCollapsed(false); }}>
        {/* Collapsed (summary) version shows key info only */}
        <div className="rounded-lg flex flex-col gap-2">
            
            <div className="text-lg font-bold text-foreground">{title}</div>
            <div className="flex items-center justify-between">
                <div className="text-base font-semibold text-foreground">Description</div>
                <button
                type="button"
                onClick={(e) => { e.stopPropagation();setCollapsed(!collapsed); }}
                className={`${collapsed && 'hidden'} self-end px-2 py-1 text-xs rounded transition`}
                aria-expanded={!collapsed}
                >
                {collapsed ? "Show more" : "Hide details"}
                </button>
            </div>
            <div className="text-sm text-muted-foreground break-words mb-2">{description}</div>
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
        {/* Expanded view (show rest of info) */}
        {!collapsed && (
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
                {video.duration && (
                <div className="flex items-center gap-1">
                    <span className="font-medium">Duration:</span>
                    <span>{video.duration}</span>
                </div>
                )}
                {video.fileSize && (
                <div className="flex items-center gap-1">
                    <span className="font-medium">Size:</span>
                    <span>{(typeof video.fileSize === "number" 
                    ? (video.fileSize / 1024 / 1024).toFixed(2) + " MB"
                    : video.fileSize) }</span>
                </div>
                )}
                {video.status && (
                <div className="flex items-center gap-1 text-xs">
                    <span className="font-medium">Status:</span>
                    <span>{video.status}</span>
                </div>
                )}
                {video.updatedAt && (
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
                {video.downloadUri && (
                <div className="flex items-center gap-1">
                    <a
                    href={video.downloadUri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-blue-700 hover:underline dark:text-blue-300"
                    >
                    Download
                    </a>
                </div>
                )}
            </div>
        )}
        {/* Actions Row, always shown */}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center mt-2">
            <div className="flex items-center gap-2">
            {session?.user && (
                <Button
                onClick={() => handleDeleteVideo(video.id)}
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
        </div>
    );
};