import { LoaderIcon } from "lucide-react";
import { useState, useRef, useEffect, useMemo } from "react";
import { mockAsyncFetch } from "../custom/mock-chat";
import { createMockVideo } from "@/lib/mock-utils";
import { Video } from "@/db/schema";

// Simple Plus Icon SVG
const PlusCircleButton = ({
  onClick,
  label,
  position = "left",
  disabled = false,
}: {
  onClick: () => void;
  label: string;
  position?: "left" | "right";
  disabled?: boolean;
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    className={`absolute top-1/2 z-10 transform -translate-y-1/2 bg-background border border-gray-300 shadow transition hover:bg-blue-100 active:scale-95 
      ${position === "left" ? "-left-10" : "-right-10"}
      rounded-full p-2 flex items-center justify-center`}
    style={{
      pointerEvents: disabled ? "none" : "auto",
      opacity: disabled ? 0.4 : 1,
    }}
  >
    <svg
      className="w-7 h-7 text-blue-600"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="11" stroke="currentColor" fill="white" />
      <path strokeLinecap="round" d="M12 8v8M8 12h8" />
    </svg>
  </button>
);

const VideoSegmentPill = ({
  thumbUrl,
  type,
  selected,
  onClick,
}: {
  thumbUrl: string;
  type: "extension" | "main";
  selected: boolean;
  onClick: () => void;
}) => (
  <button
    className={`flex flex-col items-center 
      border ${selected ? "border-blue-600" : "border-gray-300"}
      rounded-full px-2 py-1 mr-2 bg-background shadow text-xs transition min-w-[56px]
      ${type === "extension" ? "opacity-90" : ""}
    `}
    style={{
      outline: selected ? "2px solid #2563eb" : "",
    }}
    onClick={onClick}
    type="button"
    tabIndex={0}
  >
    <img
      src={thumbUrl}
      alt={type === "main" ? "Main video segment" : "Extension"}
      className="w-10 h-6 object-cover rounded-full mb-1"
      style={{
        border: type === "main" ? "2px solid #2563eb" : "2px solid #d1d5db",
        background: "#eee",
      }}
    />
    <div className={`${type === "main" ? "text-blue-800" : "text-gray-500"} truncate`}>
      {type === "main" ? "Main" : "Ext."}
    </div>
  </button>
);

// Util: get the frame as JPEG dataURL from a video URL
async function extractFrameDataUrl(videoUrl: string, at: "start" | "end" = "start"): Promise<{ dataUrl: string; blob: Blob }> {
  return new Promise((resolve, reject) => {
    const videoEl = document.createElement("video");
    videoEl.src = videoUrl;
    videoEl.crossOrigin = "anonymous";
    videoEl.preload = "auto";
    videoEl.muted = true;
    let settled = false;

    const cleanup = () => {
      videoEl.pause();
      videoEl.src = "";
      videoEl.remove();
    };

    const handleSeeked = async () => {
      if (settled) return;
      settled = true;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = videoEl.videoWidth;
        canvas.height = videoEl.videoHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("No 2D context");
        ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
        const blob = await (await fetch(dataUrl)).blob();
        cleanup();
        resolve({ dataUrl, blob });
      } catch (e) {
        cleanup();
        reject(e);
      }
    };

    videoEl.addEventListener("loadedmetadata", () => {
      let seekTime = at === "start" ? 0 : Math.max(videoEl.duration - 0.05, 0);
      if (!isFinite(seekTime) || isNaN(seekTime)) seekTime = 0;
      videoEl.currentTime = seekTime;
    });

    videoEl.addEventListener("seeked", handleSeeked);

    videoEl.addEventListener("error", () => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(new Error("Unable to load video for frame extraction"));
      }
    });

    // Fallback timeout for extraction
    setTimeout(() => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(new Error("Timeout extracting frame"));
      }
    }, 8000);
  });
}

