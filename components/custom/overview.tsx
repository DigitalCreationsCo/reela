import { motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { LogoGoogle, MessageIcon, VercelIcon } from "./icons";
import { FileImageIcon } from "lucide-react";

export const Overview = () => {
  return (
    <motion.div
      key="overview"
      className="max-w-[500px] mt-20 mx-4 md:mx-0"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ delay: 0.5 }}
    >
      <div className="border-none bg-muted/50 rounded-2xl p-6 flex flex-col gap-2 text-muted-foreground text-sm dark:text-muted-foreground dark:border-zinc-700">
        <p className="flex flex-row justify-center gap-2 items-center text-lg font-semibold">
          <Image
              src="/images/gemini-logo.png"
              height={20}
              width={20}
              alt="gemini logo"
            />
          Generate and share video clips. 
        </p>
      </div>
    </motion.div>
  );
};
