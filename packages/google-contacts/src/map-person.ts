import type { GoogleContactDto } from "./types.js";

/** Minimal shape of a People API `Person` we care about. */
export interface GooglePersonLike {
  resourceName?: string | null;
  names?: Array<{ displayName?: string | null; unstructuredName?: string | null } | null> | null;
  phoneNumbers?: Array<{ value?: string | null } | null> | null;
  emailAddresses?: Array<{ value?: string | null } | null> | null;
  photos?: Array<{ url?: string | null; default?: boolean | null } | null> | null;
  organizations?: Array<{ name?: string | null; title?: string | null } | null> | null;
  memberships?: Array<{
    contactGroupMembership?: { contactGroupResourceName?: string | null } | null;
  } | null> | null;
}

function uniqueNonEmpty(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const t = typeof v === "string" ? v.trim() : "";
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/**
 * Maps a raw Google Person (or test fixture) to a CHAD contact DTO.
 * Missing fields become null / empty arrays — never fabricated.
 * Groups come only from memberships.contactGroupMembership — never from display name.
 */
export function mapPersonToContact(person: GooglePersonLike | null | undefined): GoogleContactDto | null {
  if (!person || typeof person !== "object") return null;
  const resourceName = typeof person.resourceName === "string" ? person.resourceName.trim() : "";
  if (!resourceName) return null;

  const nameEntry = person.names?.find((n) => n && (n.displayName || n.unstructuredName)) ?? null;
  const displayName =
    (nameEntry?.displayName?.trim() || nameEntry?.unstructuredName?.trim() || null) ?? null;

  const phones = uniqueNonEmpty((person.phoneNumbers ?? []).map((p) => p?.value ?? null));
  const emails = uniqueNonEmpty((person.emailAddresses ?? []).map((e) => e?.value ?? null));

  const photo =
    (person.photos ?? []).find((p) => p && p.url && !p.default) ??
    (person.photos ?? []).find((p) => p && p.url) ??
    null;
  const photoUrl = photo?.url?.trim() || null;

  const organizations = uniqueNonEmpty(
    (person.organizations ?? []).map((o) => {
      if (!o) return null;
      const name = o.name?.trim() || "";
      const title = o.title?.trim() || "";
      if (name && title) return `${name} · ${title}`;
      return name || title || null;
    }),
  );

  const groupResourceNames = uniqueNonEmpty(
    (person.memberships ?? []).map((m) => m?.contactGroupMembership?.contactGroupResourceName ?? null),
  );

  return {
    resourceName,
    displayName,
    phones,
    emails,
    photoUrl,
    organizations,
    groupResourceNames,
  };
}
