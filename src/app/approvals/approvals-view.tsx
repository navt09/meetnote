"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteJson, patchJson, postJson } from "@/lib/upload";
import { useToast } from "@/components/toast";
import { EmptyState, PageHead, Skeleton } from "@/components/ui";
import { ticketDestinationNote, type TicketDestination } from "@/lib/ticket-destination";
import { isUpgradeError, upgradeMessage } from "@/components/upgrade";
import { draftToClipboard, kindLabel, sortDrafts, type DraftStatus, type PublicDraft } from "@/lib/draft";
import { parseBlocks, type Inline } from "@/lib/markdown-lite";

/** Renders the draft's Markdown as elements. Never as HTML, so nothing can be injected. */
function DraftBody({ markdown }: { markdown: string }) {
  const blocks = parseBlocks(markdown);
  const runs = (content: Inline[]) =>
    content.map((r, i) => (r.bold ? <strong key={i} className="font-medium text-fg">{r.text}</strong> : <span key={i}>{r.text}</span>));

  return (
    <div className="mt-3 space-y-2.5 text-sm leading-relaxed text-muted">
      {blocks.map((b, i) =>
        b.type === "bullets" ? (
          <ul key={i} className="space-y-1.5">
            {b.items.map((item, j) => (
              <li key={j} className="flex gap-2.5">
                <span className="text-faint" aria-hidden>—</span>
                <span>{runs(item)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p key={i}>{runs(b.content)}</p>
        ),
      )}
    </div>
  );
}

const FILTERS: { key: DraftStatus | "all"; label: string }[] = [
  { key: "pending", label: "Waiting on you" },
  { key: "approved", label: "Approved" },
  { key: "all", label: "All" },
];

/**
 * A draft this page was sent here to write, rather than one it is showing.
 *
 * Drafting takes the model about eight seconds, and eight seconds of a dead
 * button on the Tasks page reads as a hang. So the press navigates here first
 * and the writing happens in front of the thing it produces, where the wait
 * has somewhere to land.
 */
export type DraftRequest = { kind: "ticket"; id: string } | { kind: "email"; id: string; who: string };

export default function ApprovalsView({
  initial,
  loadError,
  ticketDestination,
  writeRequest,
}: {
  initial: PublicDraft[];
  loadError: string | null;
  ticketDestination: TicketDestination;
  /** Set when we arrived here by pressing draft, rather than by opening the tab. */
  writeRequest: DraftRequest | null;
}) {
  const toast = useToast();
  const router = useRouter();
  const [drafts, setDrafts] = useState<PublicDraft[]>(initial);
  const [filter, setFilter] = useState<DraftStatus | "all">("pending");
  const [editing, setEditing] = useState<string | null>(null);
  const [draftSubject, setDraftSubject] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [writing, setWriting] = useState<DraftRequest | null>(writeRequest);

  /* Writing the draft the press asked for. Re-running this is safe by
     construction: a task has one live ticket draft and a recipient one live
     email draft per meeting, both enforced by a unique index, so a second
     attempt replaces the first rather than making two. */
  useEffect(() => {
    if (!writeRequest) return;
    let live = true;
    (async () => {
      try {
        const { draft } =
          writeRequest.kind === "ticket"
            ? await postJson<{ draft: PublicDraft }>(`/api/tasks/${writeRequest.id}/draft`, {})
            : await postJson<{ draft: PublicDraft }>(`/api/meetings/${writeRequest.id}/draft-email`, { name: writeRequest.who });
        if (!live) return;
        setDrafts((list) => [draft, ...list.filter((x) => x.id !== draft.id)]);
        setFilter("pending");
      } catch (err) {
        if (!live) return;
        // The tier can change between the page that offered the button and
        // this request, so a refusal is explained rather than shown raw.
        const fallback = err instanceof Error ? err.message : "Could not write that draft";
        toast(isUpgradeError(err) ? upgradeMessage("draft", fallback) : fallback, "error");
      } finally {
        if (live) setWriting(null);
        // Drop the instruction out of the URL so a refresh reads the page
        // rather than drafting all over again.
        router.replace("/approvals", { scroll: false });
      }
    })();
    return () => {
      live = false;
    };
  }, [writeRequest, toast, router]);

  // Nothing here writes "dismissed" any more, but rows saved before Dismiss
  // became Delete still carry it, so "All" keeps hiding them.
  const visible = useMemo(
    () => sortDrafts(drafts.filter((d) => (filter === "all" ? d.status !== "dismissed" : d.status === filter))),
    [drafts, filter],
  );
  const pendingCount = useMemo(() => drafts.filter((d) => d.status === "pending").length, [drafts]);

  function replace(next: PublicDraft) {
    setDrafts((list) => list.map((d) => (d.id === next.id ? next : d)));
  }

  async function approve(d: PublicDraft) {
    setBusy(d.id);
    const previous = d.status;
    replace({ ...d, status: "approved" });
    try {
      const { draft } = await patchJson<{ draft: PublicDraft }>(`/api/drafts/${d.id}`, { status: "approved" });
      replace(draft);
      toast("Approved", "ok");
    } catch (err) {
      replace({ ...d, status: previous });
      toast(err instanceof Error ? err.message : "Could not update that draft", "error");
    } finally {
      setBusy(null);
    }
  }

  async function saveEdit(d: PublicDraft) {
    const subject = draftSubject.trim();
    const body = draftBody.trim();
    setEditing(null);
    if (!subject || !body || (subject === d.subject && body === d.body)) return;
    setBusy(d.id);
    try {
      const { draft } = await patchJson<{ draft: PublicDraft }>(`/api/drafts/${d.id}`, { subject, body });
      replace(draft);
      toast("Saved", "ok");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save that edit", "error");
    } finally {
      setBusy(null);
    }
  }

  /* No confirmation step: a draft is cheap to make again with one press of
     "draft ticket" or "draft email", so an extra click would cost more than
     the mistake it prevents. A recording would be a different matter. */
  async function remove(d: PublicDraft) {
    setBusy(d.id);
    try {
      await deleteJson(`/api/drafts/${d.id}`);
      setDrafts((list) => list.filter((x) => x.id !== d.id));
      toast("Draft deleted", "ok");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not delete that draft", "error");
    } finally {
      setBusy(null);
    }
  }

  async function copy(d: PublicDraft) {
    try {
      await navigator.clipboard.writeText(draftToClipboard(d));
      toast(d.kind === "ticket" ? "Ticket copied. Paste it into Linear or Jira." : "Email copied.", "ok");
    } catch {
      toast("Couldn't access the clipboard", "error");
    }
  }

  return (
    <section className="flex flex-col gap-6 pt-10">
      <PageHead
        title="Approvals"
        meta={pendingCount === 0 ? "Nothing waiting on you" : `${pendingCount} waiting on you`}
        action={<Link href="/tasks" className="btn btn-ghost">Go to tasks</Link>}
      />

      {loadError ? <p className="glass p-4 text-sm text-danger">{loadError}</p> : null}

      {drafts.length > 0 ? (
        <div className="rise flex gap-0.5 self-start rounded-lg border border-panel-border p-0.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                filter === f.key ? "bg-panel-hi font-medium text-fg" : "text-muted hover:text-fg"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      ) : null}

      {drafts.length === 0 ? (
        <EmptyState
          title="Nothing drafted yet"
          body="Open a task and press “Draft ticket”, and the write-up will land here for you to check before it goes anywhere."
          action={<Link href="/tasks" className="btn btn-primary">Go to tasks</Link>}
        />
      ) : visible.length === 0 ? (
        <EmptyState title="Nothing here" body={filter === "pending" ? "You've dealt with everything drafted so far." : "Try a different filter."} />
      ) : null}

      {writing ? (
        <div className="glass p-5">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-faint">
            <span className="pill">{writing.kind === "ticket" ? "Ticket" : "Email"}</span>
            <span>writing it now, about ten seconds</span>
          </p>
          <Skeleton className="mt-3 h-5 w-2/3" />
          <div className="mt-4 space-y-2">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-11/12" />
            <Skeleton className="h-3.5 w-4/5" />
          </div>
        </div>
      ) : null}

      <ul className="stagger flex flex-col gap-3">
        {visible.map((d) => {
          const isEditing = editing === d.id;
          return (
            <li key={d.id} className="glass p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-faint">
                    <span className="pill">{kindLabel(d.kind)}</span>
                    {d.recipient ? <span>to {d.recipient}</span> : null}
                    <Link href={`/meetings/${d.meetingId}`} className="truncate transition-colors hover:text-fg">
                      {d.meetingTitle}
                    </Link>
                    {d.status === "approved" ? <span className="pill pill-ok">approved</span> : null}
                  </p>

                  {isEditing ? (
                    <input
                      value={draftSubject}
                      onChange={(e) => setDraftSubject(e.target.value)}
                      className="field mt-3 font-medium"
                      aria-label="Subject"
                    />
                  ) : (
                    <p className="mt-2.5 font-medium leading-snug">{d.subject}</p>
                  )}
                </div>
              </div>

              {isEditing ? (
                <>
                  <textarea
                    value={draftBody}
                    onChange={(e) => setDraftBody(e.target.value)}
                    rows={12}
                    className="field mt-3 font-mono text-xs leading-relaxed"
                    aria-label="Body"
                  />
                  <div className="mt-3 flex gap-2">
                    <button className="btn btn-primary !py-1.5 text-xs" disabled={busy === d.id} onClick={() => saveEdit(d)}>Save</button>
                    <button className="btn btn-ghost !py-1.5 text-xs" onClick={() => setEditing(null)}>Cancel</button>
                  </div>
                </>
              ) : (
                <>
                  <DraftBody markdown={d.body} />
                  {d.kind === "ticket" && d.status === "pending" ? (
                    /* Said here because this is the moment it matters: after
                       the next press the issue either exists in someone
                       else's tracker or it does not. */
                    <p className="mt-4 text-xs text-muted">{ticketDestinationNote(ticketDestination)}</p>
                  ) : null}
                  <div className="mt-4 flex flex-wrap gap-2 border-t border-panel-border pt-4">
                    {d.status === "pending" ? (
                      <button className="btn btn-approve !py-1.5 text-xs" disabled={busy === d.id} onClick={() => approve(d)}>
                        Approve
                      </button>
                    ) : null}
                    <button className="btn btn-ghost !py-1.5 text-xs" onClick={() => copy(d)}>
                      {d.kind === "ticket" ? "Copy ticket" : "Copy email"}
                    </button>
                    <button
                      className="btn btn-ghost !py-1.5 text-xs"
                      onClick={() => {
                        setDraftSubject(d.subject);
                        setDraftBody(d.body);
                        setEditing(d.id);
                      }}
                    >
                      Edit
                    </button>
                    <button className="btn btn-danger-outline !py-1.5 text-xs" disabled={busy === d.id} onClick={() => remove(d)}>
                      Delete
                    </button>
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
