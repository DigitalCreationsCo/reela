import { notFound } from "next/navigation";
import { getVideo } from "@/db/queries";
import { VideoEditor } from "@/components/video/editor";

export default async function Page({ params }: { params: any }) {
  const { videoId } = params;
  const video = await getVideo({ id: videoId });

  if (!video || !video.prompt) {
    notFound();
  }

  return (
    <div className="flex flex-col w-full h-full">
      <div className="flex flex-1 items-center justify-center">
        <div className="w-full max-w-4xl aspect-video">
          <VideoEditor video={video} fetchFn={fetch} duration={video.duration!} />
        </div>
      </div>
    </div>
  );
}
