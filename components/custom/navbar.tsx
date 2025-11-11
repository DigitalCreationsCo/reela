"use client";
import Image from "next/image";
import Link from "next/link";
import { auth, signIn, signOut } from "@/auth";
import { History } from "./history";
import { SlashIcon } from "./icons";
import { ThemeToggle } from "./theme-toggle";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { FileImageIcon, FileMinusIcon, FilmIcon, LogInIcon } from "lucide-react";
import { signInWithGoogle } from "@/app/actions";

export const Navbar = ({ session }: any) => {
  return (
    <>
      <div className="bg-background top-0 left-0 w-dvw py-2 px-3 justify-between flex flex-row items-start z-30">
        <div className="flex flex-row gap-3 items-center">
          {/* <History user={session?.user} /> */}
          <div className="flex flex-row gap-2 items-center">
            {/* <div className="text-zinc-500">
              <FileImageIcon size={16} />
            </div> */}
            <div className="dark:text-primary truncate md:w-fit text-lg">
              Reela
            </div>
            <Image
              src="/images/gemini-logo.png"
              height={20}
              width={20}
              alt="gemini logo"
            />
          </div>
        </div>

        {session ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                className="py-1.5 px-2 h-fit font-normal"
                variant="secondary"
              >
                {session.user?.email}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>
                <ThemeToggle />
              </DropdownMenuItem>
              <DropdownMenuItem className="p-1 z-50">
                <form
                  className="w-full"
                  action={() => signOut({ redirectTo: "/" })}
                >
                  <button
                    type="submit"
                    className="w-full text-left px-1 py-0.5 text-red-500"
                  >
                    Sign out
                  </button>
                </form>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <>
            {!session?.user && (
              <Button 
              onClick={() => signInWithGoogle}
              variant="default" 
              size="sm"
              className="flex items-center gap-2"
              >
                <LogInIcon size={16} />
                Log in to keep your videos
              </Button>
            )}
      
            {/* {session?.user && 
            <div className="flex items-center gap-2">
              {!isSaved ? (
              <Button 
                  onClick={saveVideo}
                  disabled={isSaving}
                  variant="default" 
                  size="sm"
                  className="flex items-center gap-2"
              >
                  {isSaving ? (
                  <LoaderIcon className="animate-spin" size={16} />
                  ) : (
                  <SaveIcon size={16} />
                  )}
                  {isSaving ? 'Saving...' : 'Save Video'}
              </Button>
              ) : (
              <div className="flex items-center gap-2 text-green-600">
                  <SaveIcon size={16} />
                  <span className="text-sm font-medium">Video Saved!</span>
              </div>
              )}
            </div>
            } */}
          </>
        )}
      </div>
    </>
  );
};
