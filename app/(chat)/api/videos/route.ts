import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { getAllVideos } from "@/db/queries";

export async function GET(request: NextRequest) {
  const session = await auth();

  // if (!session || !session.user) {
  //   return new NextResponse("Unauthorized", { status: 401 });
  // }

  try {
    const videos = await getAllVideos();

    return NextResponse.json({ videos });
  } catch (error) {
    console.error("Error fetching videos from DB:", error);
    return new NextResponse("Error fetching videos", { status: 500 });
  }
}