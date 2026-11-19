// 구역 (polygons) on the map: geometry checks, geodesic area and perimeter,
// simplification and unit formatting. GeoJSON order: [lng, lat].

export type Position = [number, number];
export type PolygonGeometry = { type: "Polygon"; coordinates: Position[][] };
export type MultiPolygonGeometry = { type: "MultiPolygon"; coordinates: Position[][][] };
export type AreaGeometry = PolygonGeometry | MultiPolygonGeometry;

/** Most vertices one 구역 may keep (larger shapes are simplified first). */
export const MAX_AREA_VERTICES = 20000;
const EARTH_RADIUS = 6371008.8;
const PYEONG = 3.305785;

const rad = (degrees: number) => (degrees * Math.PI) / 180;

/** Area of one ring in m² (spherical excess, as in turf/area). */
function ringArea(ring: Position[]) {
  const count = ring.length;
  if (count < 3) {
    return 0;
  }
  let total = 0;
  for (let index = 0; index < count; index += 1) {
    const lower = ring[index];
    const middle = ring[(index + 1) % count];
    const upper = ring[(index + 2) % count];
    total += (rad(upper[0]) - rad(lower[0])) * Math.sin(rad(middle[1]));
  }
  return Math.abs((total * EARTH_RADIUS * EARTH_RADIUS) / 2);
}

function polygons(geometry: AreaGeometry): Position[][][] {
  return geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
}

/** Area in m²: outer rings minus holes. */
export function geometryArea(geometry: AreaGeometry) {
  return polygons(geometry).reduce(
    (sum, rings) => sum + Math.max(0, ringArea(rings[0] ?? []) - rings.slice(1).reduce((holes, ring) => holes + ringArea(ring), 0)),
    0
  );
}

/** Great-circle distance in metres. */
export function distance(a: Position, b: Position) {
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(h)));
}

function ringLength(ring: Position[]) {
  let total = 0;
  for (let index = 1; index < ring.length; index += 1) {
    total += distance(ring[index - 1], ring[index]);
  }
  return total;
}

/** Perimeter in metres (outer boundaries). */
export function geometryPerimeter(geometry: AreaGeometry) {
  return polygons(geometry).reduce((sum, rings) => sum + ringLength(rings[0] ?? []), 0);
}

export function vertexCount(geometry: AreaGeometry) {
  return polygons(geometry).reduce((sum, rings) => sum + rings.reduce((inner, ring) => inner + ring.length, 0), 0);
}

/** [[south, west], [north, east]] for fitting the map. */
export function geometryBounds(geometry: AreaGeometry): [[number, number], [number, number]] {
  let south = 90;
  let west = 180;
  let north = -90;
  let east = -180;
  for (const rings of polygons(geometry)) {
    for (const [lng, lat] of rings[0] ?? []) {
      south = Math.min(south, lat);
      north = Math.max(north, lat);
      west = Math.min(west, lng);
      east = Math.max(east, lng);
    }
  }
  return [
    [south, west],
    [north, east],
  ];
}

/** A closed ring from map clicks ([lat, lng] pairs), duplicates removed. */
export function ringFromPoints(points: Array<[number, number]>): Position[] {
  const ring: Position[] = [];
  for (const [lat, lng] of points) {
    const last = ring.at(-1);
    if (!last || last[0] !== lng || last[1] !== lat) {
      ring.push([lng, lat]);
    }
  }
  if (ring.length && (ring[0][0] !== ring.at(-1)?.[0] || ring[0][1] !== ring.at(-1)?.[1])) {
    ring.push([ring[0][0], ring[0][1]]);
  }
  return ring;
}

