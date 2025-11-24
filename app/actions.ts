"use server";
import { signIn as signInAuth, signOut as signOutAuth } from "@/auth"
import { saveChat as saveChatDb, getChatById, getChatsByUserId, deleteChatById } from "@/db/queries";
import { revalidatePath } from "next/cache";

export const signInWithGoogle = async () => {
    return await signInAuth('google');
};

export const signIn = async (...args: any) => {
    return await signInAuth(args);
};

export const signOut = async (args: Record<string, any>) => {
    return await signOutAuth(args);
};

export const createChat = async ({ id, messages, userId, genre }: { id: string; messages: any; userId: string; genre?: string }) => {
    await saveChatDb({ id, messages, userId, genre });
    revalidatePath(`/`);
    return await getChatById({ id });
}

export const saveChat = async ({ id, messages, userId, genre }: { id: string; messages: any; userId: string; genre?: string }) => {
    await saveChatDb({ id, messages, userId, genre });
    revalidatePath(`/chat/${id}`);
}

export const getChats = async ({ userId }: { userId: string }) => {
    return await getChatsByUserId({ id: userId });
}

export const deleteChat = async ({ id }: { id: string }) => {
    await deleteChatById({ id });
    revalidatePath(`/`);
}
