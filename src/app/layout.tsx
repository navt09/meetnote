import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { ToastProvider } from "@/components/toast";
import NavTabs from "@/components/nav-tabs";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Meetnote",
  description: "Record any meeting, get notes, tasks, and follow-ups done.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let email: string | null = null;
  try {
    const db = await supabaseServer();
    const { data } = await db.auth.getUser();
    email = data.user?.email ?? null;
  } catch {
    email = null; // Not configured yet; render signed-out.
  }

  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>
        <div className="aurora" aria-hidden>
          <span className="a1" />
          <span className="a2" />
          <span className="a3" />
        </div>

        <ToastProvider>
          <header className="sticky top-0 z-40 border-b border-panel-border/60 bg-bg/60 backdrop-blur-xl">
            <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
              <Link href={email ? "/dashboard" : "/"} className="group flex items-center gap-2.5 font-semibold tracking-tight">
                <span className="relative inline-grid h-6 w-6 place-items-center">
                  <span className="absolute inset-0 rounded-lg bg-gradient-to-br from-accent to-accent-2 opacity-90 transition-transform duration-300 group-hover:rotate-12" />
                  <span className="relative text-[0.7rem] font-black text-[#05060a]">M</span>
                </span>
                meetnote
              </Link>
              <nav className="flex items-center gap-1 text-sm text-muted sm:gap-3">
                {email ? (
                  <>
                    <NavTabs />
                    <form action="/auth/signout" method="post" className="ml-1 flex items-center gap-2">
                      <span className="hidden max-w-[14ch] truncate text-xs sm:inline" title={email}>{email}</span>
                      <button className="rounded-lg px-2.5 py-1.5 transition-colors hover:bg-white/5 hover:text-fg" type="submit">Sign out</button>
                    </form>
                  </>
                ) : (
                  <Link href="/login" className="btn btn-ghost !px-4 !py-1.5 text-sm">Sign in</Link>
                )}
              </nav>
            </div>
          </header>

          <main className="mx-auto w-full max-w-5xl px-6 pb-24">{children}</main>
        </ToastProvider>
      </body>
    </html>
  );
}
