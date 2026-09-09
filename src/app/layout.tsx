import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { tierFor } from "@/lib/account-store";
import { ToastProvider } from "@/components/toast";
import NavTabs from "@/components/nav-tabs";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "From the Call",
  description: "Record any meeting, get notes, tasks, and follow-ups done.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let email: string | null = null;
  let isOwner = false;
  try {
    const db = await supabaseServer();
    const { data } = await db.auth.getUser();
    email = data.user?.email ?? null;
    // The Owner tab is only rendered for the owner, so nobody else is shown a
    // door they cannot open. The route guards itself regardless.
    if (data.user) isOwner = (await tierFor(data.user.id, data.user.email)) === "owner";
  } catch {
    email = null; // Not configured yet; render signed-out.
  }

  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} flex min-h-screen flex-col font-sans`}>
        <ToastProvider>
          <header className="sticky top-0 z-40 border-b border-panel-border bg-bg/80 backdrop-blur-md">
            <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-6 py-3">
              <Link href={email ? "/dashboard" : "/"} className="flex items-center gap-2 text-[0.9375rem] font-semibold tracking-tight">
                <span className="grid h-5 w-5 place-items-center rounded bg-accent text-[0.625rem] font-bold text-[color:var(--accent-ink)]">F</span>
                fromthecall
              </Link>
              <nav className="flex items-center gap-3 text-sm text-muted">
                {email ? (
                  <>
                    <NavTabs isOwner={isOwner} />
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

          <main className="mx-auto w-full max-w-5xl px-6 pb-16">{children}</main>

          {/* Public and reachable from every page: Google's OAuth review fetches
              the privacy policy and terms from the home page before approving. */}
          <footer className="mt-auto border-t border-panel-border">
            <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-6 text-xs text-faint">
              <span>&copy; {new Date().getFullYear()} From the Call</span>
              <nav className="flex items-center gap-4">
                <Link className="transition-colors hover:text-fg" href="/privacy">Privacy</Link>
                <Link className="transition-colors hover:text-fg" href="/terms">Terms</Link>
              </nav>
            </div>
          </footer>
        </ToastProvider>
      </body>
    </html>
  );
}
