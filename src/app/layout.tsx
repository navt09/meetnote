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
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans`}>
        <ToastProvider>
          <header className="sticky top-0 z-40 border-b border-panel-border bg-bg/80 backdrop-blur-md">
            <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-6 py-3">
              <Link href={email ? "/dashboard" : "/"} className="flex items-center gap-2 text-[0.9375rem] font-semibold tracking-tight">
                <span className="grid h-5 w-5 place-items-center rounded bg-accent text-[0.625rem] font-bold text-[color:var(--accent-ink)]">M</span>
                meetnote
              </Link>
              <nav className="flex items-center gap-3 text-sm text-muted">
                {email ? (
                  <>
                    <NavTabs />
                    <form action="/auth/signout" method="post" className="flex items-center gap-3 border-l border-panel-border pl-3">
                      <span className="hidden max-w-[16ch] truncate text-xs text-faint sm:inline" title={email}>{email}</span>
                      <button className="text-xs transition-colors hover:text-fg" type="submit">Sign out</button>
                    </form>
                  </>
                ) : (
                  <Link href="/login" className="btn btn-ghost">Sign in</Link>
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
