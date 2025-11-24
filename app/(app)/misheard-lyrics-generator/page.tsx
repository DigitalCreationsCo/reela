import { Chat } from "@/components/custom/chat";
import VideoCollage from "@/components/video/collage";
import { generateUUID } from "@/lib/utils";
import { auth } from "../../../auth";

export default async function Page() {
  const session = await auth();
  const id = generateUUID();
  return (
  <>
      <Chat
        mode="misheard-lyrics-generator"
        key={ id }
        id={ id }
        initialMessages={ [] }
        session={ session }
        description={ "Generate hilarious misheard lyrics videos" }
      />
    {/* <VideoCollage /> */}
  </>
  );
}
