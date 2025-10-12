import { Chat } from "@/components/custom/chat";
import VideoCollage from "@/components/video/collage";
import { generateUUID } from "@/lib/utils";
import { auth } from "../(auth)/auth";

export default async function Page() {
  const session = await auth();
  const id = generateUUID();
  return (
  <>
    <Chat key={id} id={id} initialMessages={[]} session={session} />
    <VideoCollage />
  </>
  );
}
