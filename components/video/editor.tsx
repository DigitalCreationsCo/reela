import { LoaderIcon, PlayIcon } from "lucide-react";
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Video } from "@/db/schema";
import { PlusButton } from "../ui/plus-button";
import { StopIcon } from "../custom/icons";
import { extractFrameDataUrl, generateUUID } from "@/lib/utils";

type Segment = {
  key: string;
  url?: string;
  type: "main" | "extension" | "placeholder";
  thumbUrl?: string;
  label: string;
  videoData?: Video; 
  isPlaceholder?: boolean;
  progress?: number;
  side?: "start" | "end";
  placeholderComponent?: JSX.Element; 
};

export const VideoEditor = ({
  video,
  fetchFn,
  duration,
}: {
  video: Video;
  fetchFn: any;
  duration: number;
}) => {
  
  console.log('[editor] video: ', video);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [selectedSegment, setSelectedSegment] = useState<string>("main");

  const [extensionPromptOpen, setExtensionPromptOpen] = useState<null | "start" | "end">(null);
  const [extensionPromptValue, setExtensionPromptValue] = useState("");
  const [extensionLoading, setExtensionLoading] = useState(false);
  const [confirmMsg, setConfirmMsg] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);

  const [streamProgress, setStreamProgress] = useState<number>(0);
  const [extPlaceholderKey, setExtPlaceholderKey] = useState<string | null>(null);

  const streamUrl = useMemo(() => `/api/videos/stream/${video.fileId}`, [video.fileId]);

  const [isPlayingAll, setIsPlayingAll] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [segmentsPlayIndex, setSegmentsPlayIndex] = useState<number | null>(null);

  useEffect(() => {
    let ignore = false;
    setSegments([]);
    setSelectedSegment("main");
    setVideoError(null);

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
        const { dataUrl } = await extractFrameDataUrl(streamUrl, "start", "image/jpeg");
        thumbUrl = dataUrl;
      } catch {
        thumbUrl = "";
      }
      if (!ignore) {
        const newSegment: Segment = {
            key: "main",
            url: streamUrl,
            type: "main",
            thumbUrl,
            label: "Main",
            videoData: video,
          };
        console.log('[editor] newSegment: ', newSegment);
        setSegments([
          newSegment
        ]);
        setSelectedSegment("main");
      }
    })();

    return () => {
      ignore = true;
    };
  }, [streamUrl, video]);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    let mounted = true;
    const handleProgress = () => {
      try {
        if (videoElement.buffered.length > 0) {
          const bufferedEnd = videoElement.buffered.end(videoElement.buffered.length - 1);
          const duration = videoElement.duration || 1;
          const pct = Math.min(100, (bufferedEnd / duration) * 100);
        }
      } catch {}
    };

    const handleLoadStart = () => {
      if (!mounted) return
      setVideoError("");
    };

    const handleCanPlay = () => {
      if (!mounted) return
    };

    const handleError = (e: Event) => {
      const target = e.currentTarget as HTMLVideoElement;
      let errorMessage = 'Unknown video error';
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
            errorMessage = target.error.message || errorMessage;
        }
      }
      setVideoError(`Error loading video: ${errorMessage}`);
    };

    videoElement.addEventListener('progress', handleProgress);
    videoElement.addEventListener('loadstart', handleLoadStart);
    videoElement.addEventListener('canplay', handleCanPlay);
    videoElement.addEventListener('error', handleError);

    return () => {
      mounted = false;
      videoElement.removeEventListener('progress', handleProgress);
      videoElement.removeEventListener('loadstart', handleLoadStart);
      videoElement.removeEventListener('canplay', handleCanPlay);
      videoElement.removeEventListener('error', handleError);
    };
  }, [selectedSegment, segments]);

  const handlePromptOpen = (side: "start" | "end") => {
    setExtensionPromptOpen(side);
    setExtensionPromptValue("");
    setConfirmMsg(null);
  };

  const streamExtensionVideo = useCallback(async (
    url: string,
    onProgress: (value: number) => void,
    signal?: AbortSignal,
  ): Promise<Blob> => {
    const resp = await fetchFn(url);
    if (!resp.ok) throw new Error("Failed to fetch extension video stream");

    const contentLength = resp.headers?.get("Content-Length") || Number("0");
    const total = contentLength ? Number(contentLength) : undefined;
    const reader = resp.body?.getReader();
    if (!reader) throw new Error("Failed to get stream reader from response");

    const chunks = [];
    let receivedLength = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
        chunks.push(chunk);
        receivedLength += chunk.length ?? chunk.byteLength ?? 0;
        if (total) {
          onProgress(Math.floor((receivedLength / total) * 100));
        } else {
          onProgress(Math.min(99, receivedLength / 1024));
        }
      }
    }

    onProgress(100);

    let length = 0;
    for (const c of chunks) length += c.byteLength;
    const all = new Uint8Array(length);
    let offset = 0;
    for (const c of chunks) {
      all.set(c, offset);
      offset += c.byteLength;
    }

    return new Blob([all], { type: "video/mp4" });
  }, []);

  const handleExtensionSubmit = useCallback(async () => {
    if (!extensionPromptOpen) return;
    setExtensionLoading(true);
    setConfirmMsg(null);
    setStreamProgress(0);

    const placeholderKey = `extension-placeholder-${Date.now()}`;
    setExtPlaceholderKey(placeholderKey);

    const placeholderSegment: Segment = {
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

    setSegments((prev) => {
      if (extensionPromptOpen === "start") {
        return [placeholderSegment, ...prev];
      } else {
        return [...prev, placeholderSegment];
      }
    });
    setSelectedSegment(placeholderKey);

    try {
      const currentSegment = segments.find((s) => s.key === selectedSegment);
      if (!currentSegment) throw new Error("Selected video segment not found");
      
      const segmentUrl = currentSegment.url!;

      const { blob: frameBlob, mimeType: extractedMimeType } = await extractFrameDataUrl(
        segmentUrl,
        extensionPromptOpen === "start" ? "start" : "end",
        "image/jpeg"
      );

      console.debug("[VideoEditor] Frame blob created, building FormData");
      const formData = new FormData();
      formData.append("prompt", extensionPromptValue);
      formData.append("referenceFrame", frameBlob, "frame.jpg");
      formData.append("mimeType", extractedMimeType);
      formData.append("side", extensionPromptOpen as "start" | "end");
      formData.append("videoId", video.fileId);
      formData.append("durationSeconds", duration.toString());

      const resp = await fetchFn("/api/videos/generate/extend", {
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

      const reader = resp.body?.getReader?.();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("No response body from extension request");

      let newFileId: string | undefined = undefined;
      let gotComplete = false;
      let progressFromEvent = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              let data: any;
              data = JSON.parse(line.slice(6));
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

              if (
                data.status === "complete" &&
                data.video
              ) {
                const nameOrFildId = data.video.name ?? data.video.fildId;
                if (typeof nameOrFildId === "string" && nameOrFildId.length > 0) {
                  newFileId = nameOrFildId.startsWith("files/") ? nameOrFildId.replace(/^files\//, "") : nameOrFildId;
                  gotComplete = true;
                  break;
                } else {
                  throw new Error("Extension generation complete, but video file ID missing or invalid");
                }
              }

              if (data.status === "error") {
                throw new Error(data.error || "Extension generation failed");
              }
            } catch (error) {
              console.warn("Failed to parse SSE line", error);
            }
          }
        }
        if (gotComplete) break;
      }

      if (!newFileId) {
        throw new Error("No fileId returned from API extension stream");
      }

      const updateUIProgress = (p: number) => {
        setStreamProgress(p);
        setSegments((prev) => prev.map((s) => s.key === placeholderKey ? { ...s, progress: p, placeholderComponent: <ExtensionSegmentPlaceholder side={extensionPromptOpen!} progress={p} message={`Extending video at the ${extensionPromptOpen === "start" ? "start" : "end"}...`} /> } : s));
      }

      let abortController = new AbortController();
      // let currProgress = progressFromEvent || 0;
      const newBlob = await (async () => {
        let finished = false;
        const blobPromise = streamExtensionVideo(
          `/api/videos/stream/${newFileId}`,
          updateUIProgress,
          abortController.signal,
        ).then((blob) => {
          finished = true;
          updateUIProgress(100);
          return blob;
        });

        await Promise.race([
          blobPromise,
          new Promise((r) => setTimeout(r, 400)),
        ]);

        return blobPromise;
      })();

      const newSegmentUrl = URL.createObjectURL(newBlob);
      let extThumb = "";
      try {
        const { dataUrl: thumb } = await extractFrameDataUrl(newSegmentUrl, "start", "image/jpeg");
        extThumb = thumb;
      } catch (e) {
        console.warn("Failed to extract thumbnail:", e);
        extThumb = "";
      }

      const newVideoObj = {
        id: generateUUID(),
        uri: newSegmentUrl,
        createdAt: new Date(),
      } as Video;

      const newSegmentId = `extension-${Date.now()}`;
      const newSegment: Segment = {
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
        prev.map((s) => (s.key === placeholderKey ? newSegment : s))
      );
      setSelectedSegment(newSegmentId);
      setStreamProgress(100);
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
  }, [extensionPromptOpen, extensionPromptValue, segments, streamExtensionVideo, video.fileId, duration]);

  const handlePromptClose = () => {
    setExtensionPromptOpen(null);
    setExtensionPromptValue("");
    setConfirmMsg(null);
    setExtensionLoading(false);
    setStreamProgress(0);
  };

  const clearPlayAll = () => {
    setIsPlayingAll(false);
    setSegmentsPlayIndex(null);
    if (videoRef.current) {
      videoRef.current.pause();
    }
  };

  const getSegmentById = (id: string) => segments.find((s) => s.key === id);
  const displayedSegment = getSegmentById(selectedSegment) || segments[0];
  const playableSegments = useMemo(
    () => segments.filter(segment => segment.type !== "placeholder"),
    [segments]
  );
  const selectedPlayableIndex = useMemo(
    () => playableSegments.findIndex(seg => seg.key === selectedSegment),
    [playableSegments, selectedSegment]
  );
  
  async function playAll() {
    if (isMerging || isPlayingAll) return;
    setIsMerging(true);
    try {
      // Fetch and combine all binary parts
      const buffers: Uint8Array[] = [];
      for (const segment of segments) {
        const url = segment.url || segment.videoData?.uri;
        if (!url) {
          throw new Error(`Missing video URL for segment "${segment.label}"`);
        }
        const res = await fetch(url);
        const arr = new Uint8Array(await res.arrayBuffer());
        buffers.push(arr);
      }
      // Merge into one
      const totalLength = buffers.reduce((a, b) => a + b.length, 0);
      const merged = new Uint8Array(totalLength);
      let offset = 0;
      for (const buf of buffers) {
        merged.set(buf, offset);
        offset += buf.length;
      }

      // Create blob URL
      const blob = new Blob([merged], { type: "video/mp4" });
      const unifiedUrl = URL.createObjectURL(blob);

      // Play it
      const video = videoRef.current;
      if (video) {
        video.src = unifiedUrl;
        await video.play();
      }
    } finally {
      setIsMerging(false);
    }
  }

  const renderPlayer = (segment: Segment) => {
    if (!segment) return null;
    if (segment.type === "placeholder" && segment.placeholderComponent)
      return segment.placeholderComponent;

    const url = segment.url || segment.videoData?.uri || "";

    if (url) {
      return (
        <div className="">
          <video
            src={url}
            className="w-full h-full object-contain rounded border bg-black"
            controls
            ref={segment.type === "main" ? videoRef : undefined}
            style={{
              background: "#111",
            }}
          />
          <div style={{
            position: "absolute",
            top: 6,
            right: 8,
            zIndex: 10,
            display: "flex",
            gap: 4
          }}>
            {playableSegments.length > 1 && (
              <button
                className="rounded bg-blue-600 text-white text-xs px-3 py-0.5 hover:bg-blue-700 transition disabled:opacity-40"
                type="button"
                style={{
                  opacity:
                    playableSegments.length > 1 &&
                    selectedPlayableIndex !== -1 &&
                    !isPlayingAll
                      ? 1
                      : 0.5,
                  pointerEvents:
                    playableSegments.length > 1 &&
                    selectedPlayableIndex !== -1 &&
                    !isPlayingAll
                      ? "auto"
                      : "none",
                }}
                disabled={
                  playableSegments.length < 2 ||
                  selectedPlayableIndex === -1 ||
                  isPlayingAll
                }
                onClick={playAll}
                tabIndex={0}
              >
                <PlayIcon />
              </button>
            )}
            {isPlayingAll && (
              <button
                className="rounded bg-gray-200 text-gray-900 px-2 py-0.5 text-xs ml-2 hover:bg-gray-300"
                type="button"
                onClick={clearPlayAll}
                tabIndex={0}
              >
                <StopIcon />
              </button>
            )}
          </div>
          {isPlayingAll && playableSegments[segmentsPlayIndex ?? -1] && (
            <div
              style={{
                position: "absolute",
                left: 8,
                top: 6,
                background: "rgba(31, 41, 55, 0.80)",
                color: "#fff",
                padding: "2px 9px",
                borderRadius: "10px",
                fontSize: "12px",
                zIndex: 7,
                fontWeight: 500,
              }}
            >
              Playing segment {segmentsPlayIndex! + 1} of {playableSegments.length}
            </div>
          )}
        </div>
      );
    }
    return (
      <div className="flex items-center justify-center w-full min-h-[140px] bg-gray-100 rounded border">
        <span className="text-gray-500 text-base">No video available</span>
      </div>
    );
  };

  return (
    <div className="w-full h-full mx-auto px-2">
      <div className="h-full w-full relative">
        <PlusButton
          onClick={() => handlePromptOpen("start")}
          label="Extend video at start"
          position="left"
        />
        <PlusButton
          onClick={() => handlePromptOpen("end")}
          label="Extend video at end"
          position="right"
        />

        {displayedSegment && renderPlayer(displayedSegment)}

        {extensionPromptOpen && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-2">
            <div className="bg-background p-3 rounded shadow w-full max-w-xs relative">
              <button
                className="absolute top-1.5 right-1.5 p-1 text-gray-500 hover:text-red-500"
                onClick={handlePromptClose}
                aria-label="Close"
                disabled={extensionLoading}
                tabIndex={0}
              >
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M10 8.586l4.95-4.95 1.414 1.414L11.414 10l4.95 4.95-1.414 1.414L10 11.414l-4.95 4.95-1.414-1.414L8.586 10l-4.95-4.95 1.414-1.414L10 8.586z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
              <h2 className="font-medium text-base mb-2">
                {extensionPromptOpen === "start" ? "Extend start of video" : "Extend end of video"}
              </h2>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                How would you like to extend the video?
              </label>
              <input
                className="w-full rounded p-1 mb-1 text-sm border"
                placeholder="E.g. add intro, fade in, etc."
                value={extensionPromptValue}
                onChange={(e) => setExtensionPromptValue(e.target.value)}
                disabled={extensionLoading}
                autoFocus
              />

              <button
                className="mt-3 w-full bg-blue-600 text-white py-1 rounded font-semibold text-sm hover:bg-blue-700 disabled:opacity-50 disabled:pointer-events-none"
                onClick={handleExtensionSubmit}
                disabled={extensionLoading || !extensionPromptValue.trim()}
                type="button"
                tabIndex={0}
              >
                {extensionLoading && streamProgress === 0
                  ? "Sending..."
                  : extensionLoading && streamProgress > 0 && streamProgress < 100
                  ? <>Generating... <span className="align-middle">{streamProgress}%</span> <span className="inline-block animate-spin border-t-2 border-blue-400 rounded-full w-3 h-3 ml-1" /></>
                  : `Send extension request`}
              </button>
              {/* Stream progress bar */}
              {extensionLoading && streamProgress > 0 && streamProgress < 100 && (
                <div className="mt-1 w-full">
                  <div className="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-blue-500 h-1.5 rounded-full transition-all"
                      style={{ width: `${streamProgress}%`, minWidth: 8 }}
                    ></div>
                  </div>
                  <div className="text-xs mt-1 text-center text-blue-700">{streamProgress}% streaming</div>
                </div>
              )}
              {confirmMsg && (
                <div className={`mt-2 text-center text-xs ${confirmMsg.startsWith("Failed") ? "text-red-600 font-medium" : "text-green-600"}`}>
                  {confirmMsg}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {segments.length > 1 && (
        <div
          className="flex flex-row items-center mt-3 gap-1 justify-center"
          aria-label="Video Segments"
        >
          {segments.map((segment) => (
            <VideoSegmentPill
              key={segment.key}
              thumbUrl={segment.thumbUrl || "/images/video-icon.png"}
              type={segment.type === "placeholder" ? "extension" : segment.type}
              selected={selectedSegment === segment.key}
              onClick={() => {
                setSelectedSegment(segment.key!);
                clearPlayAll();
              }}
            />
          ))}
        </div>
      )}

      {videoError && (
        <div className="text-red-500 text-xs mt-2 p-1 bg-red-50 rounded border border-red-200">
          {videoError}
        </div>
      )}
    </div>
  );
};

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
    className={`flex flex-col items-center border ${selected ? "border-blue-600" : "border-gray-300"} rounded-full px-1 py-0.5 bg-background shadow-xs text-xs transition min-w-[38px] ${type === "extension" ? "opacity-90" : ""}`}
    style={{
      outline: selected ? "2px solid #2563eb" : "",
      marginRight: 4,
    }}
    onClick={onClick}
    type="button"
    tabIndex={0}
  >
    <img
      src={thumbUrl}
      alt={type === "main" ? "Main video segment" : "Extension"}
      className="w-8 h-5 object-cover rounded-full mb-0.5"
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
    className="w-full h-full flex flex-col items-center justify-center bg-gray-100 border-2 border-dashed border-blue-300 rounded p-4 animate-pulse transition"
    style={{ minHeight: 140 }}
    aria-label="Generating Extension Video"
  >
    <div className="flex items-center gap-2 mb-3">
      <LoaderIcon className="animate-spin text-blue-500" size={22} />
      <span className="font-semibold text-blue-700 text-sm">Generating Extension&hellip;</span>
    </div>
    <div className="text-blue-700 mb-1 text-xs">
      {message ??
        (side === "start"
          ? "Preparing to extend the video at the start&hellip;"
          : "Preparing to extend the video at the end&hellip;")}
    </div>
    {typeof progress === "number" && progress > 0 && progress < 100 && (
      <div className="w-32 bg-blue-200 rounded-full h-1 mt-1">
        <div
          className="h-1 rounded-full bg-blue-500 transition-all"
          style={{
            width: `${progress}%`,
            minWidth: 8,
          }}
        ></div>
      </div>
    )}
    {typeof progress === "number" && progress >= 100 && (
      <div className="mt-2 text-green-600 text-xs font-medium">Finalizing&hellip;</div>
    )}
  </div>
);
