import { LoaderIcon } from "lucide-react";
import { useCallback } from "react";

export const Progress = ({ progress, status }: { progress: number; status: string }) => {
    return (
        <div className="flex items-center justify-center">
          <div className="flex flex-col items-center gap-2 bg-secondary rounded-lg min-w-[300px] max-w-xs py-2">
            <div className="flex items-center gap-2">
              <LoaderIcon className="animate-spin" size={20} />
              <span className="text-sm font-medium">{status}</span>
            </div>
            <div className="w-full bg-background/20">
              <div className="bg-primary h-1 transition-all duration-300" style={{ width: `${progress}%` }}></div>
            </div>
            <span className="text-xs text-muted-foreground">{progress}%</span>
          </div>
        </div>
    );
};