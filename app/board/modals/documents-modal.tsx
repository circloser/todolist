"use client";

import {
  formatDate,
} from "../../lib/workflow";
import { useBoard } from "../board-context";

export default function DocumentsModal() {
  const {
    setDocsOpen,
    documents,
    docsLoading,
    uploadingDoc,
    docName,
    setDocName,
    docFile,
    setDocFile,
    uploadDocument,
    deleteDocument,
    downloadDocument,
  } = useBoard();

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/40 p-4 backdrop-blur-sm"
      onClick={() => setDocsOpen(false)}
    >
      <div
        className="tb-card my-6 w-full max-w-[640px] shadow-[var(--shadow-lg)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3.5">
          <h2 className="text-base font-semibold">기안문 · 공용 양식</h2>
          <button
            aria-label="닫기"
            type="button"
            onClick={() => setDocsOpen(false)}
            className="tb-iconbtn h-8 w-8"
          >
            ×
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface-2)] p-3.5">
            <div className="tb-label">새 양식 업로드 (hwp, hwpx, doc, docx, pdf, xlsx · 최대 1MB)</div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="file"
                accept=".hwp,.hwpx,.doc,.docx,.pdf,.xlsx"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  setDocFile(file);
                  if (file && !docName.trim()) {
                    setDocName(file.name.replace(/\.[^.]+$/, ""));
                  }
                }}
                className="tb-field flex-1 file:mr-2 file:rounded-[var(--radius-sm)] file:border-0 file:bg-[var(--accent-soft)] file:px-2.5 file:py-1 file:text-xs file:font-semibold file:text-[var(--accent)]"
              />
              <input
                value={docName}
                onChange={(event) => setDocName(event.target.value)}
                className="tb-field flex-1"
                placeholder="양식 이름 (예: 표준 기안문)"
              />
              <button
                type="button"
                disabled={!docFile || uploadingDoc}
                onClick={() => void uploadDocument()}
                className="tb-btn tb-btn-primary shrink-0"
              >
                {uploadingDoc ? "업로드 중…" : "업로드"}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            {docsLoading ? (
              <div className="py-8 text-center text-sm text-[var(--text-muted)]">
                불러오는 중…
              </div>
            ) : documents.length ? (
              documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center gap-2.5 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5"
                >
                  <span className="text-lg">
                    {/\.hwpx?$/i.test(doc.filename) ? "📝" : "📄"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {doc.name}
                    </div>
                    <div className="truncate text-[11px] text-[var(--text-faint)]">
                      {doc.filename} · {Math.max(1, Math.round(doc.size / 1024))}
                      KB · {doc.uploadedBy} · {formatDate(doc.createdAt)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void downloadDocument(doc)}
                    className="tb-btn shrink-0 !px-3 !py-1.5 text-xs"
                    title="다운로드"
                  >
                    ⬇ 다운로드
                  </button>
                  <button
                    aria-label="양식 삭제"
                    type="button"
                    onClick={() => void deleteDocument(doc)}
                    className="tb-iconbtn tb-iconbtn-danger h-8 w-8 shrink-0"
                    title="양식 삭제"
                  >
                    ×
                  </button>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-sm text-[var(--text-muted)]">
                등록된 양식이 없습니다. 팀이 공용으로 쓸 기안문 양식(hwpx)을
                업로드해 보세요.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
