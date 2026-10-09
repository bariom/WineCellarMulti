export function memoryPhotoThumbnailUrl(url: string | undefined): string | undefined {
  // Other image sources (including local previews) retain their original URL.
  if (!url?.startsWith("/api/v1/wines/tasting-photos/")) return url;
  const thumbnail = new URL(url, "https://vinaris.invalid");
  thumbnail.searchParams.set("size", "thumbnail");
  return `${thumbnail.pathname}${thumbnail.search}${thumbnail.hash}`;
}
