/**
 * Single source of truth for the `←` (hierarchy / "up one level") nav
 * button — Story 126. Deliberately independent of
 * `dashboard-history-provider.tsx`: this file answers "what pathname is the
 * structural parent of THIS pathname" purely from `pathname` + its own
 * `searchParams`, never from browser/dashboard visit history and never from
 * component-local React state. `↶`/`↷` (history back/forward) are the
 * provider's job; `←` is this file's job — see `nav-group.tsx`.
 *
 * Replaces ~28 previously scattered per-page `upLevel` props (each page
 * wired its own "go up" target into `DashboardPageShell`). An inventory
 * pass across every dashboard route (Story 126) found every existing target
 * was already derivable purely from the page's own pathname/search params —
 * nothing depended on component state that isn't mirrored in the URL —
 * which is what makes a single stateless table like this correct.
 *
 * Two routes reuse existing address-slug codecs instead of re-deriving the
 * logic: Knowledge's address-mode detail routes and Folders (both encode a
 * CP Item address in the URL; "up" = strip the last loca segment via the
 * same `cp-address/route-codec` helpers those pages already use).
 *
 * `history/entry/[id]` is the one pre-existing case that had no
 * URL-derivable target at all (it used `router.back()`) — its structural
 * parent here is simply `/dashboard/history` (the entries list), which is
 * the correct hierarchy parent even though it loses the previous
 * "return to exactly where you came from" behavior; that behavior now
 * belongs to `↶`, not `←`, by design.
 */

import {
	cpAddressToFoldersHref,
	cpAddressToKnowledgeHref,
	cpRouteSlugToParts,
} from "@/lib/cp-address/route-codec";
import { getLeadDetailsHref, getSafeReturnTo } from "@/lib/lead-links";

export const DASHBOARDS_ROOT = "/dashboard";

export interface HierarchyParent {
	href: string;
}

interface HierarchyContext {
	pathname: string;
	searchParams: URLSearchParams;
}

function withoutParams(pathname: string, sp: URLSearchParams, keys: string[]): string {
	const next = new URLSearchParams(sp);
	for (const key of keys) next.delete(key);
	const qs = next.toString();
	return qs ? `${pathname}?${qs}` : pathname;
}

// ---------------------------------------------------------------------------
// Param-aware resolvers — hub-root pages that multiplex sub-views via their
// own search params instead of separate routes.
// ---------------------------------------------------------------------------

function formsParent({ searchParams: sp }: HierarchyContext): HierarchyParent {
	const form = sp.get("form");
	if (!form) return { href: DASHBOARDS_ROOT };
	switch (form) {
		case "add_recording":
			return { href: sp.get("returnTo") || "/dashboard/views?view=recordings" };
		case "add_prompt":
			return { href: sp.get("returnTo") || "/dashboard/msg-automation/ai-prompts" };
		case "reports":
			return { href: sp.get("returnTo") || "/dashboard/views?view=reports" };
		case "action":
			return { href: "/dashboard/forms" };
		case "add_action":
			return { href: sp.get("editLoca") ? "/dashboard/views?view=tracker" : "/dashboard/forms" };
		case "date_entry":
			return { href: sp.get("editLoca") ? "/dashboard/views?view=dates" : "/dashboard/forms" };
		default:
			return { href: sp.get("returnTo") || "/dashboard/forms" };
	}
}

function viewsParent({ searchParams: sp }: HierarchyContext): HierarchyParent {
	const view = sp.get("view");
	if (!view) return { href: DASHBOARDS_ROOT };
	switch (view) {
		case "recordings":
			return { href: sp.get("recording") ? "/dashboard/views?view=recordings" : "/dashboard/views" };
		case "reports":
			return { href: sp.get("report") ? "/dashboard/views?view=reports" : "/dashboard/views" };
		case "dates-reports": {
			const part = sp.get("part");
			const report = sp.get("report");
			if (part) {
				return { href: `/dashboard/views?view=dates-reports&report=${encodeURIComponent(report ?? "")}` };
			}
			if (report) return { href: "/dashboard/views?view=dates-reports" };
			return { href: "/dashboard/views" };
		}
		default:
			return { href: "/dashboard/views" };
	}
}

function historyParent({ searchParams: sp }: HierarchyContext): HierarchyParent {
	return { href: sp.get("view") ? "/dashboard/history" : DASHBOARDS_ROOT };
}

function statusesParent({ pathname, searchParams: sp }: HierarchyContext): HierarchyParent {
	if (sp.get("editorLeadKey")) {
		return { href: withoutParams(pathname, sp, ["editorLeadKey", "editorData"]) };
	}
	return { href: "/dashboard/msg-automation" };
}

