"use client";

import {
  MapProvider,
  MapStyle,
  MAP_PROVIDER_LABELS,
  MAP_STYLE_LABELS,
} from "../board-utils";
import { useBoard } from "../board-context";

export default function MapSettingsModal() {
  const {
    mapProvider,
    setMapProvider,
    mapStyle,
    setMapStyle,
    googleMapKey,
    setGoogleMapKey,
    vworldMapKey,
    setVworldMapKey,
    setMapSettingsOpen,
    activeMapTileNotice,
  } = useBoard();

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/40 p-4 backdrop-blur-sm"
      onClick={() => setMapSettingsOpen(false)}
    >
      <div
        className="tb-card my-10 w-full max-w-[440px] shadow-[var(--shadow-lg)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3.5">
          <h2 className="text-base font-semibold">지도 설정</h2>
          <button
            aria-label="닫기"
            type="button"
            onClick={() => setMapSettingsOpen(false)}
            className="tb-iconbtn h-8 w-8"
          >
            ×
          </button>
        </div>

        <div className="space-y-3 p-5">
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="tb-label">지도</span>
              <select
                value={mapProvider}
                onChange={(event) =>
                  setMapProvider(event.target.value as MapProvider)
                }
                className="tb-field"
              >
                {(
                  Object.entries(MAP_PROVIDER_LABELS) as Array<
                    [MapProvider, string]
                  >
                ).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="tb-label">형식</span>
              <select
                value={mapStyle}
                onChange={(event) =>
                  setMapStyle(event.target.value as MapStyle)
                }
                className="tb-field"
              >
                {(
                  Object.entries(MAP_STYLE_LABELS) as Array<
                    [MapStyle, string]
                  >
                ).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="tb-label">VWorld API 키</span>
            <input
              value={vworldMapKey}
              onChange={(event) => setVworldMapKey(event.target.value)}
              className="tb-field"
              placeholder="VWorld API 키"
            />
          </label>

          <label className="block">
            <span className="tb-label">Google 지도 API 키</span>
            <input
              value={googleMapKey}
              onChange={(event) => setGoogleMapKey(event.target.value)}
              className="tb-field"
              placeholder="Google 지도 API 키"
            />
          </label>

          {activeMapTileNotice ? (
            <p className="text-xs leading-5 text-[var(--text-faint)]">
              {activeMapTileNotice}
            </p>
          ) : null}

          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={() => setMapSettingsOpen(false)}
              className="tb-btn tb-btn-primary"
            >
              닫기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
