export type PhotoLocation = { latitude: number; longitude: number };

// Read TIFF GPS from JPEG/PNG/WebP EXIF before canvas discards metadata.
// Invalid or absent metadata is optional and never blocks the photo.
export async function photoLocation(file: File): Promise<PhotoLocation | null> {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let start = -1;
    for (let i = 0; i + 8 < bytes.length; i++) {
      if ((bytes[i] === 73 && bytes[i + 1] === 73 && bytes[i + 2] === 42 && bytes[i + 3] === 0)
        || (bytes[i] === 77 && bytes[i + 1] === 77 && bytes[i + 2] === 0 && bytes[i + 3] === 42)) { start = i; break; }
    }
    if (start < 0) return null;
    const view = new DataView(bytes.buffer, start);
    const little = bytes[start] === 73;
    const u16 = (offset: number) => view.getUint16(offset, little);
    const u32 = (offset: number) => view.getUint32(offset, little);
    const root = u32(4);
    const count = u16(root);
    let gps = 0;
    for (let i = 0; i < count; i++) {
      const entry = root + 2 + i * 12;
      if (u16(entry) === 34853 && u16(entry + 2) === 4 && u32(entry + 4) === 1) gps = u32(entry + 8);
    }
    if (!gps) return null;
    const tags = new Map<number, number>();
    for (let i = 0; i < u16(gps); i++) {
      const entry = gps + 2 + i * 12;
      tags.set(u16(entry), entry);
    }
    const coordinate = (tag: number, refTag: number, positive: string, negative: string, max: number) => {
      const entry = tags.get(tag)!;
      const ref = tags.get(refTag)!;
      if (entry === undefined || ref === undefined || u16(entry + 2) !== 5 || u32(entry + 4) !== 3
        || u16(ref + 2) !== 2 || u32(ref + 4) !== 2) throw new Error("GPS");
      const direction = String.fromCharCode(view.getUint8(ref + 8));
      const offset = u32(entry + 8);
      const dms = [0, 8, 16].map(i => u32(offset + i) / u32(offset + i + 4));
      if (dms.some(value => !Number.isFinite(value) || value < 0) || dms[0] > max || dms[1] >= 60 || dms[2] >= 60) throw new Error("GPS");
      const value = dms[0] + dms[1] / 60 + dms[2] / 3600;
      if (value > max || ![positive, negative].includes(direction)) throw new Error("GPS");
      return value * (direction === negative ? -1 : 1);
    };
    return { latitude: coordinate(2, 1, "N", "S", 90), longitude: coordinate(4, 3, "E", "W", 180) };
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
