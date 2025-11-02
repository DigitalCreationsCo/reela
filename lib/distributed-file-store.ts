// In-memory file store singleton for storing uploaded files
// Types for pointer and stored file
export type FilePointer = string;
export type StoredFile = {
  buffer: ArrayBuffer;
  contentType: string;
  name: string;
  size: number;
};

class MemoryFileStore {
  private static instance: Map<FilePointer, StoredFile>;

  private constructor() {}

  public static getInstance(): Map<FilePointer, StoredFile> {
    if (!MemoryFileStore.instance) {
      MemoryFileStore.instance = new Map<FilePointer, StoredFile>();
    }
    return MemoryFileStore.instance;
  }
}

// Export the singleton instance as a const
export const inMemoryFileStore = MemoryFileStore.getInstance();
