// SHP 올리기: turn Shapefiles into 구역 polygons in the browser. Accepts a
// .zip or the separate .shp/.dbf/.prj/.cpg files (several layers at once).
// Coordinates are converted to WGS84 with the .prj (e.g. Korean TM such as
// EPSG:5186/5179); attribute text is read as the .cpg says, else UTF-8 with an
// EUC-KR fallback, which many Korean Shapefiles use.

import { iter } from "but-unzip";
import { parseDbf, parseShp } from "shpjs";

import { MAX_AREA_VERTICES, normalizeGeometry, simplifyGeometry, vertexCount, type AreaGeometry } from "./geo";

export type ImportedFeature = {
  layer: string;
  properties: Record<string, string>;
  geometry: AreaGeometry;
};

export type ShapefileImport = {
  features: ImportedFeature[];
  /** Attribute names, best name-like candidates first. */
  fields: string[];
  skipped: number;
  simplified: number;
  layers: string[];
};

type Parts = { shp?: Uint8Array; dbf?: Uint8Array; prj?: string; cpg?: string };

const NAME_HINTS = /^(name|nm|명칭|이름|지구명|구역명|사업명|label|title)/i;

function splitName(filename: string) {
  const base = filename.split(/[\\/]/).pop() ?? filename;
  const dot = base.lastIndexOf(".");
  return dot < 0 ? { stem: base, ext: "" } : { stem: base.slice(0, dot), ext: base.slice(dot + 1).toLowerCase() };
}

async function collect(files: File[]) {
  const groups = new Map<string, Parts>();
  const text = new TextDecoder();
  const add = (filename: string, bytes: Uint8Array) => {
    if (filename.includes("__MACOSX")) {
      return;
    }
    const { stem, ext } = splitName(filename);
    const key = stem.toLowerCase();
    const parts = groups.get(key) ?? {};
    if (ext === "shp") parts.shp = bytes;
    else if (ext === "dbf") parts.dbf = bytes;
    else if (ext === "prj") parts.prj = text.decode(bytes);
    else if (ext === "cpg") parts.cpg = text.decode(bytes).trim();
    else return;
    groups.set(key, parts);
  };
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (splitName(file.name).ext === "zip") {
      for (const entry of iter(bytes)) {
        add(entry.filename, await entry.read());
      }
    } else {
      add(file.name, bytes);
    }
  }
  return groups;
}

function readAttributes(dbf: Uint8Array, cpg?: string) {
  const view = new DataView(dbf.buffer, dbf.byteOffset, dbf.byteLength);
  if (cpg) {
    return parseDbf(view, cpg);
  }
  const utf8 = parseDbf(view, "UTF-8");
  const broken = utf8.some((row) => Object.values(row).some((value) => typeof value === "string" && value.includes("�")));
  return broken ? parseDbf(view, "EUC-KR") : utf8;
}

function looksProjected(geometries: Array<{ coordinates: unknown }>) {
  const first = JSON.stringify(geometries[0]?.coordinates ?? []).match(/-?\d+(\.\d+)?/);
  return first ? Math.abs(Number(first[0])) > 180 : false;
}

export async function readShapefiles(files: File[]): Promise<ShapefileImport> {
  const groups = await collect(files);
  const layers = [...groups.entries()].filter(([, parts]) => parts.shp);
  if (!layers.length) {
    throw new Error(".shp 파일을 찾지 못했습니다. .zip 하나 또는 .shp·.dbf·.prj 파일을 함께 올려 주세요.");
  }
  const features: ImportedFeature[] = [];
  const fieldCounts = new Map<string, number>();
  let skipped = 0;
  let simplified = 0;

  for (const [layer, parts] of layers) {
    const shp = parts.shp as Uint8Array;
    const geometries = parseShp(new DataView(shp.buffer, shp.byteOffset, shp.byteLength), parts.prj || false);
    if (!parts.prj && looksProjected(geometries)) {
      throw new Error(`'${layer}'에 좌표계(.prj) 파일이 없어 위치를 알 수 없습니다. .prj 파일도 함께 올려 주세요.`);
    }
    const rows = parts.dbf ? readAttributes(parts.dbf, parts.cpg) : [];
    geometries.forEach((geometry, index) => {
      if (!geometry || (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon")) {
        skipped += 1;
        return;
      }
      let normalized = normalizeGeometry(geometry);
      if ("error" in normalized && vertexCount(geometry as AreaGeometry) > MAX_AREA_VERTICES) {
        normalized = normalizeGeometry(simplifyGeometry(geometry as AreaGeometry));
        simplified += 1;
      }
      if ("error" in normalized) {
        skipped += 1;
        return;
      }
      const properties: Record<string, string> = {};
      for (const [key, value] of Object.entries(rows[index] ?? {})) {
        const textValue = value === null || value === undefined ? "" : String(value).trim();
        properties[key] = textValue;
        if (textValue) {
          fieldCounts.set(key, (fieldCounts.get(key) ?? 0) + 1);
        }
      }
      features.push({ layer, properties, geometry: normalized.value });
    });
  }

  const fields = [...fieldCounts.keys()].sort(
    (first, second) => Number(NAME_HINTS.test(second)) - Number(NAME_HINTS.test(first)) || (fieldCounts.get(second) ?? 0) - (fieldCounts.get(first) ?? 0)
  );
  return { features, fields, skipped, simplified, layers: layers.map(([layer]) => layer) };
}

/** Name for an imported polygon from the chosen attribute, else "레이어 n". */
export function importedName(feature: ImportedFeature, field: string, index: number) {
  const value = field ? feature.properties[field]?.trim() : "";
  return (value || `${feature.layer} ${index + 1}`).slice(0, 80);
}
