// Content sniffing for the four accepted types. Declared types are never trusted (3.15, 12.10).

/** Bytes the consumer must read from the start of an object to sniff it. */
export const SNIFF_BYTES = 12;

const startsWith = (b: Uint8Array, sig: readonly number[], at = 0): boolean => sig.every((v, i) => b[at + i] === v);

/** Returns the detected MIME type, or undefined when the bytes match none of PDF, JPEG, PNG or MP4. */
export function detectMime(head: Uint8Array): string | undefined {
  if (startsWith(head, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf'; // %PDF-
  if (startsWith(head, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(head, [0x66, 0x74, 0x79, 0x70], 4)) return 'video/mp4'; // "ftyp" box at offset 4
  return undefined;
}