function leadsMsgWorkoutParent({ searchParams: sp }: HierarchyContext): HierarchyParent {
	const leadName = sp.get("leadName");
	const leadLoca = sp.get("leadLoca");
	if (leadName && leadLoca) return { href: getLeadDetailsHref(leadName, leadLoca) };
	return { href: "/dashboard/views?view=leads" };
}

function leadsMessageCreatorParent({ searchParams: sp }: HierarchyContext): HierarchyParent {
	const leadName = sp.get("leadName");
	const leadLoca = sp.get("leadLoca");
	if (!leadName || !leadLoca) return { href: "/dashboard/msg-automation" };
	return { href: getLeadDetailsHref(leadName, leadLoca) };
}

function leadsDetailsParent({ searchParams: sp }: HierarchyContext): HierarchyParent {
	return { href: getSafeReturnTo(sp.get("returnTo")) || "/dashboard/views?view=leads" };
}

function leadsPhotosGalleryParent({ searchParams: sp }: HierarchyContext): HierarchyParent {
	const leadName = sp.get("leadName");
	const loca = sp.get("loca");
	if (leadName && loca) return { href: getLeadDetailsHref(leadName, loca) };
	return { href: "/dashboard/views?view=leads" };
}

const PARAM_AWARE_RESOLVERS: Record<string, (ctx: HierarchyContext) => HierarchyParent> = {
	"/dashboard/forms": formsParent,
	"/dashboard/views": viewsParent,
	"/dashboard/history": historyParent,
	"/dashboard/statuses": statusesParent,
	"/dashboard/leads/msg-workout": leadsMsgWorkoutParent,
	"/dashboard/leads/message-creator": leadsMessageCreatorParent,
	"/dashboard/leads/details": leadsDetailsParent,
	"/dashboard/leads/photos-gallery": leadsPhotosGalleryParent,
};

// ---------------------------------------------------------------------------
// Plain static routes — exact pathname, fixed parent regardless of params.
// ---------------------------------------------------------------------------

const STATIC_PARENTS: Record<string, string> = {
	"/dashboard/knowledge": DASHBOARDS_ROOT,
	"/dashboard/msg-automation": DASHBOARDS_ROOT,
	"/dashboard/admin": DASHBOARDS_ROOT,
	"/dashboard/folders": DASHBOARDS_ROOT,
	"/dashboard/settings": DASHBOARDS_ROOT,
	"/dashboard/msg-automation/ai-prompts": "/dashboard/msg-automation",
	"/dashboard/msg-automation/ai-prompts/new": "/dashboard/msg-automation/ai-prompts",
	"/dashboard/msg-automation/ai-prompts/new/custom": "/dashboard/msg-automation/ai-prompts",
	"/dashboard/msg-automation/ai-prompts/new/managed": "/dashboard/msg-automation/ai-prompts",
	"/dashboard/msg-automation/groups": "/dashboard/msg-automation",
	"/dashboard/msg-automation/links": "/dashboard/msg-automation",
	"/dashboard/msg-automation/links-v2": "/dashboard/msg-automation",
	"/dashboard/msg-automation/google-contacts": "/dashboard/msg-automation",
	"/dashboard/msg-automation/google-contacts/photos-gallery": "/dashboard/msg-automation/google-contacts",
	"/dashboard/msg-automation/multiview": "/dashboard/msg-automation",
	"/dashboard/msg-automation/msg-workout": "/dashboard/msg-automation",
	"/dashboard/msg-automation/msg-workout/manually-added-msg": "/dashboard/msg-automation",
	"/dashboard/admin/examples": "/dashboard/admin",
	"/dashboard/admin/examples/knowledge-v1": "/dashboard/admin/examples",
	"/dashboard/admin/licenses": "/dashboard/admin",
	"/dashboard/admin/payments": "/dashboard/admin",
	"/dashboard/admin/users": "/dashboard/admin",
	"/dashboard/beeper": "/dashboard/msg-automation",
	"/dashboard/beeper/inbox": "/dashboard/beeper",
	"/dashboard/beeper/merge": "/dashboard/beeper",
	"/dashboard/messages": "/dashboard/msg-automation",
	"/dashboard/todo-msg": "/dashboard/msg-automation",
	"/dashboard/todo-msg/edit": "/dashboard/todo-msg",
	"/dashboard/msg-planner": "/dashboard/msg-automation",
};

// ---------------------------------------------------------------------------
// Dynamic-segment fallbacks — pathname prefix, longest match wins. Only
// consulted once the exact maps above miss (so e.g.
// "/dashboard/msg-automation/ai-prompts/new" resolves via STATIC_PARENTS,
// not this list, even though it also starts with the ai-prompts/ prefix).
// ---------------------------------------------------------------------------

