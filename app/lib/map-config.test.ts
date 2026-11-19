import { describe, expect, it } from "vitest";
import { directionLinks, formatCoordinates, hybridLabelsUrl, mapTileConfig, presetMatches, shortPlaceName } from "./map-config";

describe("map config", () => {
  it("builds directions links for 카카오맵 and Google", () => {
    const links = directionLinks("우포늪, 생태관", 35.5512, 128.4157);
    expect(links.kakao).toBe("https://map.kakao.com/link/to/%EC%9A%B0%ED%8F%AC%EB%8A%AA%20%20%EC%83%9D%ED%83%9C%EA%B4%80,35.5512,128.4157");
    expect(links.google).toBe("https://www.google.com/maps/dir/?api=1&destination=35.5512,128.4157");
    expect(directionLinks("", 35, 128).kakaoView).toContain("/link/map/%EB%AA%A9%EC%A0%81%EC%A7%80,35,128");
  });

  it("formats coordinates and short names", () => {
    expect(formatCoordinates(35.54123456, 128.4)).toBe("35.54123, 128.40000");
    expect(shortPlaceName("우포늪, 유어면, 창녕군, 경상남도")).toBe("우포늪");
  });

  it("finds built-in wetland names offline", () => {
    const results = presetMatches("우포");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toMatchObject({ source: "기본 목록" });
    expect(presetMatches("  ")).toEqual([]);
  });

  it("uses imagery plus a label layer for hybrid without a provider key", () => {
    expect(mapTileConfig("osm", "hybrid", { google: "", vworld: "" }).url).toContain("World_Imagery");
    expect(hybridLabelsUrl("osm", "hybrid", { vworld: "" })).toContain("World_Boundaries_and_Places");
    expect(hybridLabelsUrl("osm", "road", { vworld: "" })).toBeNull();
    expect(hybridLabelsUrl("google", "hybrid", { vworld: "" })).toBeNull();
  });
});
