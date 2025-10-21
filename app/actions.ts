"use server";
import { signIn } from "@/auth"

export const signInWithGoogle = async () => {
    return await signIn('google');
};