// Extension Placeholder Component
const ExtensionSegmentPlaceholder = ({
  side,
  message,
  progress,
}: {
  side: "start" | "end";
  message?: string;
  progress?: number;
}) => (
  <div
    className="w-full h-full flex flex-col items-center justify-center bg-gray-100 border-2 border-dashed border-blue-300 rounded-lg p-6 animate-pulse transition"
    style={{ minHeight: 220 }}
    aria-label="Generating Extension Video"
  >
    <div className="flex items-center gap-2 mb-4">
      <LoaderIcon className="animate-spin text-blue-500" size={30} />
      <span className="font-semibold text-blue-700 text-lg">Generating Extension&hellip;</span>
    </div>
    <div className="text-blue-700 mb-2 text-sm">
      {message ??
        (side === "start"
          ? "Preparing to extend the video at the start&hellip;"
          : "Preparing to extend the video at the end&hellip;")}
    </div>
    {typeof progress === "number" && progress > 0 && progress < 100 && (
      <div className="w-60 bg-blue-200 rounded-full h-2 mt-2">
        <div
          className="h-2 rounded-full bg-blue-500 transition-all"
          style={{
            width: `${progress}%`,
            minWidth: 12,
          }}
        ></div>
      </div>
    )}
    {typeof progress === "number" && progress >= 100 && (
      <div className="mt-3 text-green-600 text-sm font-medium">Finalizing&hellip;</div>
    )}
  </div>
);

