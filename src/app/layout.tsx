import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { tierFor } from "@/lib/account-store";
import { getTheme, type Theme } from "@/lib/settings-store";
import { ToastProvider } from "@/components/toast";
import Sidebar from "@/components/sidebar";
import { Logo } from "@/components/logo";
import "./globals.css";

// Fraunces carries the headlines: a serif with an optical-size axis, which
// gives the app warmth without softening the small text that does the work.
// Body and mono are both Plex - most of this product is small text, and Plex
// holds its shape there where a softer face goes mushy.
// The regular weight is for the shopfront, where the headlines are big enough
// to carry themselves; the app's small headings stay at 600.
const display = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], weight: ["400", "600", "700"] });
const body = IBM_Plex_Sans({ variable: "--font-plex-sans", subsets: ["latin"], weight: ["400", "500", "600"] });
const mono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "From the Call",
  description: "Record any meeting, get notes, tasks, and follow-ups done.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let email: string | null = null;
  let isOwner = false;
  let theme: Theme = "dark";
  try {
    const db = await supabaseServer();
    const { data } = await db.auth.getUser();
    email = data.user?.email ?? null;
    if (data.user) {
      // Both reads go out together: they touch different tables and neither
      // needs the other, so the shell waits one round trip rather than two.
      // The Owner tab is only rendered for the owner, so nobody else is shown
      // a door they cannot open. The route guards itself regardless.
      const [tier, stored] = await Promise.all([tierFor(data.user.id, data.user.email), getTheme(data.user.id)]);
      isOwner = tier === "owner";
      theme = stored;
    }
  } catch {
    email = null; // Not configured yet; render signed-out.
  }

  return (
    <html lang="en" data-theme={email ? theme : undefined}>
      {/* Two surfaces: the shopfront is dark with a top header, the app is light
          with a sidebar. globals.css scopes every token to this class. */}
      <body
        className={`${display.variable} ${body.variable} ${mono.variable} font-sans ${
          email ? "app flex min-h-screen flex-col md:flex-row" : "marketing flex min-h-screen flex-col"
        }`}
      >
        <ToastProvider>
          {email ? (
            <>
              <Sidebar email={email} isOwner={isOwner} />
              <div className="flex min-w-0 flex-1 flex-col">
                {/* One ruled sheet on the desk, footer and all, with its column
                    edges running the full height of the page. */}
                <div className="sheet mx-auto flex w-full max-w-4xl flex-1 flex-col">
                  <main className="flex-1 px-5 pb-16 sm:px-8">{children}</main>
                  <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-panel-border px-5 py-5 text-xs text-faint sm:px-8">
                    <span>&copy; {new Date().getFullYear()} From the Call</span>
                    <nav className="flex items-center gap-4">
                      <Link className="transition-colors hover:text-fg" href="/privacy">Privacy</Link>
                      <Link className="transition-colors hover:text-fg" href="/terms">Terms</Link>
                    </nav>
                  </footer>
                </div>
              </div>
            </>
          ) : (
            <>
              <header className="sticky top-0 z-40 border-b border-panel-border bg-bg/80 backdrop-blur-md">
                <div className="wrap flex items-center justify-between gap-4 py-3">
                  <Link
                    href="/"
                    className="font-display flex shrink-0 items-center gap-2 whitespace-nowrap text-[1.0625rem] font-semibold tracking-tight"
                  >
                    <Logo size={27} />
                    <span>From the Call</span>
                  </Link>
                  <nav className="no-scrollbar flex min-w-0 items-center gap-3 overflow-x-auto text-sm text-muted">
                    {/* Anchors rather than routes: the landing page is one
                        document, and a visitor should never lose their place. */}
                    <div className="hidden items-center gap-1 md:flex">
                      {[
                        ["Features", "/#features"],
                        ["Pricing", "/#pricing"],
                        ["About", "/#about"],
                        ["Contact", "/#contact"],
                      ].map(([label, href]) => (
                        <Link key={href} href={href} className="rounded-md px-2.5 py-1.5 text-sm transition-colors hover:text-fg">
                          {label}
                        </Link>
                      ))}
                    </div>
                    <Link href="/login" className="btn btn-ghost whitespace-nowrap">Sign in</Link>
                  </nav>
                </div>
              </header>

              {/* Full width: the landing page is a run of bands that each
                  carry their own ground. Other pages bring their own measure. */}
              <main className="flex-1">{children}</main>

              {/* Public and reachable from every page: Google's OAuth review
                  fetches the privacy policy and terms before approving. */}
              <footer className="mt-auto border-t border-panel-border">
                <div className="wrap grid gap-8 py-12 text-sm sm:grid-cols-[1.4fr_1fr_1fr_1fr]">
                  <div>
                    <Link href="/" className="font-display flex items-center gap-2 whitespace-nowrap text-[1.0625rem] font-semibold tracking-tight">
                      <Logo size={22} />
                      <span>From the Call</span>
                    </Link>
                    <p className="mt-3 max-w-xs text-xs leading-relaxed text-faint">
                      Meeting notes that do the follow-up. No bot in the call, nothing sent without you.
                    </p>
                  </div>
                  {[
                    ["Product", [["How it works", "/#how"], ["Features", "/#features"], ["Pricing", "/#pricing"]]],
                    ["Company", [["About", "/#about"], ["Contact", "/#contact"], ["Sign in", "/login"]]],
                    ["Legal", [["Privacy", "/privacy"], ["Terms", "/terms"]]],
                  ].map(([title, links]) => (
                    <nav key={title as string} className="flex flex-col gap-2">
                      <p className="text-xs text-faint">{title as string}</p>
                      {(links as [string, string][]).map(([label, href]) => (
                        <Link key={href} href={href} className="text-muted transition-colors hover:text-fg">{label}</Link>
                      ))}
                    </nav>
                  ))}
                </div>
                <div className="wrap border-t border-panel-border py-5 text-xs text-faint">
                  &copy; {new Date().getFullYear()} From the Call
                </div>
              </footer>
            </>
          )}
        </ToastProvider>
      </body>
    </html>
  );
}
