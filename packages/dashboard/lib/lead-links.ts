export interface NormalizedContactLink {
  href: string;
  isExternal: boolean;
}

export interface LeadDetailsHrefParams {
  leadName: string;
  leadLoca: string;
  returnTo?: string;
}

const URL_PROTOCOLS = new Set(["http:", "https:"]);

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return URL_PROTOCOLS.has(url.protocol);
  } catch {
    return false;
  }
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeUsername(value: string): string | null {
  const normalized = value.trim().replace(/^@+/, "").replace(/^\/+|\/+$/g, "");
  return normalized.length > 0 ? normalized : null;
}

function normalizePhoneDigits(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

function normalizeTelValue(value: string): string | null {
  const trimmed = value.trim();
  const hasLeadingPlus = trimmed.startsWith("+");
  const digits = normalizePhoneDigits(trimmed);

  if (!digits) {
    return null;
  }

  return hasLeadingPlus ? `+${digits}` : digits;
}

function normalizeWebsiteUrl(value: string): string | null {
  const trimmed = value.trim();

  if (isHttpUrl(trimmed)) {
    return trimmed;
  }

  if (/^www\./i.test(trimmed)) {
    return `https://${trimmed}`;
  }

  if (/^[^\s@]+\.[^\s@]{2,}(?:\/[^\s]*)?$/i.test(trimmed)) {
    return `https://${trimmed}`;
  }

  return null;
}

export function buildLeadDetailsHref({
  leadName,
  leadLoca,
  returnTo,
}: LeadDetailsHrefParams): string {
  const params = new URLSearchParams({
    leadName,
    leadLoca,
  });

  if (returnTo) {
    params.set("returnTo", returnTo);
  }

  return `/dashboard/leads/details?${params.toString()}`;
}

export function getLeadDetailsHref(leadName: string, leadLoca: string): string {
  return buildLeadDetailsHref({ leadName, leadLoca });
}

export function getSafeReturnTo(returnTo: string | null | undefined): string | null {
  if (!returnTo) {
    return null;
  }

  return returnTo.startsWith("/") ? returnTo : null;
}

export function getNormalizedContactLink(
  contactKey: string,
  rawValue: string,
): NormalizedContactLink | null {
  const value = rawValue.trim();
  if (!value) {
    return null;
  }

  const key = contactKey.trim().toLowerCase();

  if (key === "instagram") {
    if (isHttpUrl(value)) {
      return { href: value, isExternal: true };
    }

    const username = normalizeUsername(value);
    return username
      ? { href: `https://instagram.com/${username}`, isExternal: true }
      : null;
  }

  if (key === "email" && isEmail(value)) {
    return { href: `mailto:${value}`, isExternal: false };
  }

  if (key === "phone" || key === "telefon") {
    const telValue = normalizeTelValue(value);
    return telValue ? { href: `tel:${telValue}`, isExternal: false } : null;
  }

  if (key === "whatsapp") {
    if (isHttpUrl(value)) {
      return { href: value, isExternal: true };
    }

    const digits = normalizePhoneDigits(value);
    return digits ? { href: `https://wa.me/${digits}`, isExternal: true } : null;
  }

  if (key === "telegram") {
    if (isHttpUrl(value)) {
      return { href: value, isExternal: true };
    }

    const username = normalizeUsername(value);
    return username ? { href: `https://t.me/${username}`, isExternal: true } : null;
  }

  if (key === "facebook" || key === "linkedin" || key === "www" || key === "website" || key === "strona www") {
    const websiteUrl = normalizeWebsiteUrl(value);
    return websiteUrl ? { href: websiteUrl, isExternal: true } : null;
  }

  if (isHttpUrl(value)) {
    return { href: value, isExternal: true };
  }

  if (isEmail(value)) {
    return { href: `mailto:${value}`, isExternal: false };
  }

  const telValue = normalizeTelValue(value);
  if (telValue && ["mobile", "cell", "tel"].includes(key)) {
    return { href: `tel:${telValue}`, isExternal: false };
  }

  return null;
}