import type { Coordinates } from '@pawtrace/case-domain';

/** Reads PostgreSQL's hex EWKB text output exactly (IEEE doubles), without decimal rounding. */
function reader(hex: string) {
  const view = new DataView(Uint8Array.from(Buffer.from(hex, 'hex')).buffer);
  const little = view.getUint8(0) === 1;
  let offset = 1;
  const uint32 = () => {
    const value = view.getUint32(offset, little);
    offset += 4;
    return value;
  };
  const coordinates = (): Coordinates => {
    const longitude = view.getFloat64(offset, little);
    const latitude = view.getFloat64(offset + 8, little);
    offset += 16;
    return { latitude, longitude };
  };
  const type = uint32();
  if (type & 0x20000000) uint32();
  return { type: type & 0xffff, uint32, coordinates };
}

export function decodePoint(hex: string): Coordinates {
  const geometry = reader(hex);
  if (geometry.type !== 1) throw new Error('Expected a point geometry');
  return geometry.coordinates();
}

export function decodePolygon(hex: string): Coordinates[] {
  const geometry = reader(hex);
  if (geometry.type !== 3 || geometry.uint32() !== 1)
    throw new Error('Expected a one-ring polygon');
  const ring = Array.from({ length: geometry.uint32() }, geometry.coordinates);
  return ring.slice(0, -1);
}
