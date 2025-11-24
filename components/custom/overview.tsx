import { motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { LogoGoogle, MessageIcon, VercelIcon } from "./icons";
import { FileImageIcon, LogInIcon } from "lucide-react";
import { Button } from "../ui/button";
import { signInWithGoogle } from "@/app/actions";

export const Overview = ({ session, description ="Bring your dreams to life" }: { session: any; description?: string}) => {
  return (
    <motion.div
      key="overview"
      className="max-w-[500px] mt-20 mx-4 md:mx-0"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ delay: 0.5 }}
    >
      <div className="border-none bg-muted/50 rounded-2xl p-6 flex flex-col gap-2 text-muted-foreground text-sm dark:text-muted-foreground dark:border-zinc-700 space-y-4">
        <div className="border-none bg-muted/50 rounded-2xl p-6 flex flex-col gap-2 text-muted-foreground text-sm dark:text-muted-foreground dark:border-zinc-700 space-y-4">
          <p className="flex flex-row justify-center gap-2 items-center text-lg pr-4">
            <Image
                src="/images/gemini-logo.png"
                height={20}
                width={20}
                alt="gemini logo"
              />
            {description}
          </p>
          { !session?.user && (
            <Button
              onClick={signInWithGoogle}
              variant="default"
              className="hover:scale-103 duration-500 transition-transform flex items-center gap-2"
            >
              <LogInIcon size={ 18 } />
              Sign in to create videos
            </Button>
          ) }
        </div>
      </div>
    </motion.div>
  );
};
