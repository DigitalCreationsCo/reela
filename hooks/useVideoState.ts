import { Video } from "@/lib/types";
import { VideoGenerationStatus } from "@/lib/types";
import { useReducer, useCallback } from "react";

type State = {
  videos: Video[];
  generationStatus: VideoGenerationStatus;
  progress: number;
  isGenerating: boolean;
  error: string | null;
};

type Action =
  | { type: 'ADD_VIDEO'; payload: Video }
  | { type: 'SET_STATUS'; payload: VideoGenerationStatus }
  | { type: 'SET_PROGRESS'; payload: number }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_IS_GENERATING'; payload: boolean }
  | { type: 'RESET' };

const initialState: State = {
  videos: [],
  generationStatus: 'idle',
  progress: 0,
  isGenerating: false,
  error: null
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'ADD_VIDEO':
      return { ...state, videos: [...state.videos, action.payload] };
    case 'SET_STATUS':
      return { ...state, generationStatus: action.payload };
    case 'SET_PROGRESS':
      return { ...state, progress: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'SET_IS_GENERATING':
      return { ...state, isGenerating: action.payload };
    case 'RESET':
      return initialState;
    default:
      return state;
  }
}

export function useVideoState(initial?: Partial<State>) {
  const [state, dispatch] = useReducer(reducer, { ...initialState, ...initial });

  const addVideo = useCallback((v: Video) => dispatch({ type: 'ADD_VIDEO', payload: v }), []);
  const setStatus = useCallback((s: VideoGenerationStatus) => dispatch({ type: 'SET_STATUS', payload: s }), []);
  const setProgress = useCallback((p: number) => dispatch({ type: 'SET_PROGRESS', payload: p }), []);
  const setError = useCallback((e: string | null) => dispatch({ type: 'SET_ERROR', payload: e }), []);
  const setIsGenerating = useCallback((b: boolean) => dispatch({ type: 'SET_IS_GENERATING', payload: b }), []);
  const reset = useCallback(() => dispatch({ type: 'RESET' }), []);

  return {
    state,
    actions: { addVideo, setStatus, setProgress, setError, setIsGenerating, reset }
  };
}