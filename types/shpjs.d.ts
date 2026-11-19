// Minimal typings for the parts of shpjs the map uses.
declare module "shpjs" {
  type Geometry = { type: string; coordinates: unknown; bbox?: number[] };
  export function parseShp(shp: ArrayBuffer | ArrayBufferView | DataView, prj?: string | false): Geometry[];
  export function parseDbf(dbf: ArrayBuffer | ArrayBufferView | DataView, cpg?: string): Array<Record<string, unknown>>;
}
