export type PhotoLocation = { latitude: number; longitude: number };

const MAX_TIFF_CANDIDATES = 8;

/** Offsets of TIFF headers ("II*\0" / "MM\0*"), EXIF-prefixed ones first. */
function tiffHeaders(bytes: Uint8Array) {
  const exifPrefixed: number[] = [];
  const bare: number[] = [];
  for (let i = 0; i + 8 < bytes.length && exifPrefixed.length + bare.length < MAX_TIFF_CANDIDATES * 2; i++) {
    const little = bytes[i] === 73 && bytes[i + 1] === 73 && bytes[i + 2] === 42 && bytes[i + 3] === 0;
    const big = bytes[i] === 77 && bytes[i + 1] === 77 && bytes[i + 2] === 0 && bytes[i + 3] === 42;
    if (!little && !big) continue;
    // "Exif\0\0" precedes the TIFF header in JPEG APP1 and often in WebP/HEIF.
    const prefixed = i >= 6 && String.fromCharCode(...bytes.subarray(i - 6, i - 2)) === "Exif" && bytes[i - 2] === 0 && bytes[i - 1] === 0;
    (prefixed ? exifPrefixed : bare).push(i);
  }
  return [...exifPrefixed, ...bare].slice(0, MAX_TIFF_CANDIDATES);
}

function validLocation(latitude: number, longitude: number): PhotoLocation | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  // 0,0 is what some apps write when the fix is missing.
  if (latitude === 0 && longitude === 0) return null;
  return { latitude, longitude };
}

function exifLocation(bytes: Uint8Array, start: number): PhotoLocation | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset + start);
  const little = bytes[start] === 73;
  const u16 = (offset: number) => view.getUint16(offset, little);
  const u32 = (offset: number) => view.getUint32(offset, little);
  const root = u32(4);
  let gps = 0;
  for (let i = 0; i < u16(root); i++) {
    const entry = root + 2 + i * 12;
    // GPS IFD pointer: LONG (4) per spec, IFD (13) in some writers.
    if (u16(entry) === 34853 && [4, 13].includes(u16(entry + 2)) && u32(entry + 4) === 1) gps = u32(entry + 8);
  }
  if (!gps) return null;
  const tags = new Map<number, number>();
  for (let i = 0; i < u16(gps); i++) tags.set(u16(gps + 2 + i * 12), gps + 2 + i * 12);
  const coordinate = (tag: number, refTag: number, positive: string, negative: string, max: number) => {
    const entry = tags.get(tag);
    const ref = tags.get(refTag);
    // Ref is a 1-4 byte ASCII value stored inline ("N\0" per spec, sometimes "N").
    if (entry === undefined || ref === undefined || u16(entry + 2) !== 5 || u32(entry + 4) < 1
      || u16(ref + 2) !== 2 || u32(ref + 4) < 1 || u32(ref + 4) > 4) return null;
    const direction = String.fromCharCode(view.getUint8(ref + 8)).toUpperCase();
    const offset = u32(entry + 8);
    const parts = Math.min(u32(entry + 4), 3);
    // A zero denominator (e.g. unused seconds written as 0/0) counts as 0.
    const dms = [0, 1, 2].map(i => {
      if (i >= parts) return 0;
      const denominator = u32(offset + i * 8 + 4);
      return denominator ? u32(offset + i * 8) / denominator : 0;
    });
    if (dms.some(value => !Number.isFinite(value) || value < 0) || dms[0] > max || dms[1] >= 60 || dms[2] >= 60) return null;
    const value = dms[0] + dms[1] / 60 + dms[2] / 3600;
    if (value > max || ![positive, negative].includes(direction)) return null;
    return value * (direction === negative ? -1 : 1);
  };
  const latitude = coordinate(2, 1, "N", "S", 90);
  const longitude = coordinate(4, 3, "E", "W", 180);
  return latitude === null || longitude === null ? null : validLocation(latitude, longitude);
}

