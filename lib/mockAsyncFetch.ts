export async function mockAsyncFetch(url: string, options?: any) {
    const delay = (ms: number) => new Promise(res => setTimeout(res, ms));
    const randomMs = 600 + Math.random() * 800;
  
    const SAMPLE_VIDEOS = (globalThis as any).SAMPLE_VIDEOS || []; // keep compatibility
  
    const sampleVideo = SAMPLE_VIDEOS[Math.floor(Math.random() * Math.max(1, SAMPLE_VIDEOS.length))] || {
      id: "mock-1",
      title: "mock video",
      uri: "/mock/1",
      downloadUri: "/mock/1/download",
      fileSize: 1024 * 512,
      fileId: "files/mock-1",
      createdAt: new Date().toISOString()
    };
  
    // stream binary video
    if (url.includes("/stream/")) {
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
        headers: new Map([["Content-Length", `${total}`],["Content-Type","video/mp4"]]),
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