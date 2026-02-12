const DEFAULT_LOGO_DEV_PUBLIC_TOKEN = 'pk_X-1ZO13GSgeOoUrIuJ6GMQ';

/**
 * Normalize an arbitrary website/domain input to a plain hostname.
 */
export function normalizeCompanyDomain(domain: string | null | undefined): string | null {
  if (!domain) return null;

  const normalized = domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[/?#].*$/, '')
    .replace(/\/$/, '');

  return normalized || null;
}

/**
 * Build a logo.dev URL for a company domain.
 */
export function getLogoDevUrl(
  domain: string | null | undefined,
  options?: { size?: number; format?: 'png' | 'jpg' | 'webp' | 'svg' }
): string | null {
  const normalizedDomain = normalizeCompanyDomain(domain);
  if (!normalizedDomain) return null;

  const token = import.meta.env.VITE_LOGODEV_PUBLIC_TOKEN || DEFAULT_LOGO_DEV_PUBLIC_TOKEN;
  const size = options?.size ?? 128;
  const format = options?.format ?? 'png';

  return `https://img.logo.dev/${encodeURIComponent(normalizedDomain)}?token=${token}&size=${size}&format=${format}`;
}
