import type { Metadata } from "next";
import { Bricolage_Grotesque, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { tierFor } from "@/lib/account-store";
import { ToastProvider } from "@/components/toast";
import NavTabs from "@/components/nav-tabs";
import { Logo } from "@/components/logo";
import "./globals.css";

// Bricolage carries the headlines and the wordmark: its optical-size axis means
// the display cut kicks in on its own at large sizes.
//
// Body and mono are both Plex. Most of this product is small text - owners,
// dates, task meta - and Plex Sans holds its shape there where a softer
// grotesk goes mushy: open apertures, a tall x-height, and an l that cannot be
// mistaken for a 1. It also belongs to the same family as the mono already
// used for transcripts, so the two sit together instead of merely coexisting.
const display = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"], axes: ["opsz", "wdth"] });
const body = IBM_Plex_Sans({ variable: "--font-plex-sans", subsets: ["latin"], weight: ["400", "500", "600"] });
const mono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500"] });

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
      <body className={`${display.variable} ${body.variable} ${mono.variable} flex min-h-screen flex-col font-sans`}>
        <ToastProvider>
          <header className="sticky top-0 z-40 border-b border-panel-border bg-bg/80 backdrop-blur-md">
            <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-6 py-3">
              {/* The wordmark is three words, so it must not wrap, and it gives
                  way to the mark alone once the nav needs the room. */}
              <Link
                href={email ? "/dashboard" : "/"}
                className="font-display flex shrink-0 items-center gap-2 whitespace-nowrap text-[1.0625rem] font-semibold tracking-tight"
              >
                <Logo size={27} />
                <span className={email ? "hidden lg:inline" : "inline"}>From the Call</span>
              </Link>
              <nav className="no-scrollbar flex min-w-0 items-center gap-3 overflow-x-auto text-sm text-muted">
                {email ? (
                  <>
                    <NavTabs isOwner={isOwner} />
                    <form action="/auth/signout" method="post" className="flex shrink-0 items-center gap-3 border-l border-panel-border pl-3">
                      <span className="hidden max-w-[16ch] truncate text-xs text-faint sm:inline" title={email}>{email}</span>
                      <button className="whitespace-nowrap text-xs transition-colors hover:text-fg" type="submit">Sign out</button>
                    </form>
                  </>
                ) : (
                  <>
                    {/* Marketing nav. Anchors rather than routes: the landing
                        page is one document, and a visitor should never lose
                        their place in it. */}
                    <div className="hidden items-center gap-1 md:flex">
                      {[
                        ["Features", "/#features"],
                        ["Pricing", "/#pricing"],
                        ["About", "/#about"],
                        ["Contact", "/#contact"],
                      ].map(([label, href]) => (
                        <Link
                          key={href}
                          href={href}
                          className="rounded-md px-2.5 py-1.5 text-sm transition-colors hover:text-fg"
                        >
                          {label}
                        </Link>
                      ))}
                    </div>
                    <Link href="/login" className="btn btn-ghost whitespace-nowrap">Sign in</Link>
                  </>
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
