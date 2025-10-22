import { SAMPLE_VIDEOS } from "./sample/sample_videos";

export async function mockAsyncFetch(url: string, options?: any) {
    const delay = (ms: number) => new Promise(res => setTimeout(res, ms));
    const randomMs = 600 + Math.random() * 800;
  
    const sampleVideo = SAMPLE_VIDEOS[Math.floor(Math.random() * Math.max(1, SAMPLE_VIDEOS.length))];
  
    // Emulate the /api/videos/stream/[fileId] API for front-end local/dev test fetches
    if (url.includes("/stream/")) {
      const REMOTE_VIDEO_BASE_URL = process.env.REMOTE_VIDEO_BASE_URL || "http://localhost:3000/";
      // extract the fileId from the URL (assume final path segment is id)
      let fileIdMatch = url.match(/\/stream\/([^/?#]+)/);
      if (!fileIdMatch) {
        throw new Error("Invalid stream URL: fileId not found");
      }
      let fileId = fileIdMatch[1];
      // Simulate "sanitize" just as backend API
      const safeFileId = fileId.replace(/[^a-zA-Z0-9._-]/g, "");
      const videoUrl = `${REMOTE_VIDEO_BASE_URL}/${safeFileId}.mp4`;

      try {
        // Here, in the browser, we must simulate a proxy
        // So fetch the video from the underlying CDN/base url and emulate a streamed response
        // (for a true mock, fallback to local data if cross-origin/invalid)
        const realResponse = await fetch(videoUrl);
        if (!realResponse.ok) {
          return {
            ok: false,
            status: realResponse.status,
            headers: new Map([["Content-Type", "text/plain"]]),
            async text() { return `Error fetching remote video: ${realResponse.status}`; },
            async blob() { return new Blob([`Error fetching remote video: ${realResponse.status}`], { type: "text/plain" }); }
          };
        }

        // Proxy the stream, with headers as per real API
        const headers = new Map();
        headers.set("Content-Type", "video/mp4");
        headers.set("Cache-Control", "public, max-age=31536000, immutable");
        headers.set("Accept-Ranges", "bytes");
        // Pass through content length if available (some CORS/CDN setups restrict this)
        const contentLength = realResponse.headers.get("Content-Length");
        if (contentLength) headers.set("Content-Length", contentLength);

        // Provide body that mimics web fetch streaming interface (with .getReader)
        return {
          ok: true,
          status: 200,
          headers,
          body: {
            // Pass through the web stream as-is
            getReader() {
              return realResponse.body?.getReader();
            }
          },
          async blob() {
            return await realResponse.blob();
          }
        };
      } catch (error: any) {
        // Fallback: original mock data (static/fake video binary)
        let sent = 0;
        let chunkNum = 0;
        const total = sampleVideo.fileSize;
        function createChunk(size: number) {
          const chunk = new Uint8Array(size);
          if (chunkNum === 1) {
            const mp4Header = [0x00,0x00,0x00,0x20,0x66,0x74,0x79,0x70];
            for (let i=0;i<Math.min(mp4Header.length,size);i++) chunk[i]=mp4Header[i];
            for (let i=mp4Header.length;i<size;i++) chunk[i]=(i%256);
          } else {
            for (let i=0;i<size;i++) chunk[i]=((sent + i) % 256);
          }
          return chunk;
        }
        return {
          ok: true,
          status: 200,
          headers: new Map([
            ["Content-Length", `${total}`],
            ["Content-Type","video/mp4"],
            ["Cache-Control", "public, max-age=31536000, immutable"],
            ["Accept-Ranges", "bytes"]
          ]),
          body: {
            getReader() {
              return {
                async read() {
                  if (sent >= total) return { done: true, value: undefined };
                  chunkNum++;
                  const chunkSize = Math.min(512 * 1024 + chunkNum * 32 * 1024, total - sent);
                  await delay(90 + Math.random() * 70);
                  sent += chunkSize;
                  return { done: sent >= total, value: createChunk(chunkSize) };
                }
              };
            }
          },
          async blob() {
            const totalBytes = total;
            const mockData = new Uint8Array(totalBytes);
            const mp4Header = [0x00,0x00,0x00,0x20,0x66,0x74,0x79,0x70];
            for (let i=0;i<Math.min(mp4Header.length,totalBytes);i++) mockData[i]=mp4Header[i];
            for (let i=mp4Header.length;i<totalBytes;i++) mockData[i]=(i%256);
            return new Blob([mockData], { type: 'video/mp4' });
          }
        };
      }
    }
  
    // stream NDJSON/SSE for generation
    if (url.includes("/api/videos/generate/extend") || (url.includes("/api/videos/generate") && !url.includes("/stream/"))) {
      const { uri, downloadUri, title: displayName, fileId: name, createdAt: createTime, fileSize: sizeBytes} = sampleVideo;
      const generatedVideo = { uri, downloadUri, name, displayName, createTime, sizeBytes };
  
      const steps = [
        { status: "initiating", progress: 0 },
        { status: "generating", progress: 10 },
        { status: "generating", progress: 30 },
        { status: "generating", progress: 55 },
        { status: "generating", progress: 80 },
        { status: "retrieving", progress: 85 },
        { status: "ready", progress: 90 },
        { status: "complete", progress: 100, video: generatedVideo },
      ];
      let idx = 0;
      return {
        ok: true,
        status: 200,
        headers: new Map([["Content-Type","text/event-stream"]]),
        body: {
          getReader() {
            return {
              async read() {
                if (idx >= steps.length) {
                  await delay(180);
                  return { done: true, value: undefined };
                }
                const event = steps[idx++];
                const chunkStr = `data: ${JSON.stringify(event)}\n\n`;
                await delay(300 + Math.random() * 100);
                return { done: false, value: new TextEncoder().encode(chunkStr) };
              }
            };
          }
        },
        async blob() {
          const allData = steps.map(s => `data: ${JSON.stringify(s)}\n\n`).join('');
          return new Blob([allData], { type: 'text/event-stream' });
        }
      };
    }
  
    return {
      ok: false,
      status: 500,
      json: async () => ({ error: "Mock fetch error" }),
      async text() { return "Mock fetch error"; },
      async blob() { return new Blob(["Mock fetch error"], { type: 'text/plain' }); }
    };
  }