import { Metadata } from "next";
import { Toaster } from "sonner";
import { Navbar } from "@/components/custom/navbar";
import { Sidebar } from "@/components/custom/sidebar";
import { ThemeProvider } from "@/components/custom/theme-provider";
import { auth } from "@/auth";
import "./globals.css";

export const metadata: Metadata = {
  // metadataBase: new URL("https://gemini.vercel.ai"),
  title: "Reela | AI Video Generator",
  description: "Generate videos with AI in the app or via the API.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();
  return (
    <html lang="en" className="dark">
      <body className="antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <Navbar session={session} />
          <Sidebar />
            <Toaster position="top-center" />
            <main className="">
              { children }
            </main>
        </ThemeProvider>
      </body>
    </html>
  );
}