export const MockVideoEditor = ({
  video,
  videoError,
  setVideoError,
}: {
  video: Video;
  videoError: string;
  setVideoError: any;
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  const { fileId } = video;
  // "Segment" now is an object with possible placeholder
  type Segment = {
    key: string;
    url?: string;
    type: "main" | "extension" | "placeholder";
    thumbUrl?: string;
    label: string;
    videoData?: Video; // Now store Video for segment
    isPlaceholder?: boolean;
    progress?: number;
    side?: "start" | "end";
    placeholderComponent?: JSX.Element; // Store placeholder for placeholder segments
  };

  const [segments, setSegments] = useState<Segment[]>([]);
  const [selectedSegment, setSelectedSegment] = useState<string>("main");

  // Modal UI state/handlers
  const [extensionPromptOpen, setExtensionPromptOpen] = useState<null | "start" | "end">(null);
  const [extensionPromptValue, setExtensionPromptValue] = useState("");
  const [extensionLoading, setExtensionLoading] = useState(false);
  const [confirmMsg, setConfirmMsg] = useState<string | null>(null);

  // Extension streaming state
  const [streamProgress, setStreamProgress] = useState<number>(0);

  const [isLoading, setIsLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);

  // placeholder segment id, updated every extension fetch
  const [extPlaceholderKey, setExtPlaceholderKey] = useState<string | null>(null);

  // Compute stream url for main video segment
  const streamUrl = useMemo(
    () => `/api/videos/mock-stream/${fileId}`,
    [fileId]
  );

  // Reset segments with main video segment when video changes
  useEffect(() => {
    let ignore = false;
    setSegments([]);
    setSelectedSegment("main");
    setIsLoading(true);
    setLoadProgress(0);

    // Get main segment thumb
    (async () => {
      try {
        await new Promise((resolve) => {
          const preloadVideo = document.createElement("video");
          preloadVideo.src = streamUrl;
          preloadVideo.crossOrigin = "anonymous";
          preloadVideo.preload = "metadata";
          preloadVideo.onloadedmetadata = resolve;
          preloadVideo.onerror = resolve;
        });
      } catch {}
      let thumbUrl = "";
      try {
        const { dataUrl } = await extractFrameDataUrl(streamUrl, "start");
        thumbUrl = dataUrl;
      } catch {
        thumbUrl = "";
      }
      if (!ignore) {
        setSegments([
          {
            key: "main",
            url: streamUrl,
            type: "main",
            thumbUrl,
            label: "Main",
            videoData: video, // Use Video object directly
          },
        ]);
        setSelectedSegment("main");
      }
    })();

    return () => {
      ignore = true;
    };
    // Adding `video` as dependency since it's part of main segment.
  }, [streamUrl, fileId, video]);

  // Video loading status (update to fix initial loading bug)
  useEffect(() => {
    setIsLoading(true);
    setLoadProgress(0);

    const videoElement = videoRef.current;
    if (!videoElement) return;

    const handleProgress = () => {
      if (videoElement.buffered.length > 0) {
        const bufferedEnd = videoElement.buffered.end(videoElement.buffered.length - 1);
        const duration = videoElement.duration;
        if (duration > 0 && bufferedEnd <= duration * 1.01) {
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
    };

    const handleError = (e: Event) => {
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

    // If video is already loaded (fixes initial no-loading bug)
    if (videoElement.readyState >= 3) {
      setIsLoading(false);
      setLoadProgress(100);
    }

    return () => {
      videoElement.removeEventListener('progress', handleProgress);
      videoElement.removeEventListener('loadstart', handleLoadStart);
      videoElement.removeEventListener('canplay', handleCanPlay);
      videoElement.removeEventListener('error', handleError);
    };
  }, [setVideoError, selectedSegment, segments]);

  const handlePromptOpen = (side: "start" | "end") => {
    setExtensionPromptOpen(side);
    setExtensionPromptValue("");
    setConfirmMsg(null);
  };

  // show placeholder in the UI while fetching/generating extension video
  const handleExtensionSubmit = async () => {
    setExtensionLoading(true);
    setConfirmMsg(null);
    setStreamProgress(0);

    // Generate a unique placeholder key per extension request
    const placeholderKey = `extension-placeholder-${Date.now()}`;
    setExtPlaceholderKey(placeholderKey);

    let placeholderSegment: Segment = {
      key: placeholderKey,
      type: "placeholder",
      isPlaceholder: true,
      label: `Ext. ${extensionPromptOpen === "start" ? "Start" : "End"} (loading)`,
      placeholderComponent: (
        <ExtensionSegmentPlaceholder
          side={extensionPromptOpen!}
          message={`Extending video at the ${extensionPromptOpen === "start" ? "start" : "end"}...`}
          progress={0}
        />
      ),
      side: extensionPromptOpen!,
      progress: 0,
    };

    // Insert placeholder in UI immediately
    setSegments((prev) => {
      if (extensionPromptOpen === "start") {
        return [placeholderSegment, ...prev];
      } else {
        return [...prev, placeholderSegment];
      }
    });
    // Select the placeholder
    setSelectedSegment(placeholderKey);

    try {
      // Get the main segment reference
      const mainSegment = segments.find((s) => s.type === "main");
      if (!mainSegment) throw new Error("Main video segment missing");

      const mainUrlToUse = mainSegment.url!;

      // 1. Extract frame
      const { dataUrl, blob: frameBlob } = await extractFrameDataUrl(
        mainUrlToUse,
        extensionPromptOpen === "start" ? "start" : "end"
      );

      // 2. Build form data
      const formData = new FormData();
      formData.append("prompt", extensionPromptValue);
      formData.append("referenceFrame", frameBlob, "frame.jpg");
      formData.append("side", extensionPromptOpen as "start" | "end");
      formData.append("videoId", fileId);

      // 3. POST to API to initiate extension generation (stream progress/events)
      const resp = await mockAsyncFetch("/api/videos/generate/extend", {
        method: "POST",
        body: formData,
      });

      if (!resp.ok) {
        let apiErrorMsg = "";
        try {
          const text = resp.text ? await resp.text() : "";
          apiErrorMsg = text || "Failed to send extension request";
        } catch {
          apiErrorMsg = "Failed to send extension request";
        }
        throw new Error(apiErrorMsg);
      }

      // Progressively parse the /api/videos/generate/extend stream just like mockAsyncFetch in mock-chat.tsx
      let newFileId: string | undefined = undefined;
      let resultObj: any = undefined;
      let progressFromEvent = 0;
      let gotComplete = false;

      const reader = resp.body && resp.body.getReader ? resp.body.getReader() : undefined;
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No response body from extension request");
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            let data: any;
            try {
              data = JSON.parse(line.slice(6));
            } catch (e) {
              continue;
            }
            // Handle error event
            if (data.status === "error") {
              throw new Error(data.error || "Extension generation failed");
            }
            // Update progress UI for any step with .progress
            if (typeof data.progress === "number") {
              progressFromEvent = data.progress;
              setStreamProgress(progressFromEvent);

              setSegments((prev) =>
                prev.map((seg) =>
                  seg.key === placeholderKey
                    ? {
                        ...seg,
                        progress: progressFromEvent,
                        placeholderComponent: (
                          <ExtensionSegmentPlaceholder
                            side={extensionPromptOpen!}
                            message={`Extending video at the ${extensionPromptOpen === "start" ? "start" : "end"}...`}
                            progress={progressFromEvent}
                          />
                        ),
                      }
                    : seg
                )
              );
            }

            // On final success event
            if (
              data.status === "complete" &&
              data.video &&
              (typeof data.video.name === "string" || typeof data.video.fileId === "string")
            ) {
              resultObj = data.video;
              // Use .name if present, else .fileId
              newFileId = (typeof data.video.name === "string" && data.video.name)
                ? (data.video.name.startsWith("files/") ? data.video.name.replace(/^files\//, "") : data.video.name)
                : (data.video.fileId ?? undefined);
              gotComplete = true;
              break;
            }
          }
        }
        if (gotComplete) break;
      }

      if (!newFileId) {
        throw new Error("No fileId returned from API extension stream");
      }

      // 4. Stream the generated video with progress updates
      setStreamProgress(progressFromEvent || 0);
      // update the placeholder as the video streams!
      let currProgress = progressFromEvent || 0;
      const updateUIProgress = (p: number) => {
        currProgress = p;
        setStreamProgress(p);
        setSegments((prev) =>
          prev.map((seg) =>
            seg.key === placeholderKey
              ? {
                  ...seg,
                  progress: p,
                  placeholderComponent: (
                    <ExtensionSegmentPlaceholder
                      side={extensionPromptOpen!}
                      message={`Extending video at the ${extensionPromptOpen === "start" ? "start" : "end"}...`}
                      progress={p}
                    />
                  ),
                }
              : seg
          )
        );
      };

      const newVideoBlob = await (async () => {
        // Wrap with a race to ensure progress stays in UI if streaming is fast
        let finished = false;
        const blobPromise = streamExtensionVideo(
          `/api/videos/mock-stream/${newFileId}`,
          updateUIProgress
        ).then((blob) => {
          finished = true;
          updateUIProgress(100);
          return blob;
        });

        // Artificially delay for UI in superfast test environments, so placeholder is visible
        await Promise.race([
          blobPromise,
          new Promise((r) => setTimeout(r, 700)),
        ]);

        return blobPromise;
      })();

      setStreamProgress(100);

      // 5. Create video segment URL
      const newSegmentUrl = URL.createObjectURL(newVideoBlob);

      // 6. Get extension thumbnail
      let extThumb: string = "";
      try {
        const { dataUrl: thumb } = await extractFrameDataUrl(newSegmentUrl, "start");
        extThumb = thumb;
      } catch (e) {
        console.warn("Failed to extract thumbnail:", e);
        extThumb = "";
      }

      // 7. Create the new video object (Video type)
      const newVideoObj = {
        id: `mock-${Date.now()}`,
        uri: newSegmentUrl,
        // Fill in any other needed Video fields
        // : `Extension ${extensionPromptOpen === "start" ? "Start" : "End"}`,
        createdAt: new Date(),
        // Add more fields if your Video type requires
      } as Video;

      // 8. Replace the placeholder with the new extension segment
      const newSegmentId = `extension-${Date.now()}`;
      const extSegment: Segment = {
        key: newSegmentId,
        url: newSegmentUrl,
        type: "extension",
        thumbUrl: extThumb,
        label: `Ext. ${extensionPromptOpen === "start" ? "Start" : "End"}`,
        videoData: newVideoObj,
        progress: 100,
        side: extensionPromptOpen!,
      };

      setSegments((prev) =>
        prev.map((s) => (s.key === placeholderKey ? extSegment : s))
      );

      setSelectedSegment(newSegmentId);

      setConfirmMsg(
        extensionPromptOpen === "start"
          ? "Video extended at the start!"
          : "Video extended at the end!"
      );
      setExtensionPromptValue("");
    } catch (err: any) {
      // Remove placeholder if error occurs
      setSegments((prev) => prev.filter((s) => s.key !== placeholderKey));
      setSelectedSegment("main");
      const errorMsg = err instanceof Error ? err.message : String(err);
      setConfirmMsg("Failed to send extension request: " + errorMsg);
    } finally {
      setExtensionLoading(false);
      setTimeout(() => setConfirmMsg(null), 3500);
      setExtensionPromptOpen(null);
      setExtensionPromptValue("");
      setStreamProgress(0);
      setExtPlaceholderKey(null);
    }
  };

  const streamExtensionVideo = async (
    url: string,
    onProgress: (value: number) => void
  ): Promise<Blob> => {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error("Failed to fetch extension video stream");

    const contentLength = Number("0");
    const total = contentLength > 0 ? contentLength : undefined;
    const reader = resp.body?.getReader();
    if (!reader) throw new Error("Failed to get stream reader from response");

    let receivedLength = 0;
    const chunks = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        receivedLength += value.length ?? value.byteLength ?? 0;
        if (total) {
          onProgress(Math.floor((receivedLength / total) * 100));
        } else {
          // Unknown total, just incrementally bump (never hits 100)
          onProgress(Math.min(99, receivedLength / 1024));
        }
      }
    }

    onProgress(100);

    // Merge all Uint8Array chunks
    let all: Uint8Array;
    if (chunks.length === 1) {
      all = chunks[0];
    } else {
      let len = 0;
      for (const c of chunks) len += c.length ?? c.byteLength ?? 0;
      all = new Uint8Array(len);
      let pos = 0;
      for (const c of chunks) {
        all.set(c, pos);
        pos += c.length ?? c.byteLength ?? 0;
      }
    }

    // Type is video/mp4 (stream/endpoint contract)
    return new Blob([all], { type: "video/mp4" });
  };

  const handlePromptClose = () => {
    setExtensionPromptOpen(null);
    setExtensionPromptValue("");
    setConfirmMsg(null);
    setExtensionLoading(false);
    setStreamProgress(0);
  };

  const getSegmentById = (id: string) => segments.find((s) => s.key === id);
  const displayedSegment = getSegmentById(selectedSegment) || segments[0];

  // Renders a segment's content (either renders a placeholder for placeholders, otherwise a <video> player using url from Video)
  const renderSegment = (segment: Segment) => {
    if (!segment) return null;
    if (segment.type === "placeholder" && segment.placeholderComponent)
      return segment.placeholderComponent;

    const url =
      segment.videoData?.uri ||
      segment.url ||
      "";

    if (url) {
      return (
        <video
          src={url}
          className="w-full h-[340px] object-contain rounded-lg border bg-black"
          controls
          ref={segment.type === "main" ? videoRef : undefined}
          style={{
            minHeight: 220,
            maxHeight: 380,
            background: "#111",
          }}
        />
      );
    }
    return (
      <div className="flex items-center justify-center w-full min-h-[220px] bg-gray-100 rounded-lg border">
        <span className="text-gray-500 text-lg">No video available</span>
      </div>
    );
  };

  return (
    <div className="w-full h-full mx-auto px-12">
      <div className="h-full w-full relative">
        {/* "Extend" button at the left (start) */}
        <PlusCircleButton
          onClick={() => handlePromptOpen("start")}
          label="Extend video at start"
          position="left"
        />
        {/* "Extend" button at the right (end) */}
        <PlusCircleButton
          onClick={() => handlePromptOpen("end")}
          label="Extend video at end"
          position="right"
        />
        {/* Video segment viewer */}
        {displayedSegment && renderSegment(displayedSegment)}

        {/* Loading indicator */}
        {/* {isLoading && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 rounded-lg"
            style={{ marginTop: 24 }}
          >
            <div className="text-white text-center">
              <div className="flex items-center gap-2">
                <LoaderIcon className="animate-spin" size={20} />
                <span className="text-sm font-medium">Loading...</span>
              </div>
              {loadProgress > 0 && (
                <div className="text-sm mt-1">{Math.round(loadProgress)}% buffered</div>
              )}
            </div>
          </div>
        )} */}
        
        {/* Extension Prompt Modal */}
        {extensionPromptOpen && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-4">
            <div className="bg-background p-6 rounded-lg shadow-xl w-full max-w-sm relative">
              <button
                className="absolute top-2 right-2 p-2 text-gray-500 hover:text-red-500"
                onClick={handlePromptClose}
                aria-label="Close"
                disabled={extensionLoading}
              >
                <svg className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M10 8.586l4.95-4.95 1.414 1.414L11.414 10l4.95 4.95-1.414 1.414L10 11.414l-4.95 4.95-1.414-1.414L8.586 10l-4.95-4.95 1.414-1.414L10 8.586z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
              <h2 className="font-semibold text-lg mb-3">
                {extensionPromptOpen === "start" ? "Extend start of video" : "Extend end of video"}
              </h2>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Describe how you'd like to extend the video:
              </label>
              <input
                className="w-full rounded-md p-2 mb-2"
                placeholder="E.g. add intro, fade in, etc."
                value={extensionPromptValue}
                onChange={(e) => setExtensionPromptValue(e.target.value)}
                disabled={extensionLoading}
                autoFocus
              />
              <button
                className="mt-1 w-full bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:pointer-events-none"
                onClick={handleExtensionSubmit}
                disabled={extensionLoading || !extensionPromptValue.trim()}
                type="button"
              >
                {extensionLoading && streamProgress === 0
                  ? "Sending..."
                  : extensionLoading && streamProgress > 0 && streamProgress < 100
                  ? <>Generating... <span className="align-middle">{streamProgress}%</span> <span className="inline-block animate-spin border-t-2 border-blue-400 rounded-full w-4 h-4 ml-2" /></>
                  : `Send extension request`}
              </button>
              {/* Show a stream progress bar */}
              {extensionLoading && streamProgress > 0 && streamProgress < 100 && (
                <div className="mt-2 w-full">
                  <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-blue-500 h-2 rounded-full transition-all"
                      style={{ width: `${streamProgress}%`, minWidth: 8 }}
                    ></div>
                  </div>
                  <div className="text-xs mt-1 text-center text-blue-700">{streamProgress}% streaming</div>
                </div>
              )}
              {confirmMsg && (
                <div className="mt-3 text-center" style={{ color: confirmMsg.startsWith("Failed") ? "#dc2626" : "#16a34a" }}>
                  {confirmMsg}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Video segments pill-viewer */}
      {segments.length > 1 && (
        <div
          className="flex flex-row items-center mt-5 gap-2 justify-center"
          aria-label="Video Segments"
        >
          {segments.map((segment, idx) => (
            <VideoSegmentPill
              key={segment.key}
              thumbUrl={segment.thumbUrl || "/images/video-icon.png"}
              type={segment.type === "placeholder" ? "extension" : segment.type}
              selected={selectedSegment === segment.key}
              onClick={() => setSelectedSegment(segment.key!)}
            />
          ))}
        </div>
      )}

      {videoError && (
        <div className="text-red-500 text-sm mt-2 p-2 bg-red-50 rounded border border-red-200">
          {videoError}
        </div>
      )}
    </div>
  );
};