// 구역: polygons drawn on the board map or imported from Shapefiles.

import { geometryArea, geometryPerimeter, normalizeGeometry, type AreaGeometry } from "./geo";

export const AREA_COLORS = ["#18786f", "#2563eb", "#c44232", "#b66d12", "#8a5b8f", "#6f7b2d", "#0e7490", "#5d6b65"];
export const MAX_AREAS_PER_IMPORT = 300;
/** Stored GeoJSON per 구역 (D1 rows stay well under their size limit). */
export const MAX_GEOMETRY_BYTES = 600_000;

export type MapArea = {
  id: number;
  name: string;
  color: string;
  memo: string;
  geometry: AreaGeometry;
  areaM2: number;
  perimeterM: number;
  source: "draw" | "shp";
  createdByMemberId: number;
  createdByName: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
};

export type AreasResponse = {
  areas?: MapArea[];
  area?: MapArea | null;
  created?: number;
  error?: string;
};

export type AreaInput = {
  name: string;
  color: string;
  memo: string;
  geometry: AreaGeometry;
  areaM2: number;
  perimeterM: number;
  source: "draw" | "shp";
};

function cleanText(value: unknown, max: number) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

export function normalizeAreaInput(raw: Record<string, unknown>): { value: AreaInput } | { error: string } {
  const name = cleanText(raw.name, 80);
  if (!name) {
    return { error: "구역 이름을 입력해 주세요." };
  }
  const geometry = normalizeGeometry(raw.geometry);
  if ("error" in geometry) {
    return geometry;
  }
  if (JSON.stringify(geometry.value).length > MAX_GEOMETRY_BYTES) {
    return { error: "도형이 너무 큽니다. 꼭짓점을 줄여 주세요." };
  }
  const color = typeof raw.color === "string" && /^#[0-9a-fA-F]{6}$/.test(raw.color) ? raw.color.toLowerCase() : AREA_COLORS[0];
  return {
    value: {
      name,
      color,
      memo: typeof raw.memo === "string" ? raw.memo.replace(/\r\n/g, "\n").trim().slice(0, 1000) : "",
      geometry: geometry.value,
      areaM2: Math.round(geometryArea(geometry.value) * 100) / 100,
      perimeterM: Math.round(geometryPerimeter(geometry.value) * 100) / 100,
      source: raw.source === "shp" ? "shp" : "draw",
    },
  };
}