function cleanRing(raw: unknown): Position[] | null {
  if (!Array.isArray(raw)) {
    return null;
  }
  const ring: Position[] = [];
  for (const point of raw) {
    if (!Array.isArray(point) || point.length < 2) {
      return null;
    }
    const lng = Number(point[0]);
    const lat = Number(point[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 90) {
      return null;
    }
    const position: Position = [Number(lng.toFixed(7)), Number(lat.toFixed(7))];
    const last = ring.at(-1);
    if (!last || last[0] !== position[0] || last[1] !== position[1]) {
      ring.push(position);
    }
  }
  if (ring.length && (ring[0][0] !== ring.at(-1)?.[0] || ring[0][1] !== ring.at(-1)?.[1])) {
    ring.push([ring[0][0], ring[0][1]]);
  }
  return ring.length >= 4 ? ring : null;
}

/**
 * A valid Polygon/MultiPolygon in WGS84 with closed rings of at least three
 * corners, or an error. Holes that are not valid rings are dropped.
 */
export function normalizeGeometry(raw: unknown): { value: AreaGeometry } | { error: string } {
  const input = raw && typeof raw === "object" ? (raw as { type?: unknown; coordinates?: unknown }) : {};
  const parts: unknown[] =
    input.type === "Polygon" ? [input.coordinates] : input.type === "MultiPolygon" && Array.isArray(input.coordinates) ? input.coordinates : [];
  if (!parts.length) {
    return { error: "면(폴리곤) 도형만 구역으로 저장할 수 있습니다." };
  }
  const cleaned: Position[][][] = [];
  for (const part of parts) {
    if (!Array.isArray(part) || !part.length) {
      continue;
    }
    const outer = cleanRing(part[0]);
    if (!outer) {
      continue;
    }
    const holes = part.slice(1).map(cleanRing).filter((ring): ring is Position[] => ring !== null);
    cleaned.push([outer, ...holes]);
  }
  if (!cleaned.length) {
    return { error: "구역은 꼭짓점이 3개 이상이어야 합니다. 좌표를 확인해 주세요." };
  }
  const geometry: AreaGeometry = cleaned.length === 1 ? { type: "Polygon", coordinates: cleaned[0] } : { type: "MultiPolygon", coordinates: cleaned };
  if (vertexCount(geometry) > MAX_AREA_VERTICES) {
    return { error: `꼭짓점이 너무 많습니다(최대 ${MAX_AREA_VERTICES.toLocaleString("ko-KR")}개). 도형을 단순화해 주세요.` };
  }
  return { value: geometry };
}

function perpendicular(point: Position, start: Position, end: Position) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  if (dx === 0 && dy === 0) {
    return Math.hypot(point[0] - start[0], point[1] - start[1]);
  }
  const t = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(point[0] - (start[0] + t * dx), point[1] - (start[1] + t * dy));
}

function simplifyRing(ring: Position[], tolerance: number): Position[] {
  if (ring.length <= 5) {
    return ring;
  }
  const keep = new Array<boolean>(ring.length).fill(false);
  keep[0] = true;
  keep[ring.length - 1] = true;
  const stack: Array<[number, number]> = [[0, ring.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop() as [number, number];
    let farthest = -1;
    let max = tolerance;
    for (let index = first + 1; index < last; index += 1) {
      const gap = perpendicular(ring[index], ring[first], ring[last]);
      if (gap > max) {
        max = gap;
        farthest = index;
      }
    }
    if (farthest > 0) {
      keep[farthest] = true;
      stack.push([first, farthest], [farthest, last]);
    }
  }
  const out = ring.filter((_, index) => keep[index]);
  return out.length >= 4 ? out : ring;
}

/** Douglas–Peucker until the shape fits under `maxVertices`. */
export function simplifyGeometry(geometry: AreaGeometry, maxVertices = MAX_AREA_VERTICES): AreaGeometry {
  let tolerance = 0.000005;
  let current = geometry;
  while (vertexCount(current) > maxVertices && tolerance < 1) {
    const parts = polygons(geometry).map((rings) => rings.map((ring) => simplifyRing(ring, tolerance)));
    current = geometry.type === "Polygon" ? { type: "Polygon", coordinates: parts[0] } : { type: "MultiPolygon", coordinates: parts };
    tolerance *= 2;
  }
  return current;
}

/** "12,345㎡ · 1.23ha · 3,734평" (km² for very large areas). */
export function formatArea(squareMetres: number) {
  const m2 = Math.round(squareMetres);
  const parts = [`${m2.toLocaleString("ko-KR")}㎡`];
  if (squareMetres >= 1_000_000) {
    parts.push(`${(squareMetres / 1_000_000).toLocaleString("ko-KR", { maximumFractionDigits: 2 })}㎢`);
  }
  parts.push(`${(squareMetres / 10_000).toLocaleString("ko-KR", { maximumFractionDigits: 2 })}ha`);
  parts.push(`${Math.round(squareMetres / PYEONG).toLocaleString("ko-KR")}평`);
  return parts.join(" · ");
}

export function formatLength(metres: number) {
  return metres >= 1000
    ? `${(metres / 1000).toLocaleString("ko-KR", { maximumFractionDigits: 2 })}km`
    : `${Math.round(metres).toLocaleString("ko-KR")}m`;
}
