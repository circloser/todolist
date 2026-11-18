// 지도 장소: places pinned on the board map besides work items (사무실, 현장,
// 회의 장소…). Shared by the whole board; types come from a fixed list, and
// 기타 can carry a name of the team's own (예: 숙소).

export type PlaceKind = "office" | "site" | "meeting" | "partner" | "parking" | "etc";

export const PLACE_KINDS: Array<{ key: PlaceKind; label: string; icon: string; color: string }> = [
  { key: "office", label: "사무실", icon: "🏢", color: "#2563eb" },
  { key: "site", label: "현장·조사지", icon: "🌿", color: "#18786f" },
  { key: "meeting", label: "회의 장소", icon: "🤝", color: "#8a5b8f" },
  { key: "partner", label: "협력 기관", icon: "🏛", color: "#b66d12" },
  { key: "parking", label: "주차·집결지", icon: "🅿️", color: "#5d6b65" },
  { key: "etc", label: "기타", icon: "⭐", color: "#c44232" },
];

export type MapPlace = {
  id: number;
  name: string;
  kind: PlaceKind;
  /** The 유형 name typed for 기타 (empty for the preset types). */
  customKind: string;
  lat: number;
  lng: number;
  address: string;
  memo: string;
  createdByMemberId: number;
  createdByName: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
};

export type PlacesResponse = {
  places?: MapPlace[];
  place?: MapPlace | null;
  error?: string;
};

export type PlaceInput = Pick<MapPlace, "name" | "kind" | "customKind" | "lat" | "lng" | "address" | "memo">;

export function placeKindOf(place: Pick<MapPlace, "kind" | "customKind">) {
  const preset = PLACE_KINDS.find((kind) => kind.key === place.kind) ?? PLACE_KINDS[PLACE_KINDS.length - 1];
  return {
    ...preset,
    label: preset.key === "etc" && place.customKind.trim() ? place.customKind.trim() : preset.label,
  };
}

function cleanText(value: unknown, max: number) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function cleanMultiline(value: unknown, max: number) {
  return typeof value === "string" ? value.replace(/\r\n/g, "\n").trim().slice(0, max) : "";
}

function coordinate(value: unknown, limit: number) {
  const number = typeof value === "string" && value.trim() ? Number(value) : value;
  return typeof number === "number" && Number.isFinite(number) && Math.abs(number) <= limit
    ? Number(number.toFixed(6))
    : null;
}

export function normalizePlaceInput(raw: Record<string, unknown>): { value: PlaceInput } | { error: string } {
  const name = cleanText(raw.name, 80);
  if (!name) {
    return { error: "장소 이름을 입력해 주세요." };
  }
  const lat = coordinate(raw.lat, 90);
  const lng = coordinate(raw.lng, 180);
  if (lat === null || lng === null) {
    return { error: "지도에서 위치를 선택해 주세요." };
  }
  const kind = PLACE_KINDS.some((entry) => entry.key === raw.kind) ? (raw.kind as PlaceKind) : "etc";
  return {
    value: {
      name,
      kind,
      customKind: kind === "etc" ? cleanText(raw.customKind, 20) : "",
      lat,
      lng,
      address: cleanText(raw.address, 200),
      memo: cleanMultiline(raw.memo, 1000),
    },
  };
}

/** The 유형 names in use, presets first, for filters and suggestions. */
export function placeKindsInUse(places: Array<Pick<MapPlace, "kind" | "customKind">>) {
  const counts = new Map<string, { label: string; icon: string; color: string; count: number }>();
  for (const place of places) {
    const kind = placeKindOf(place);
    const entry = counts.get(kind.label) ?? { label: kind.label, icon: kind.icon, color: kind.color, count: 0 };
    entry.count += 1;
    counts.set(kind.label, entry);
  }
  const presetOrder = PLACE_KINDS.map((kind) => kind.label);
  return [...counts.values()].sort(
    (first, second) =>
      (presetOrder.indexOf(first.label) + 1 || 99) - (presetOrder.indexOf(second.label) + 1 || 99) ||
      first.label.localeCompare(second.label, "ko-KR")
  );
}