/** XMP coordinate: "43,46.2N", "43,46,12N", "43.77N" or signed decimal. */
function xmpCoordinate(raw: string, positive: string, negative: string) {
  const match = /^\s*(-?\d+(?:\.\d+)?)(?:,(\d+(?:\.\d+)?))?(?:,(\d+(?:\.\d+)?))?\s*([NSEW])?\s*$/i.exec(raw);
  if (!match) return null;
  const [, degrees, minutes = "0", seconds = "0", direction = ""] = match;
  const value = Math.abs(Number(degrees)) + Number(minutes) / 60 + Number(seconds) / 3600;
  const hemisphere = direction.toUpperCase();
  if (hemisphere && ![positive, negative].includes(hemisphere)) return null;
  return value * (hemisphere === negative || (!hemisphere && Number(degrees) < 0) ? -1 : 1);
}

// Edited or exported photos (Lightroom, Photos, some web galleries) may keep GPS only in XMP.
function xmpLocation(bytes: Uint8Array): PhotoLocation | null {
  const text = new TextDecoder("latin1").decode(bytes);
  const read = (name: string) => new RegExp(`exif:${name}(?:="([^"]+)"|>([^<]+)<)`).exec(text);
  const latitude = read("GPSLatitude"), longitude = read("GPSLongitude");
  if (!latitude || !longitude) return null;
  const lat = xmpCoordinate(latitude[1] ?? latitude[2], "N", "S");
  const lon = xmpCoordinate(longitude[1] ?? longitude[2], "E", "W");
  return lat === null || lon === null ? null : validLocation(lat, lon);
}

// Read GPS from JPEG/PNG/WebP EXIF (or XMP) before canvas discards metadata.
// Invalid or absent metadata is optional and never blocks the photo.
export async function photoLocation(file: File): Promise<PhotoLocation | null> {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    for (const start of tiffHeaders(bytes)) {
      try {
        const location = exifLocation(bytes, start);
        if (location) return location;
      } catch { /* Not a usable EXIF block: try the next candidate. */ }
    }
    return xmpLocation(bytes);
  } catch { return null; }
}

// Retain GPS alone in the compressed upload. The server validates coordinates,
// stores them separately, and strips all EXIF from the served photo.
export function withPhotoLocation(jpeg: string, location: PhotoLocation | null): string {
  if (!location) return jpeg;
  const tiff = new Uint8Array(128);
  const view = new DataView(tiff.buffer);
  const u16 = (offset: number, value: number) => view.setUint16(offset, value, true);
  const u32 = (offset: number, value: number) => view.setUint32(offset, value, true);
  tiff.set([73, 73, 42, 0]); u32(4, 8); u16(8, 1);
  u16(10, 34853); u16(12, 4); u32(14, 1); u32(18, 26); u16(26, 4);
  [location.latitude, location.longitude].forEach((value, index) => {
    const ref = 28 + index * 24;
    u16(ref, 1 + index * 2); u16(ref + 2, 2); u32(ref + 4, 2);
    tiff[ref + 8] = (index === 0 ? (value < 0 ? "S" : "N") : (value < 0 ? "W" : "E")).charCodeAt(0);
    const entry = ref + 12;
    const offset = 80 + index * 24;
    u16(entry, 2 + index * 2); u16(entry + 2, 5); u32(entry + 4, 3); u32(entry + 8, offset);
    const absolute = Math.abs(value);
    const degrees = Math.floor(absolute);
    const minutes = Math.floor((absolute - degrees) * 60);
    [degrees, minutes, ((absolute - degrees) * 60 - minutes) * 60].forEach((part, i) => {
      u32(offset + i * 8, Math.round(part * 1_000_000)); u32(offset + i * 8 + 4, 1_000_000);
    });
  });
  const segment = String.fromCharCode(255, 225, 0, 136, 69, 120, 105, 102, 0, 0, ...tiff);
  const binary = atob(jpeg.split(",")[1]);
  return `data:image/jpeg;base64,${btoa(binary.slice(0, 2) + segment + binary.slice(2))}`;
}
