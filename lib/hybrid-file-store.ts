// lib/file-store-hybrid.ts
import { inMemoryFileStore } from './memory-file-store';
import { distributedFileStore } from './distributed-file-store';

export class HybridFileStore {
  /**
   * Store in both local memory (for fast access) and distributed cache (for persistence)
   */
  async set(
    pointer: string,
    file: { buffer: ArrayBuffer; contentType: string; name: string; size: number },
    ttlMs?: number
  ): Promise<void> {
    // Store in local memory for fast access
    inMemoryFileStore.set(pointer, file, ttlMs);

    // Also store in distributed cache for cross-instance access
    if (process.env.UPSTASH_REDIS_REST_URL) {
      try {
        await distributedFileStore.set(pointer, file, ttlMs ? Math.floor(ttlMs / 1000) : undefined);
      } catch (error) {
        console.error('[HybridFileStore] Failed to store in distributed cache:', error);
        // Continue anyway - local memory still works
      }
    }
  }

  /**
   * Get from local memory first, fall back to distributed cache
   */
  async get(pointer: string): Promise<{
    buffer: ArrayBuffer;
    contentType: string;
    name: string;
    size: number;
  } | null> {
    // Try local memory first (fastest)
    const localFile = inMemoryFileStore.get(pointer);
    if (localFile) {
      console.log('[HybridFileStore] Found in local memory');
      return localFile;
    }

    // Fall back to distributed cache
    if (process.env.UPSTASH_REDIS_REST_URL) {
      try {
        const distributedFile = await distributedFileStore.get(pointer);
        if (distributedFile) {
          console.log('[HybridFileStore] Found in distributed cache, caching locally');
          // Cache back in local memory for future requests
          inMemoryFileStore.set(pointer, distributedFile);
          return distributedFile;
        }
      } catch (error) {
        console.error('[HybridFileStore] Failed to get from distributed cache:', error);
      }
    }

    return null;
  }

  async has(pointer: string): Promise<boolean> {
    if (inMemoryFileStore.has(pointer)) return true;
    
    if (process.env.UPSTASH_REDIS_REST_URL) {
      return await distributedFileStore.has(pointer);
    }
    
    return false;
  }

  async delete(pointer: string): Promise<void> {
    inMemoryFileStore.delete(pointer);
    
    if (process.env.UPSTASH_REDIS_REST_URL) {
      await distributedFileStore.delete(pointer);
    }
  }
}

export const fileStore = new HybridFileStore();