export type VideoGenerationStatus = 'idle' | 'initiating' | 'generating' | 'retrieving' | 'ready' | 'downloading' | 'complete' | 'error';

export type AttachmentType = {
    contentType: string;
    url: string;
    pathname: string;
    pointer: string;
};
