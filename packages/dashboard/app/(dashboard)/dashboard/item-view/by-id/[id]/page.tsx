/**
 * `/dashboard/item-view/by-id/<CpItem.id>` — Story 120's real, server-side
 * target for the shared Preview's CP-link (`components/shared/cp-link-text.tsx`).
 *
 * The Preview only ever stores a stable `CpItem.id`, never an address (a
 * Move must not break the link — Story 119) — so the link's `href` can't
 * point straight at the canonical `/dashboard/item-view/<slug>` route
 * without a server round trip. This route IS that round trip, but as a
 * real, authorizing, redirecting page rather than a click handler: it
 * validates the id, resolves it (scoped to exactly the repos this session
 * may browse, via the pre-existing `resolveCpItemByIdForUser`), and
 * `redirect()`s to the canonical view for the target's TYPE — Item View for
 * a Text item, Knowledge's address-based card-grid view for a Folder item
 * (a live Story 120 clarification: Folder items stay in Knowledge's own
 * "nice" view, never Item View) — or renders a controlled "not found/not
 * accessible" state, never a crash or a hint about another user's data.
 * Because it's a real route (not `href="#"` + JS), right-click → "Open Link
 * in New Tab", Cmd/Ctrl-click, and middle-click all work natively; the
 * browser never needs the link to have been pre-resolved.
 *
 * (Originally lived at `/dashboard/folders/by-id/<id>`, redirecting into
 * the Folders browsing GUI — moved here per a live follow-up during Story
 * 120: a CP-link should open a "full view without navigation", not the
 * full Folders browser.)
 */
import { redirect } from "next/navigation";
import { getCurrentUserFromCookies } from "@/lib/session";
import { resolveCpItemByIdForUser } from "dba";
import { cpAddressToItemViewHref, cpAddressToKnowledgeHref } from "@/lib/cp-address/route-codec";
import { DashboardPageShell } from "@/components/shared/dashboard-page-shell";
import { ErrorBox } from "@/components/shared/error-box";

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export default async function CpLinkByIdPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUserFromCookies();

  if (user && UUID_RE.test(id)) {
    const target = await resolveCpItemByIdForUser(user, id);
    if (target) {
      const address = target.loca ? `${target.repoGuid}/${target.loca}` : target.repoGuid;
      const href = target.type === "Folder" ? cpAddressToKnowledgeHref(address) : cpAddressToItemViewHref(address);
      if (href) redirect(href);
    }
  }

  return (
    <DashboardPageShell title="Item">
      <ErrorBox message="This item could not be found or is not accessible." />
    </DashboardPageShell>
  );
}
