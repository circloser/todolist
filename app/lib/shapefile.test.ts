import { describe, expect, it } from "vitest";
import { zip as makeZip } from "./__fixtures__/zip";

import { geometryArea } from "./geo";
import { importedName, readShapefiles } from "./shapefile";

// --- tiny Shapefile writer (polygon type 5, one ring per record) -----------

function shpFile(rings: Array<Array<[number, number]>>) {
  const records = rings.map((ring) => {
    const content = new DataView(new ArrayBuffer(44 + 4 + ring.length * 16));
    content.setInt32(0, 5, true);
    const xs = ring.map((p) => p[0]);
    const ys = ring.map((p) => p[1]);
    [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].forEach((v, i) => content.setFloat64(4 + i * 8, v, true));
    content.setInt32(36, 1, true);
    content.setInt32(40, ring.length, true);
    content.setInt32(44, 0, true);
    ring.forEach(([x, y], i) => {
      content.setFloat64(48 + i * 16, x, true);
      content.setFloat64(56 + i * 16, y, true);
    });
    return new Uint8Array(content.buffer);
  });
  const length = 100 + records.reduce((sum, r) => sum + 8 + r.length, 0);
  const out = new DataView(new ArrayBuffer(length));
  out.setInt32(0, 9994);
  out.setInt32(24, length / 2);
  out.setInt32(28, 1000, true);
  out.setInt32(32, 5, true);
  let offset = 100;
  records.forEach((record, index) => {
    out.setInt32(offset, index + 1);
    out.setInt32(offset + 4, record.length / 2);
    new Uint8Array(out.buffer).set(record, offset + 8);
    offset += 8 + record.length;
  });
  return new Uint8Array(out.buffer);
}

function dbfFile(fieldName: Uint8Array, values: Uint8Array[]) {
  const width = 40;
  const headerLength = 32 + 32 + 1;
  const recordLength = 1 + width;
  const out = new Uint8Array(headerLength + values.length * recordLength + 1);
  const view = new DataView(out.buffer);
  out[0] = 3;
  view.setInt32(4, values.length, true);
  view.setInt16(8, headerLength, true);
  view.setInt16(10, recordLength, true);
  out.set(fieldName.slice(0, 10), 32);
  out[32 + 11] = "C".charCodeAt(0);
  out[32 + 16] = width;
  out[64] = 0x0d;
  values.forEach((value, index) => {
    const start = headerLength + index * recordLength;
    out[start] = 0x20;
    out.fill(0x20, start + 1, start + 1 + width);
    out.set(value.slice(0, width), start + 1);
  });
  out[out.length - 1] = 0x1a;
  return out;
}

const hex = (value: string) => new Uint8Array(value.match(/../g)!.map((byte) => parseInt(byte, 16)));
const EPSG_5186 =
  'PROJCS["Korea_2000_Korea_Central_Belt_2010",GEOGCS["GCS_Korea_2000",DATUM["D_Korea_2000",SPHEROID["GRS_1980",6378137.0,298.257222101]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",200000.0],PARAMETER["False_Northing",600000.0],PARAMETER["Central_Meridian",127.0],PARAMETER["Scale_Factor",1.0],PARAMETER["Latitude_Of_Origin",38.0],UNIT["Meter",1.0]]';

// A 100 m square in TM metres around 우포늪 (EPSG:5186).
const x0 = 326946.5;
const y0 = 329016.8;
const tmSquare: Array<[number, number]> = [
  [x0, y0],
  [x0, y0 + 100],
  [x0 + 100, y0 + 100],
  [x0 + 100, y0],
  [x0, y0],
];

const file = (name: string, bytes: Uint8Array) => new File([bytes.slice().buffer as ArrayBuffer], name);

describe("SHP 올리기", () => {
  it("reads a zip in Korean TM coordinates with EUC-KR names", async () => {
    const zip = makeZip({
      "wetland.shp": shpFile([tmSquare]),
      "wetland.dbf": dbfFile(hex("b8edc4aa"), [hex("bfecc6f7b4cb20bdc0c1f6")]),
      "wetland.prj": new TextEncoder().encode(EPSG_5186),
    });
    const result = await readShapefiles([file("wetland.zip", zip)]);
    expect(result.features).toHaveLength(1);
    expect(result.fields[0]).toBe("명칭");
    expect(importedName(result.features[0], "명칭", 0)).toBe("우포늪 습지");
    const [lng, lat] = (result.features[0].geometry as { coordinates: number[][][] }).coordinates[0][0];
    expect(lng).toBeCloseTo(128.4, 3);
    expect(lat).toBeCloseTo(35.55, 3);
    expect(Math.round(geometryArea(result.features[0].geometry) / 100)).toBe(100);
  });

  it("reads separate files and refuses projected data without a .prj", async () => {
    const separate = await readShapefiles([
      file("a.shp", shpFile([tmSquare])),
      file("a.prj", new TextEncoder().encode(EPSG_5186)),
    ]);
    expect(separate.features).toHaveLength(1);
    expect(importedName(separate.features[0], "", 0)).toBe("a 1");
    await expect(readShapefiles([file("b.shp", shpFile([tmSquare]))])).rejects.toThrow(/좌표계/);
    await expect(readShapefiles([file("c.dbf", new Uint8Array(10))])).rejects.toThrow(/\.shp/);
  });
});
