import { auth } from "@/auth";
import { getChatsByUserId } from "@/db/queries";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const session = await auth();

  if (!session || !session.user) {
    return Response.json("Unauthorized!", { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const genre = searchParams.get("genre");

  const chats = await getChatsByUserId({ id: session.user.id! });

  if (genre) {
    return Response.json(chats.filter((chat) => chat.genre === genre));
  }

  return Response.json(chats);
}
