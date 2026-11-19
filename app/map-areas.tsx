"use client";

import { useEffect, useMemo, useState } from "react";

import { AREA_COLORS, MAX_AREAS_PER_IMPORT } from "./lib/areas";
import { formatArea, formatLength, geometryArea, geometryPerimeter, vertexCount, type AreaGeometry } from "./lib/geo";
import { importedName, readShapefiles, type ShapefileImport } from "./lib/shapefile";

// 구역 UI: the editor dialog and the SHP import dialog. The map layers live in
// map-view.tsx.

export type AreaDraft = {
  id: number | null;
  name: string;
  color: string;
  memo: string;
  geometry: AreaGeometry;
  createdByMemberId: number | null;
  createdByName: string;
};

function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
}

function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="구역 색">
      {AREA_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={value === color}
          aria-label={color}
          onClick={() => onChange(color)}
          className="h-7 w-7 rounded-full border-2"
          style={{ background: color, borderColor: value === color ? "var(--text)" : "transparent", boxShadow: "0 0 0 2px #fff inset" }}
        />
      ))}
    </div>
  );
}

function Shell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="tb-card my-8 w-full max-w-[480px] !bg-[var(--surface)] shadow-[var(--shadow-lg)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3.5">
          <h2 className="text-base font-semibold">{title}</h2>
          <button type="button" onClick={onClose} className="tb-iconbtn h-8 w-8" aria-label="닫기">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function AreaEditor({
  draft,
  editable,
  saving,
  error,
  onChange,
  onSave,
  onDelete,
  onClose,
}: {
  draft: AreaDraft;
  editable: boolean;
  saving: boolean;
  error: string;
  onChange: (draft: AreaDraft) => void;
  onSave: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  useEscape(onClose);
  const area = geometryArea(draft.geometry);
  return (
    <Shell title={draft.id ? (editable ? "구역 수정" : "구역 보기") : "새 구역"} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
      >
        <div className="mx-5 mt-4 rounded-[var(--radius)] bg-[var(--surface-2)] px-3 py-2 text-sm">
          <div className="font-semibold">면적 {formatArea(area)}</div>
          <div className="text-xs text-[var(--text-muted)]">
            둘레 {formatLength(geometryPerimeter(draft.geometry))} · 꼭짓점 {vertexCount(draft.geometry).toLocaleString("ko-KR")}개
          </div>
        </div>
        <fieldset disabled={!editable || saving} className="space-y-3 px-5 py-4">
          <label className="block">
            <span className="tb-label">이름</span>
            <input
              autoFocus
              className="tb-field"
              value={draft.name}
              maxLength={80}
              placeholder="예: 1차 복원 구역, ○○습지 보호구역"
              onChange={(event) => onChange({ ...draft, name: event.target.value })}
            />
          </label>
          <div>
            <div className="tb-label">색</div>
            <ColorPicker value={draft.color} onChange={(color) => onChange({ ...draft, color })} />
          </div>
          <label className="block">
            <span className="tb-label">메모</span>
            <textarea
              className="tb-field min-h-[64px]"
              value={draft.memo}
              maxLength={1000}
              placeholder="사업명, 지번, 관리 방법 등"
              onChange={(event) => onChange({ ...draft, memo: event.target.value })}
            />
          </label>
        </fieldset>
        {draft.id ? (
          <div className="px-5 pb-2 text-[11px] text-[var(--text-faint)]">
            등록: {draft.createdByName}
            {!editable ? " · 등록한 사람 또는 부서장만 수정할 수 있습니다" : ""}
          </div>
        ) : null}
        {error ? (
          <div role="alert" className="mx-5 mb-2 rounded-[var(--radius)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">
            {error}
          </div>
        ) : null}
        <div className="flex items-center gap-2 border-t border-[var(--border)] px-5 py-3">
          {editable ? (
            <button type="submit" className="tb-btn tb-btn-primary" disabled={saving}>
              {saving ? "저장 중…" : "저장"}
            </button>
          ) : null}
          {draft.id && editable ? (
            <button type="button" onClick={onDelete} disabled={saving} className="tb-btn ml-auto text-[var(--danger)]">
              삭제
            </button>
          ) : null}
          <button type="button" onClick={onClose} className={`tb-btn ${draft.id && editable ? "" : "ml-auto"}`}>
            닫기
          </button>
        </div>
      </form>
    </Shell>
  );
}

export type ImportedArea = { name: string; color: string; memo: string; geometry: AreaGeometry; source: "shp" };

export function ShpImportDialog({
  files,
  saving,
  error,
  onPreview,
  onImport,
  onClose,
}: {
  files: File[];
  saving: boolean;
  error: string;
  onPreview: (geometries: AreaGeometry[]) => void;
  onImport: (areas: ImportedArea[]) => void;
  onClose: () => void;
}) {
  useEscape(onClose);
  const [result, setResult] = useState<ShapefileImport | null>(null);
  const [readError, setReadError] = useState("");
  const [field, setField] = useState("");
  const [color, setColor] = useState(AREA_COLORS[1]);

  useEffect(() => {
    let cancelled = false;
    void readShapefiles(files)
      .then((parsed) => {
        if (cancelled) {
          return;
        }
        setResult(parsed);
        setField(parsed.fields[0] ?? "");
        onPreview(parsed.features.map((feature) => feature.geometry));
      })
      .catch((parseError: unknown) => {
        if (!cancelled) {
          setReadError(parseError instanceof Error ? parseError.message : "SHP 파일을 읽지 못했습니다.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [files, onPreview]);

  const total = useMemo(() => (result ? result.features.reduce((sum, feature) => sum + geometryArea(feature.geometry), 0) : 0), [result]);
  const tooMany = (result?.features.length ?? 0) > MAX_AREAS_PER_IMPORT;

  return (
    <Shell title="SHP에서 구역 가져오기" onClose={onClose}>
      <div className="space-y-3 px-5 py-4 text-sm" data-testid="shp-import">
        <div className="text-xs text-[var(--text-muted)]">{files.map((file) => file.name).join(", ")}</div>
        {readError ? (
          <div role="alert" className="rounded-[var(--radius)] bg-[var(--danger-soft)] px-3 py-2 text-[var(--danger)]">
            {readError}
          </div>
        ) : !result ? (
          <div className="py-6 text-center text-[var(--text-muted)]">파일을 읽는 중…</div>
        ) : (
          <>
            <div className="rounded-[var(--radius)] bg-[var(--surface-2)] px-3 py-2">
              <div className="font-semibold">면(폴리곤) {result.features.length.toLocaleString("ko-KR")}개</div>
              <div className="text-xs text-[var(--text-muted)]">
                합계 {formatArea(total)}
                {result.skipped ? ` · 면이 아닌 도형 ${result.skipped}개 제외` : ""}
                {result.simplified ? ` · 복잡한 도형 ${result.simplified}개 단순화` : ""}
              </div>
              <div className="mt-1 text-[11px] text-[var(--text-faint)]">지도에 주황 점선으로 미리 보여 줍니다.</div>
            </div>
            {tooMany ? (
              <div role="alert" className="rounded-[var(--radius)] bg-[var(--warning-soft)] px-3 py-2 text-[var(--warning)]">
                한 번에 {MAX_AREAS_PER_IMPORT}개까지 가져올 수 있습니다. 파일을 나눠 올려 주세요.
              </div>
            ) : null}
            <label className="block">
              <span className="tb-label">구역 이름으로 쓸 속성</span>
              <select className="tb-field" value={field} onChange={(event) => setField(event.target.value)}>
                {result.fields.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
                <option value="">(속성 없이 파일명 + 번호)</option>
              </select>
            </label>
            {result.features.length ? (
              <div className="max-h-32 overflow-auto rounded-[var(--radius)] border border-[var(--border)] px-3 py-1.5 text-xs">
                {result.features.slice(0, 50).map((feature, index) => (
                  <div key={index} className="flex justify-between gap-2 py-0.5">
                    <span className="truncate">{importedName(feature, field, index)}</span>
                    <span className="shrink-0 text-[var(--text-faint)]">{formatArea(geometryArea(feature.geometry)).split(" · ")[0]}</span>
                  </div>
                ))}
                {result.features.length > 50 ? <div className="py-0.5 text-[var(--text-faint)]">외 {result.features.length - 50}개</div> : null}
              </div>
            ) : null}
            <div>
              <div className="tb-label">색</div>
              <ColorPicker value={color} onChange={setColor} />
            </div>
          </>
        )}
        {error ? (
          <div role="alert" className="rounded-[var(--radius)] bg-[var(--danger-soft)] px-3 py-2 text-[var(--danger)]">
            {error}
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-2 border-t border-[var(--border)] px-5 py-3">
        <button
          type="button"
          className="tb-btn tb-btn-primary"
          disabled={!result?.features.length || tooMany || saving}
          onClick={() =>
            result &&
            onImport(
              result.features.map((feature, index) => ({
                name: importedName(feature, field, index),
                color,
                memo: "",
                geometry: feature.geometry,
                source: "shp" as const,
              }))
            )
          }
        >
          {saving ? "저장 중…" : `구역 ${result?.features.length ?? 0}개 저장`}
        </button>
        <button type="button" className="tb-btn ml-auto" onClick={onClose}>
          취소
        </button>
      </div>
    </Shell>
  );
}