const PREFIX_PARENTS: Array<{ prefix: string; href: string }> = [
	{ prefix: "/dashboard/msg-automation/ai-prompts/", href: "/dashboard/msg-automation/ai-prompts" },
	{ prefix: "/dashboard/msg-automation/google-contacts/", href: "/dashboard/msg-automation/google-contacts" },
	{ prefix: "/dashboard/msg-automation/", href: "/dashboard/msg-automation" },
	{ prefix: "/dashboard/admin/examples/", href: "/dashboard/admin/examples" },
	{ prefix: "/dashboard/admin/", href: "/dashboard/admin" },
	{ prefix: "/dashboard/beeper/", href: "/dashboard/beeper" },
	{ prefix: "/dashboard/history/entry/", href: "/dashboard/history" },
	{ prefix: "/dashboard/settings/", href: "/dashboard/settings" },
	{ prefix: "/dashboard/todo-msg/", href: "/dashboard/todo-msg" },
];

// ---------------------------------------------------------------------------
// Address-slug routes — Knowledge (address mode only) and Folders both
// encode a CP Item address in the URL; "up" strips the address's last loca
// segment, reusing the same codec these pages already use themselves.
// ---------------------------------------------------------------------------

function knowledgeParent(pathname: string): HierarchyParent {
	const rest = pathname.slice("/dashboard/knowledge/".length);
	const segments = rest.split("/").filter(Boolean);
	if (segments.length === 0) return { href: "/dashboard/knowledge" };
	const [categorySlug, ...pathSlugs] = segments;

	const addressParts = pathSlugs.length === 0 ? cpRouteSlugToParts(categorySlug) : null;
	if (addressParts) {
		const locaSegments = addressParts.loca.split("/").filter(Boolean);
		if (locaSegments.length === 0) return { href: "/dashboard/knowledge" };
		const parentLoca = locaSegments.slice(0, -1).join("/");
		const parentAddress = parentLoca ? `${addressParts.repoGuid}/${parentLoca}` : addressParts.repoGuid;
		return { href: cpAddressToKnowledgeHref(parentAddress) ?? "/dashboard/knowledge" };
	}

	if (pathSlugs.length === 0) return { href: "/dashboard/knowledge" };
	const encoded = pathSlugs.slice(0, -1).map(encodeURIComponent).join("/");
	return {
		href: encoded
			? `/dashboard/knowledge/${encodeURIComponent(categorySlug)}/${encoded}`
			: `/dashboard/knowledge/${encodeURIComponent(categorySlug)}`,
	};
}

function foldersParent(pathname: string): HierarchyParent {
	const slug = pathname.slice("/dashboard/folders/".length);
	if (!slug) return { href: "/dashboard/folders" };
	const parts = cpRouteSlugToParts(slug);
	if (!parts) return { href: "/dashboard/folders" };
	const segments = parts.loca.split("/").filter(Boolean);
	// The canonical repo-root item (no loca segments) is Folders' own top —
	// its parent is Dashboards directly, NOT the bare `/dashboard/folders`
	// route. That bare route is never a real, stable screen: it always
	// resolves via `router.replace` to a canonical item URL (Story 127 —
	// landing `←` there made hierarchy-back appear stuck, since every visit
	// immediately redirects back to a canonical slug instead of staying put).
	if (segments.length === 0) return { href: DASHBOARDS_ROOT };
	const parentLoca = segments.slice(0, -1).join("/");
	const parentAddress = parentLoca ? `${parts.repoGuid}/${parentLoca}` : parts.repoGuid;
	return { href: cpAddressToFoldersHref(parentAddress) ?? DASHBOARDS_ROOT };
}

// ---------------------------------------------------------------------------

/**
 * Resolves `←`'s target for the current route. Returns `null` only for the
 * Dashboards root itself — `←` renders disabled there.
 */
export function getHierarchyParent(pathname: string, searchParams: URLSearchParams): HierarchyParent | null {
	if (pathname === DASHBOARDS_ROOT) return null;

	const ctx: HierarchyContext = { pathname, searchParams };

	const resolver = PARAM_AWARE_RESOLVERS[pathname];
	if (resolver) return resolver(ctx);

	const staticParent = STATIC_PARENTS[pathname];
	if (staticParent) return { href: staticParent };

	if (pathname.startsWith("/dashboard/knowledge/")) return knowledgeParent(pathname);
	if (pathname.startsWith("/dashboard/folders/")) return foldersParent(pathname);

	let best: { prefix: string; href: string } | null = null;
	for (const rule of PREFIX_PARENTS) {
		if (pathname.startsWith(rule.prefix) && (!best || rule.prefix.length > best.prefix.length)) {
			best = rule;
		}
	}
	if (best) return { href: best.href };

	// Safety net: any route not explicitly modeled above still gets a working
	// `←` back to Dashboards, rather than being permanently stuck disabled.
	return { href: DASHBOARDS_ROOT };
}
