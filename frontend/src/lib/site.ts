const FALLBACK_SITE_URL = "https://pettravel.vn";

export function getSiteUrl(): URL {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!configured) return new URL(FALLBACK_SITE_URL);

  try {
    const parsed = new URL(configured);
    return parsed.protocol === "https:" ? parsed : new URL(FALLBACK_SITE_URL);
  } catch {
    return new URL(FALLBACK_SITE_URL);
  }
}
