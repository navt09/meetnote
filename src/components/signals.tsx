import Link from "next/link";
import { formatTimestamp } from "@/lib/transcript";
import type { Mention, Signals } from "@/lib/signals";

/**
 * What the call said about competitors, money and meeting again.
 *
 * Found by searching the transcript, not written by the model, so every line
 * here is shown with the words it came from and the moment they were said.
 * That is the whole claim this panel makes: these words were spoken, here.
 *
 * Uncoloured, like the summary. The three hues mean work, agreement and
 * people; none of these is one of those, and a fourth colour would claim a
 * meaning it does not have.
 *
 * Draws nothing when nothing was found and no list is kept, so a meeting that
 * never touched on any of this does not carry an empty panel.
 */
export function SignalsView({ signals }: { signals: Signals }) {
  const { competitors, money, nextMeeting, competitorsTracked } = signals;
  const anything = competitors.length > 0 || money.length > 0 || nextMeeting !== null;
  if (!anything && competitorsTracked === 0) return null;

  return (
    <section className="mt-5 rounded-xl border border-panel-border p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-base font-semibold">From the transcript</h2>
        <span className="text-xs text-faint">found by searching what was said</span>
      </div>

      <div className="mt-4 flex flex-col gap-5">
        {nextMeeting ? (
          <div>
            <p className="rule-label">Next meeting</p>
            <p className="mt-2 text-sm">
              <span className="font-medium">
                {calendarLabel(nextMeeting.date)}
              </span>
            </p>
            <Said mention={{ ...nextMeeting, text: "" }} />
          </div>
        ) : null}

        <div>
          <p className="rule-label">
            Competitors
            {competitors.length > 0 ? <span className="figure text-xs font-normal text-faint">{competitors.length}</span> : null}
          </p>
          {competitorsTracked === 0 ? (
            <p className="mt-2 text-sm text-muted">
              <Link href="/settings#competitors" className="text-accent hover:underline">
                Add the competitors you want spotted
              </Link>{" "}
              and every call that names one will say so here.
            </p>
          ) : competitors.length === 0 ? (
            <p className="mt-2 text-sm text-muted">None of the {competitorsTracked} you track came up.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-3">
              {competitors.map((c) => (
                <li key={c.name}>
                  <p className="text-sm">
                    <span className="font-medium">{c.name}</span>
                    <span className="text-faint"> · </span>
                    <span className="text-muted">
                      {c.mentions.length === 1 ? "mentioned once" : `mentioned ${c.mentions.length} times`}
                    </span>
                  </p>
                  {c.mentions.slice(0, 3).map((m, i) => (
                    <Said key={i} mention={m} />
                  ))}
                </li>
              ))}
            </ul>
          )}
        </div>

        {money.length > 0 ? (
          <div>
            <p className="rule-label">
              Money
              <span className="figure text-xs font-normal text-faint">{money.length}</span>
            </p>
            <ul className="mt-2 flex flex-col gap-1">
              {byLine(money).map((row, i) => (
                <li key={i}>
                  <Said mention={row.mention} marks={row.marks} />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/**
 * "Thursday, September 17" for a YYYY-MM-DD day, read as that day wherever the
 * reader is. Built and formatted in UTC so no zone gets a chance to move it.
 */
function calendarLabel(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

/**
 * Folds several finds from one line into one row.
 *
 * "$40k a year, moving to $65 per seat" is one thing somebody said, and
 * showing the sentence twice reads as two conversations. A later find joins
 * the row only when its words sit inside the excerpt already shown; on a long
 * line where they do not, it keeps a row of its own so it is still visible.
 */
function byLine(mentions: Mention[]): { mention: Mention; marks: string[] }[] {
  const rows: { mention: Mention; marks: string[] }[] = [];
  for (const m of mentions) {
    const last = rows[rows.length - 1];
    if (
      last &&
      last.mention.start === m.start &&
      last.mention.speaker === m.speaker &&
      last.mention.excerpt.toLowerCase().includes(m.text.toLowerCase())
    ) {
      last.marks.push(m.text);
    } else {
      rows.push({ mention: m, marks: [m.text] });
    }
  }
  return rows;
}

/** Splits text into plain and matched runs, first occurrence of each mark, left to right. */
function highlight(text: string, marks: string[]): { text: string; hit: boolean }[] {
  const lower = text.toLowerCase();
  const spans: [number, number][] = [];
  let from = 0;
  for (const mark of marks) {
    if (!mark) continue;
    const at = lower.indexOf(mark.toLowerCase(), from);
    if (at === -1) continue;
    spans.push([at, at + mark.length]);
    from = at + mark.length;
  }
  const out: { text: string; hit: boolean }[] = [];
  let cursor = 0;
  for (const [a, b] of spans) {
    if (a > cursor) out.push({ text: text.slice(cursor, a), hit: false });
    out.push({ text: text.slice(a, b), hit: true });
    cursor = b;
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor), hit: false });
  return out;
}

/**
 * One place something was said: when, who, and the words, with the matched
 * parts picked out. React elements only, never HTML: this is transcript text.
 */
function Said({ mention, marks }: { mention: Mention; marks?: string[] }) {
  const runs = highlight(mention.excerpt, marks ?? [mention.text]);

  return (
    <p className="mt-1 flex gap-3 text-sm leading-relaxed">
      <span className="figure w-10 flex-none pt-1 text-right text-xs text-faint">{formatTimestamp(mention.start)}</span>
      <span className="min-w-0">
        <span className="text-faint">{mention.speaker} · </span>
        <span className="text-muted">
          {runs.map((r, i) =>
            r.hit ? (
              <mark key={i} className="rounded-sm bg-transparent font-medium text-fg">
                {r.text}
              </mark>
            ) : (
              <span key={i}>{r.text}</span>
            ),
          )}
        </span>
      </span>
    </p>
  );
}
