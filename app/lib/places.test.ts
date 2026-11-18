import { describe, expect, it } from "vitest";
import { normalizePlaceInput, placeKindOf, placeKindsInUse } from "./places";

describe("지도 장소", () => {
  it("cleans input and keeps a custom 유형 only for 기타", () => {
    expect(
      normalizePlaceInput({
        name: "  본청 사무실 ",
        kind: "office",
        customKind: "무시됨",
        lat: "35.5",
        lng: 128.4123456789,
        address: " 창녕군  창녕읍 ",
      })
    ).toEqual({
      value: {
        name: "본청 사무실",
        kind: "office",
        customKind: "",
        lat: 35.5,
        lng: 128.412346,
        address: "창녕군 창녕읍",
        memo: "",
      },
    });
    expect(normalizePlaceInput({ name: "숙소", kind: "lodging", customKind: "숙소", lat: 35, lng: 128 })).toMatchObject({
      value: { kind: "etc", customKind: "숙소" },
    });
  });

  it("rejects a missing name or position", () => {
    expect(normalizePlaceInput({ lat: 35, lng: 128 })).toEqual({ error: "장소 이름을 입력해 주세요." });
    expect(normalizePlaceInput({ name: "x", lat: 95, lng: 128 })).toEqual({ error: "지도에서 위치를 선택해 주세요." });
    expect(normalizePlaceInput({ name: "x", lat: 35 })).toHaveProperty("error");
    expect(normalizePlaceInput({ name: "x", lat: "", lng: 128 })).toHaveProperty("error");
  });

  it("labels and groups 유형", () => {
    expect(placeKindOf({ kind: "etc", customKind: "숙소" })).toMatchObject({ label: "숙소", icon: "⭐" });
    expect(placeKindOf({ kind: "meeting", customKind: "" })).toMatchObject({ label: "회의 장소", icon: "🤝" });
    expect(
      placeKindsInUse([
        { kind: "etc", customKind: "숙소" },
        { kind: "site", customKind: "" },
        { kind: "office", customKind: "" },
        { kind: "site", customKind: "" },
        { kind: "etc", customKind: "" },
      ]).map((entry) => `${entry.label} ${entry.count}`)
    ).toEqual(["사무실 1", "현장·조사지 2", "기타 1", "숙소 1"]);
  });
});
