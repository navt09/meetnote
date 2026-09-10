import "server-only";
import { NextResponse } from "next/server";
import { isBlocked, requireConnections } from "./guard";
import { deleteConnector } from "./connector-store";
import type { Provider } from "./connectors";

/**
 * Disconnect, for a provider that has a static route of its own.
 *
 * Next matches a static segment ahead of a dynamic one, so a request to
 * /api/connectors/linear never reaches [provider]/route.ts. Those three
 * providers had no DELETE of their own, which meant disconnecting Linear, Jira
 * or Slack answered 405 and quietly did nothing; only Google, which has no
 * static route, ever worked. The end-to-end tier check found it.
 *
 * The provider is bound here rather than read from the URL, so a static route
 * cannot disconnect the wrong one.
 */
export function disconnectRoute(provider: Provider) {
  return async function DELETE(req: Request): Promise<NextResponse> {
    const gate = await requireConnections(req);
    if (isBlocked(gate)) return gate;

    try {
      await deleteConnector(gate.auth.user.id, provider);
      return NextResponse.json({ ok: true });
    } catch (err) {
      console.error(JSON.stringify({ event: "connector_delete_error", provider, message: err instanceof Error ? err.message : String(err) }));
      return NextResponse.json({ error: "Could not disconnect. Try again." }, { status: 500 });
    }
  };
}
