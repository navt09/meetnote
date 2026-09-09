"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getJson } from "@/lib/upload";
import { formatTimestamp } from "@/lib/transcript";
import type { SearchHit } from "@/app/api/search/route";

const WHERE: Record<SearchHit["matchedIn"], string> = {
  title: "in the title",
  summary: "in the summary",
  notes: "in the notes",
  transcript: "said in the meeting",
};

/**
 * Search across every meeting, including what was actually said in them.
 *
 * Takes the normal meeting list as children and replaces it while a search is
 * running: when someone is looking for one thing, the other forty meetings are
 * noise. Keeping the list as children means it stays server-rendered and costs
 * nothing when nobody searches.
 *
 * Typing is debounced, because every keystroke is a query against transcripts.
 */
export default function SearchBox({ children }: { children: React.ReactNode }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [term, setTerm] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Guards against a slower earlier response overwriting a newer one.
  const seq = useRef(0);

  // Everything about what to show is derived from the query rather than stored,
  // so nothing has to be reset when the box is cleared.
  const needle = q.trim();
  const active = needle.length >= 2;
  const searching = active && term !== needle;

  useEffect(() => {
    const next = q.trim();
    if (next.length < 2) return;

    const mine = ++seq.current;
    const id = setTimeout(async () => {
      try {
        const data = await getJson<{ hits: SearchHit[] }>(`/api/search?q=${encodeURIComponent(next)}`);
        if (mine !== seq.current) return;
        setHits(data.hits);
        setTerm(next);
        setError(null);
      } catch (err) {
        if (mine !== seq.current) return;
        setError(err instanceof Error ? err.message : "Search failed.");
        setHits([]);
        setTerm(next);
      }
    }, 250);

    return () => clearTimeout(id);
  }, [q]);

  return (
    <>
      <div className="flex flex-col gap-1">
        <div className="relative">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search your meetings, including what was said"
            aria-label="Search meetings"
            className="field w-full text-sm"
          />
          {q ? (
            <button
              onClick={() => setQ("")}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-faint transition-colors hover:text-fg"
            >
              {searching ? "…" : "Clear"}
            </button>
          ) : null}
        </div>
        {error ? <p className="text-xs text-danger">{error}</p> : null}
      </div>

      {active && hits !== null ? <Results hits={hits} query={term} /> : children}
    </>
  );
}

function Results({ hits, query }: { hits: SearchHit[]; query: string }) {
  if (hits.length === 0) {
    return <p className="glass p-6 text-center text-sm text-muted">Nothing matches &ldquo;{query}&rdquo;.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        {hits.length} meeting{hits.length === 1 ? "" : "s"} matching &ldquo;{query}&rdquo;
      </p>
      <ul className="flex flex-col gap-3">
        {hits.map((h) => (
          <li key={h.id} className="glass glass-hover p-4">
            <Link href={`/meetings/${h.id}`} className="group block min-w-0">
              <span className="flex flex-wrap items-baseline gap-x-2.5">
                <span className="truncate font-medium transition-colors group-hover:text-accent">{h.title}</span>
                <span className="text-xs text-faint">{WHERE[h.matchedIn]}</span>
              </span>
              {h.snippet ? (
                <span className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted">&hellip;{h.snippet}&hellip;</span>
              ) : h.summary ? (
                <span className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted">{h.summary}</span>
              ) : null}
              <span className="mt-1.5 block text-xs text-muted">
                {new Date(h.recordedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                {h.durationSeconds ? ` · ${formatTimestamp(h.durationSeconds)}` : ""}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
