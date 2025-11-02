// lib/memory-file-store.ts

// Types for pointer and stored file
export type FilePointer = string;
export type StoredFile = {
  buffer: ArrayBuffer;
  contentType: string;
  name: string;
  size: number;
  timestamp: number; // When file was stored
  expiresAt: number; // When file should be deleted
};

class MemoryFileStore {
  private store: Map<FilePointer, StoredFile>;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly DEFAULT_TTL = 15 * 60 * 1000; // 15 minutes
  private readonly CLEANUP_INTERVAL = 5 * 60 * 1000; // Run cleanup every 5 minutes
  private readonly MAX_STORE_SIZE = 100 * 1024 * 1024; // 100MB max total storage

  private constructor() {
    this.store = new Map<FilePointer, StoredFile>();
    this.startCleanup();
    console.log('[MemoryFileStore] Initialized new instance');
  }

  private static instance: MemoryFileStore | null = null;

  public static getInstance(): MemoryFileStore {
    if (!MemoryFileStore.instance) {
      MemoryFileStore.instance = new MemoryFileStore();
    }
    return MemoryFileStore.instance;
  }

  /**
   * Store a file in memory with automatic expiration
   */
  public set(pointer: FilePointer, file: Omit<StoredFile, 'timestamp' | 'expiresAt'>, ttlMs?: number): void {
    const now = Date.now();
    const ttl = ttlMs || this.DEFAULT_TTL;
    
    const storedFile: StoredFile = {
      ...file,
      timestamp: now,
      expiresAt: now + ttl
    };

    // Check total size before adding
    const currentSize = this.getTotalSize();
    if (currentSize + file.size > this.MAX_STORE_SIZE) {
      console.warn('[MemoryFileStore] Max store size exceeded, running cleanup');
      this.cleanup();
      
      // If still too large, remove oldest files
      if (this.getTotalSize() + file.size > this.MAX_STORE_SIZE) {
        this.removeOldestFiles(file.size);
      }
    }

    this.store.set(pointer, storedFile);
    console.log(`[MemoryFileStore] Stored file: ${pointer} (${file.size} bytes, expires in ${ttl}ms)`);
    console.log(`[MemoryFileStore] Total files: ${this.store.size}, Total size: ${this.getTotalSize()} bytes`);
  }

  /**
   * Get a file from memory
   */
  public get(pointer: FilePointer): StoredFile | undefined {
    const file = this.store.get(pointer);
    
    if (!file) {
      console.warn(`[MemoryFileStore] File not found: ${pointer}`);
      return undefined;
    }

    // Check if expired
    if (Date.now() > file.expiresAt) {
      console.warn(`[MemoryFileStore] File expired: ${pointer}`);
      this.store.delete(pointer);
      return undefined;
    }

    console.log(`[MemoryFileStore] Retrieved file: ${pointer} (${file.size} bytes)`);
    return file;
  }

  /**
   * Check if a file exists and is not expired
   */
  public has(pointer: FilePointer): boolean {
    const file = this.store.get(pointer);
    if (!file) return false;
    
    if (Date.now() > file.expiresAt) {
      this.store.delete(pointer);
      return false;
    }
    
    return true;
  }

  /**
   * Delete a specific file
   */
  public delete(pointer: FilePointer): boolean {
    const deleted = this.store.delete(pointer);
    if (deleted) {
      console.log(`[MemoryFileStore] Deleted file: ${pointer}`);
    }
    return deleted;
  }

  /**
   * Extend the TTL of a file
   */
  public touch(pointer: FilePointer, additionalTtlMs?: number): boolean {
    const file = this.store.get(pointer);
    if (!file) return false;

    const ttl = additionalTtlMs || this.DEFAULT_TTL;
    file.expiresAt = Date.now() + ttl;
    console.log(`[MemoryFileStore] Extended TTL for ${pointer} by ${ttl}ms`);
    return true;
  }

  /**
   * Get total size of all stored files
   */
  private getTotalSize(): number {
    let total = 0;
    for (const file of this.store.values()) {
      total += file.size;
    }
    return total;
  }

  /**
   * Remove oldest files to make room for new ones
   */
  private removeOldestFiles(spaceNeeded: number): void {
    const files = Array.from(this.store.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);

    let freedSpace = 0;
    for (const [pointer, file] of files) {
      this.store.delete(pointer);
      freedSpace += file.size;
      console.log(`[MemoryFileStore] Removed old file ${pointer} to free space`);
      
      if (freedSpace >= spaceNeeded) break;
    }
  }

  /**
   * Clean up expired files
   */
  private cleanup(): void {
    const now = Date.now();
    let removedCount = 0;
    let freedSize = 0;

    for (const [pointer, file] of this.store.entries()) {
      if (now > file.expiresAt) {
        this.store.delete(pointer);
        removedCount++;
        freedSize += file.size;
      }
    }

    if (removedCount > 0) {
      console.log(`[MemoryFileStore] Cleanup: removed ${removedCount} expired files, freed ${freedSize} bytes`);
    }
  }

  /**
   * Start periodic cleanup
   */
  private startCleanup(): void {
    if (this.cleanupInterval) return;

    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, this.CLEANUP_INTERVAL);

    // Ensure cleanup runs on process exit
    if (typeof process !== 'undefined') {
      process.on('exit', () => this.stopCleanup());
    }
  }

  /**
   * Stop periodic cleanup
   */
  private stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      console.log('[MemoryFileStore] Stopped cleanup interval');
    }
  }

  /**
   * Get statistics about the store
   */
  public getStats(): {
    totalFiles: number;
    totalSize: number;
    files: Array<{ pointer: string; size: number; age: number; ttl: number }>;
  } {
    const now = Date.now();
    const files = Array.from(this.store.entries()).map(([pointer, file]) => ({
      pointer,
      size: file.size,
      age: now - file.timestamp,
      ttl: Math.max(0, file.expiresAt - now)
    }));

    return {
      totalFiles: this.store.size,
      totalSize: this.getTotalSize(),
      files
    };
  }

  /**
   * Clear all files (use with caution)
   */
  public clear(): void {
    this.store.clear();
    console.log('[MemoryFileStore] Cleared all files');
  }
}

// Export the singleton instance
export const inMemoryFileStore = MemoryFileStore.getInstance();

// Helper function to generate unique pointers
export function generateFilePointer(): FilePointer {
  return `file_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}