import { MockChat } from "@/components/custom/mock-chat";
import VideoCollage from "@/components/video/collage";
import { generateUUID } from "@/lib/utils";
import { auth } from "../../../auth";

export default async function Page() {
  const session = await auth();
  const id = generateUUID();
  return (
  <>
    <MockChat key={id} id={id} initialMessages={[]} session={session} />
    {/* <VideoCollage /> */}
  </>
  );
}
