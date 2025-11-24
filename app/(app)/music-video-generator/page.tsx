import { Chat } from "@/components/custom/chat";
import { generateUUID } from "@/lib/utils";
import { auth } from "../../../auth";

export default async function Page() {
  const session = await auth();
  const id = generateUUID();
  return (
  <>
      <Chat
        mode="music-video-generator"
        key={ id }
        id={ id }
        initialMessages={ [] }
        session={ session }
        description="Generate the next amazing music video"
      />
  </>
  );
}
