// Map tiles, preferences, place-name search and outbound map links for the
// board map. Kept free of React so the map view and tests can share it.

import { WETLAND_PRESETS } from "./wetlands";

export type MapProvider = "osm" | "google" | "vworld";
export type MapStyle = "road" | "satellite" | "hybrid";

export type MapSearchResult = {
  label: string;
  lat: number;
  lng: number;
  source: string;
};

export const MAP_PROVIDER_LABELS: Record<MapProvider, string> = {
  osm: "Leaflet / OSM",
  google: "Google",
  vworld: "VWorld",
};

export const MAP_STYLE_LABELS: Record<MapStyle, string> = {
  road: "일반",
  satellite: "위성",
  hybrid: "하이브리드",
};

/** Default view: all of South Korea. */
export const KOREA_CENTER: [number, number] = [36.2, 127.9];
export const KOREA_ZOOM = 7;

export function mapTileConfig(provider: MapProvider, style: MapStyle, keys: { google: string; vworld: string }) {
  if (provider === "vworld" && keys.vworld.trim()) {
    const layer = style === "satellite" ? "Satellite" : style === "hybrid" ? "Hybrid" : "Base";
    return {
      url: `https://api.vworld.kr/req/wmts/1.0.0/${encodeURIComponent(keys.vworld.trim())}/${layer}/{z}/{y}/{x}.png`,
      attribution: "VWorld",
      maxZoom: 19,
      notice: "",
    };
  }

  if (provider === "google") {
    const layer = style === "satellite" ? "s" : style === "hybrid" ? "y" : "m";
    const key = keys.google.trim() ? `&key=${encodeURIComponent(keys.google.trim())}` : "";
    return {
      url: `https://mt{s}.google.com/vt/lyrs=${layer}&x={x}&y={y}&z={z}${key}`,
      attribution: "Google",
      maxZoom: 20,
      subdomains: ["0", "1", "2", "3"],
      notice: keys.google.trim() ? "" : "Google 지도는 공식 사용을 위해 API 키 설정을 권장합니다.",
    };
  }

  const notice =
    provider === "vworld" && !keys.vworld.trim()
      ? "VWorld 지도를 보려면 VWorld API 키를 입력해 주세요. 키가 없으면 기본 지도로 표시됩니다."
      : "";
  const imagery = style === "satellite" || style === "hybrid";
  return {
    url: imagery
      ? "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
      : "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: imagery
      ? "Tiles &copy; Esri"
      : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
    notice,
  };
}

/** Place names and labels for hybrid imagery (Esri reference layer). */
export function hybridLabelsUrl(provider: MapProvider, style: MapStyle, keys: { vworld: string }) {
  if (style !== "hybrid" || provider === "google" || (provider === "vworld" && keys.vworld.trim())) {
    return null;
  }
  return "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";
}

const PREFS_KEY = "team-progress-map";

export function readMapPrefs() {
  const fallback = { provider: "osm" as MapProvider, style: "road" as MapStyle, googleKey: "", vworldKey: "" };
  if (typeof window === "undefined") {
    return fallback;
  }
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) {
      return fallback;
    }
    const parsed = JSON.parse(raw) as { provider?: MapProvider; style?: MapStyle; googleKey?: string; vworldKey?: string };
    return {
      provider: parsed.provider && parsed.provider in MAP_PROVIDER_LABELS ? parsed.provider : fallback.provider,
      style: parsed.style && parsed.style in MAP_STYLE_LABELS ? parsed.style : fallback.style,
      googleKey: parsed.googleKey ?? "",
      vworldKey: parsed.vworldKey ?? "",
    };
  } catch {
    return fallback;
  }
}

export function saveMapPrefs(prefs: { provider: MapProvider; style: MapStyle; googleKey: string; vworldKey: string }) {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Not remembered on this browser; fine.
  }
}

/** "35.54120, 128.49210" */
export function formatCoordinates(lat: number, lng: number) {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

/** Directions and "view on map" links for the common map services. */
export function directionLinks(name: string, lat: number, lng: number) {
  const label = encodeURIComponent((name || "목적지").replace(/,/g, " "));
  return {
    kakao: `https://map.kakao.com/link/to/${label},${lat},${lng}`,
    kakaoView: `https://map.kakao.com/link/map/${label},${lat},${lng}`,
    google: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
  };
}

/** Built-in wetland names that match the query (no network). */
export function presetMatches(query: string, limit = 5): MapSearchResult[] {
  const needle = query.trim().toLocaleLowerCase("ko-KR");
  if (!needle) {
    return [];
  }
  return WETLAND_PRESETS.filter((preset) => preset.name.toLocaleLowerCase("ko-KR").includes(needle))
    .slice(0, limit)
    .map((preset) => ({ label: preset.name, lat: preset.lat, lng: preset.lng, source: "기본 목록" }));
}

/** Place-name search: built-in wetlands, then VWorld (with a key) or OSM Nominatim. */
export async function searchPlaceNames(query: string, vworldKey: string): Promise<MapSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }
  const local = presetMatches(trimmed);
  let remote: MapSearchResult[] = [];

  try {
    remote = await searchOnline(trimmed, vworldKey);
  } catch {
    // Offline or blocked: the built-in names still help.
    if (!local.length) {
      throw new Error("지명 검색 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
  }

  const unique = new Map<string, MapSearchResult>();
  for (const result of [...local, ...remote]) {
    unique.set(`${result.lat.toFixed(5)},${result.lng.toFixed(5)}`, result);
  }
  return [...unique.values()].slice(0, 8);
}

async function searchOnline(trimmed: string, vworldKey: string): Promise<MapSearchResult[]> {
  let remote: MapSearchResult[] = [];
  if (vworldKey.trim()) {
    type VWorldSearchItem = { title?: string; address?: { parcel?: string; road?: string }; point?: { x?: string; y?: string } };
    const params = new URLSearchParams({
      service: "search",
      request: "search",
      version: "2.0",
      crs: "EPSG:4326",
      size: "6",
      page: "1",
      type: "PLACE",
      format: "json",
      key: vworldKey.trim(),
      query: trimmed,
    });
    const response = await fetch(`https://api.vworld.kr/req/search?${params.toString()}`);
    const data = (await response.json()) as { response?: { result?: { items?: VWorldSearchItem[] } } };
    remote =
      data.response?.result?.items
        ?.map((item) => {
          const lat = Number(item.point?.y);
          const lng = Number(item.point?.x);
          return Number.isFinite(lat) && Number.isFinite(lng)
            ? { label: item.title ?? item.address?.road ?? item.address?.parcel ?? trimmed, lat, lng, source: "VWorld" }
            : null;
        })
        .filter((item): item is MapSearchResult => item !== null) ?? [];
  } else {
    type NominatimItem = { display_name?: string; lat?: string; lon?: string };
    const params = new URLSearchParams({
      format: "jsonv2",
      q: trimmed,
      limit: "6",
      countrycodes: "kr",
      "accept-language": "ko",
    });
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`);
    const data = (await response.json()) as NominatimItem[];
    remote = data
      .map((item) => {
        const lat = Number(item.lat);
        const lng = Number(item.lon);
        return Number.isFinite(lat) && Number.isFinite(lng)
          ? { label: item.display_name ?? trimmed, lat, lng, source: "OSM" }
          : null;
      })
      .filter((item): item is MapSearchResult => item !== null);
  }
  return remote;
}

/** First part of a geocoder label ("우포늪, 창녕군, …" → "우포늪"). */
export function shortPlaceName(label: string) {
  return label.split(",")[0].trim().slice(0, 80);
}
