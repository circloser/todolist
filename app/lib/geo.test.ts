import { describe, expect, it } from "vitest";
import {
  formatArea,
  formatLength,
  geometryArea,
  geometryBounds,
  geometryPerimeter,
  normalizeGeometry,
  ringFromPoints,
  simplifyGeometry,
  vertexCount,
  type AreaGeometry,
} from "./geo";

// A 100 m × 100 m square near 우포늪 (35.55°N): 1 m ≈ 1/111,195° lat.
const dLat = 100 / 111195;
const dLng = 100 / (111195 * Math.cos((35.55 * Math.PI) / 180));
const square: AreaGeometry = {
  type: "Polygon",
  coordinates: [
    [
      [128.4, 35.55],
      [128.4 + dLng, 35.55],
      [128.4 + dLng, 35.55 + dLat],
      [128.4, 35.55 + dLat],
      [128.4, 35.55],
    ],
  ],
};

describe("구역 geometry", () => {
  it("measures a 1 ha square", () => {
    expect(geometryArea(square)).toBeGreaterThan(9950);
    expect(geometryArea(square)).toBeLessThan(10050);
    expect(geometryPerimeter(square)).toBeGreaterThan(399);
    expect(geometryPerimeter(square)).toBeLessThan(401);
  });

  it("subtracts holes and adds multipolygon parts", () => {
    const [outer] = (square as { coordinates: [number, number][][] }).coordinates;
    const hole = outer.map(([lng, lat]) => [128.4 + (lng - 128.4) / 2 + dLng / 4, 35.55 + (lat - 35.55) / 2 + dLat / 4] as [number, number]);
    const withHole: AreaGeometry = { type: "Polygon", coordinates: [outer, hole] };
    expect(Math.round(geometryArea(withHole) / 100)).toBe(75);
    const two: AreaGeometry = { type: "MultiPolygon", coordinates: [[outer], [outer.map(([lng, lat]) => [lng + 0.01, lat] as [number, number])]] };
    expect(Math.round(geometryArea(two) / 1000)).toBe(20);
  });

  it("closes clicked rings and drops repeated clicks", () => {
    const ring = ringFromPoints([
      [35, 128],
      [35, 128.001],
      [35, 128.001],
      [35.001, 128.001],
    ]);
    expect(ring).toEqual([
      [128, 35],
      [128.001, 35],
      [128.001, 35.001],
      [128, 35],
    ]);
  });

  it("validates geometry", () => {
    const normalized = normalizeGeometry(square);
    expect("value" in normalized && Math.abs(geometryArea(normalized.value) - geometryArea(square))).toBeLessThan(1);
    expect(normalizeGeometry({ type: "Point", coordinates: [1, 2] })).toHaveProperty("error");
    expect(normalizeGeometry({ type: "Polygon", coordinates: [[[0, 0], [1, 1], [0, 0]]] })).toHaveProperty("error");
    expect(normalizeGeometry({ type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 91], [0, 0]]] })).toHaveProperty("error");
    const open = normalizeGeometry({ type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1]]] });
    expect(open).toMatchObject({ value: { coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } });
  });

  it("simplifies dense shapes under the vertex limit", () => {
    const dense: AreaGeometry = {
      type: "Polygon",
      coordinates: [
        [
          ...Array.from({ length: 3000 }, (_, index) => {
            const angle = (index / 3000) * Math.PI * 2;
            return [128 + Math.cos(angle) * 0.01, 35 + Math.sin(angle) * 0.01] as [number, number];
          }),
          [128.01, 35],
        ],
      ],
    };
    const simple = simplifyGeometry(dense, 500);
    expect(vertexCount(simple)).toBeLessThanOrEqual(500);
    expect(Math.abs(geometryArea(simple) - geometryArea(dense)) / geometryArea(dense)).toBeLessThan(0.01);
  });

  it("formats areas, lengths and bounds", () => {
    expect(formatArea(10000)).toBe("10,000㎡ · 1ha · 3,025평");
    expect(formatArea(2_500_000)).toContain("2.5㎢");
    expect(formatLength(950.4)).toBe("950m");
    expect(formatLength(1234)).toBe("1.23km");
    expect(geometryBounds(square)[0]).toEqual([35.55, 128.4]);
  });
});
