export interface VideoItem {
    id: string;
    url: string;
    prompt: string;
    createdAt: Date;
    saved?: boolean;
}