"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import Highlight from "./highlight";
import { categoryKey } from "./lib/board-config";
import {
  SEARCH_KIND_LABEL,
  matchesAll,
  parseSearchQuery,
  searchSnippet,
  type SearchField,
  type SearchHit,
  type SearchKind,
  type SearchResponse,
} from "./lib/search";
import { placeKindOf, type MapPlace } from "./lib/places";
import type { TeamMember } from "./lib/team";
import { assigneeName, type WorkflowItem } from "./lib/workflow";
import ManualContent from "./manual-content";

// 통합 검색: one box that finds 업무 (with steps, checklists, memos, contract
// and links), 업무일정, 회의록, 업무일지, 구성원, 양식 and the manual, and
// jumps straight to what it found. Items, members and the manual are searched
// in the browser; the rest comes from /api/search, which applies the same
// permissions as the screens themselves.

type ApiRequest = (path: string, init?: RequestInit) => Promise<Response>;
type Scope = "all" | SearchKind;

const KIND_ORDER: SearchKind[] = ["item", "event", "minutes", "worklog", "place", "member", "document", "manual"];
const KIND_ICON: Record<SearchKind, string> = {
  item: "📋",
  event: "🗓",
  minutes: "🗒",
  worklog: "📝",
  place: "📌",
  member: "👥",
  document: "📎",
  manual: "📖",
};
const PER_GROUP_IN_ALL = 5;
const RECENT_KEY = "wc-search-recent";

function readRecent(): string[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((entry) => typeof entry === "string").slice(0, 6) : [];
  } catch {
    return [];
  }
}

function saveRecent(query: string) {
  try {
    const next = [query, ...readRecent().filter((entry) => entry !== query)].slice(0, 6);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Not remembered; fine.
  }
}

function itemFields(item: WorkflowItem): SearchField[] {
  return [
    ["업무명", item.title],
    ["업무 위계", item.category],
    ["담당자", item.assignee],
    ["메모", item.memo],
    ["위치", item.location],
    ["계약", [item.contractVendor, item.contractManager, item.contractPhone].filter(Boolean).join(" · ")],
    ["진행 단계", item.steps.map((step) => [step.title, step.description].filter(Boolean).join(" ")).join(" · ")],
    [
      "체크리스트",
      item.subtasks.map((subtask) => `${subtask.title}${subtask.blockers ? ` (${subtask.blockers})` : ""}`).join(" · "),
    ],
    ["링크·자료", item.links.map((link) => `${link.title} ${link.url}`).join(" · ")],
  ];
}

type SearchPaletteProps = {
  request: ApiRequest;
  items: WorkflowItem[];
  members: TeamMember[];
  places: MapPlace[];
  onClose: () => void;
  onOpenItem: (id: number) => void;
  onOpenEvent: (id: number) => void;
  onOpenMinutes: (id: number, terms: string[]) => void;
  onOpenWorkLog: (memberId: number, logDate: string) => void;
  onOpenPlace: (id: number) => void;
  onOpenMembers: () => void;
  onOpenDocuments: () => void;
  onOpenManual: (sectionId: string) => void;
};

export default function SearchPalette({
  request,
  items,
  members,
  places,
  onClose,
  onOpenItem,
  onOpenEvent,
  onOpenMinutes,
  onOpenWorkLog,
  onOpenPlace,
  onOpenMembers,
  onOpenDocuments,
  onOpenManual,
}: SearchPaletteProps) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [serverHits, setServerHits] = useState<{ query: string; hits: SearchHit[] }>({ query: "", hits: [] });
  const [serverError, setServerError] = useState("");
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<string[]>(readRecent);
  const [manualIndex, setManualIndex] = useState<Array<{ id: string; title: string; text: string }>>([]);
  const manualRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const terms = useMemo(() => parseSearchQuery(query), [query]);
  const termKey = terms.join(" ");

  // Index the manual's text once (it is rendered hidden below).
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const sections = manualRef.current?.querySelectorAll<HTMLElement>("section[id]") ?? [];
      setManualIndex(
        [...sections].map((section) => ({
          id: section.id,
          title: section.querySelector("h3")?.textContent?.trim() ?? section.id,
          text: section.textContent ?? "",
        }))
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  // Server-side kinds, a moment after typing stops.
  useEffect(() => {
    if (!termKey) {
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void request(`/api/search?q=${encodeURIComponent(termKey)}`, { cache: "no-store", signal: controller.signal })
        .then(async (response) => {
          const data = (await response.json().catch(() => ({}))) as SearchResponse;
          if (!response.ok) {
            setServerError(data.error ?? "검색하지 못했습니다.");
            return;
          }
          setServerError("");
          setServerHits({ query: termKey, hits: data.hits ?? [] });
        })
        .catch(() => undefined);
    }, 220);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [request, termKey]);

  const localHits = useMemo<SearchHit[]>(() => {
    if (!terms.length) {
      return [];
    }
    const itemHits = items
      .map((item) => ({ item, fields: itemFields(item) }))
      .filter(({ fields }) => matchesAll(fields, terms))
      .sort(
        (first, second) =>
          Number(!matchesAll([["업무명", second.item.title]], terms)) -
            Number(!matchesAll([["업무명", first.item.title]], terms)) ||
          first.item.position - second.item.position
      )
      .slice(0, 40)
      .map(({ item, fields }) => ({
        kind: "item" as const,
        id: String(item.id),
        title: item.title,
        ...searchSnippet(fields, terms),
        meta: [categoryKey(item.category), assigneeName(item.assignee), item.dueDate ? `마감 ${item.dueDate}` : ""]
          .filter(Boolean)
          .join(" · "),
        target: { itemId: item.id },
      }));
    const memberHits = members
      .map((member) => ({
        member,
        fields: [
          ["이름", member.name],
          ["역할·직급", member.role],
          ["아이디", member.loginId ?? ""],
        ] as SearchField[],
      }))
      .filter(({ fields }) => matchesAll(fields, terms))
      .map(({ member, fields }) => ({
        kind: "member" as const,
        id: String(member.id),
        title: member.name,
        ...searchSnippet(fields, terms),
        meta: [member.role, member.accessRole === "manager" ? "부서장" : "구성원", member.active ? "" : "비활성"]
          .filter(Boolean)
          .join(" · "),
        target: { memberId: member.id },
      }));
    const manualHits = manualIndex
      .filter((section) => matchesAll([["제목", section.title], ["본문", section.text]], terms))
      .map((section) => ({
        kind: "manual" as const,
        id: section.id,
        title: section.title,
        ...searchSnippet([["본문", section.text]], terms),
        meta: "사용자 매뉴얼",
        target: { sectionId: section.id },
      }));
    const placeHits = places
      .map((place) => {
        const kind = placeKindOf(place);
        return {
          place,
          kind,
          fields: [
            ["이름", place.name],
            ["유형", kind.label],
            ["주소", place.address],
            ["메모", place.memo],
            ["등록", place.createdByName],
          ] as SearchField[],
        };
      })
      .filter(({ fields }) => matchesAll(fields, terms))
      .map(({ place, kind, fields }) => ({
        kind: "place" as const,
        id: String(place.id),
        title: place.name,
        ...searchSnippet(fields, terms),
        meta: `${kind.icon} ${kind.label}`,
        target: { placeId: place.id },
      }));
    return [...itemHits, ...placeHits, ...memberHits, ...manualHits];
  }, [items, manualIndex, members, places, terms]);

  const remoteHits = useMemo(
    () => (termKey && serverHits.query === termKey ? serverHits.hits : []),
    [serverHits, termKey]
  );
  const searching = Boolean(termKey) && serverHits.query !== termKey && !serverError;

  const groups = useMemo(() => {
    const all = [...localHits, ...remoteHits];
    return KIND_ORDER.map((kind) => {
      const hits = all.filter((hit) => hit.kind === kind);
      return {
        kind,
        total: hits.length,
        hits: scope === "all" ? hits.slice(0, PER_GROUP_IN_ALL) : scope === kind ? hits : [],
      };
    }).filter((group) => group.hits.length);
  }, [localHits, remoteHits, scope]);

  const counts = useMemo(() => {
    const all = [...localHits, ...remoteHits];
    return Object.fromEntries(KIND_ORDER.map((kind) => [kind, all.filter((hit) => hit.kind === kind).length])) as Record<
      SearchKind,
      number
    >;
  }, [localHits, remoteHits]);

  const flat = groups.flatMap((group) => group.hits);
  const activeIndex = Math.min(active, Math.max(0, flat.length - 1));

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, termKey, scope]);

  function open(hit: SearchHit) {
    if (query.trim()) {
      saveRecent(query.trim());
    }
    onClose();
    const target = hit.target;
    switch (hit.kind) {
      case "item":
        onOpenItem(Number(target.itemId));
        break;
      case "event":
        onOpenEvent(Number(target.eventId));
        break;
      case "minutes":
        onOpenMinutes(Number(target.minutesId), terms);
        break;
      case "worklog":
        onOpenWorkLog(Number(target.memberId), String(target.logDate));
        break;
      case "place":
        onOpenPlace(Number(target.placeId));
        break;
      case "member":
        onOpenMembers();
        break;
      case "document":
        onOpenDocuments();
        break;
      case "manual":
        onOpenManual(String(target.sectionId));
        break;
    }
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive(Math.min(activeIndex + 1, flat.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive(Math.max(activeIndex - 1, 0));
    } else if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      const hit = flat[activeIndex];
      if (hit) {
        event.preventDefault();
        open(hit);
      }
    }
  }

  const scopes: Array<[Scope, string]> = [
    ["all", "전체"],
    ...KIND_ORDER.filter((kind) => counts[kind] > 0).map((kind) => [kind, `${SEARCH_KIND_LABEL[kind]} ${counts[kind]}`] as [Scope, string]),
  ];
  let position = -1;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-auto bg-black/40 p-3 backdrop-blur-sm sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="통합 검색"
        className="tb-card my-2 w-full max-w-[680px] overflow-hidden shadow-[var(--shadow-lg)] sm:my-10"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-[var(--text-faint)]" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            placeholder="업무·일정·회의록·업무일지·구성원·양식·매뉴얼 검색"
            aria-label="통합 검색어"
            className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-[var(--text-faint)]"
          />
          {query ? (
            <button type="button" className="tb-iconbtn h-7 w-7" aria-label="검색어 지우기" onClick={() => setQuery("")}>
              ×
            </button>
          ) : null}
          <button type="button" className="tb-btn !px-2 !py-1 text-xs" onClick={onClose}>
            닫기
          </button>
        </div>

        {terms.length ? (
          <div className="flex gap-1.5 overflow-x-auto border-b border-[var(--border)] px-4 py-2" role="tablist" aria-label="검색 범위">
            {scopes.map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={scope === key}
                onClick={() => {
                  setScope(key);
                  setActive(0);
                }}
                className="tb-chip tb-chip-btn shrink-0"
                style={scope === key ? { borderColor: "var(--accent)", background: "var(--accent-soft)", color: "var(--accent)" } : undefined}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}

        <div ref={listRef} className="max-h-[min(64vh,560px)] overflow-auto p-2" data-testid="search-results">
          {!terms.length ? (
            <div className="space-y-3 p-3 text-sm text-[var(--text-muted)]">
              {recent.length ? (
                <div>
                  <div className="mb-1.5 flex items-center text-xs font-semibold text-[var(--text-faint)]">
                    최근 검색
                    <button
                      type="button"
                      className="ml-auto font-normal hover:underline"
                      onClick={() => {
                        try {
                          window.localStorage.removeItem(RECENT_KEY);
                        } catch {
                          // ignore
                        }
                        setRecent([]);
                      }}
                    >
                      지우기
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {recent.map((entry) => (
                      <button key={entry} type="button" className="tb-chip tb-chip-btn" onClick={() => setQuery(entry)}>
                        {entry}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <p className="text-xs leading-5 text-[var(--text-faint)]">
                업무명·메모·진행 단계·체크리스트·계약·위치, 업무일정, 회의록 내용, 업무일지(볼 수 있는 범위), 지도 장소, 구성원, 양식,
                매뉴얼을 한 번에 찾습니다. 여러 단어를 띄어 쓰면 모두 들어 있는 것만 찾습니다. ↑↓로 고르고 Enter로 이동합니다.
              </p>
            </div>
          ) : flat.length ? (
            groups.map((group) => (
              <div key={group.kind} className="mb-2">
                <div className="flex items-center gap-2 px-2 pb-1 pt-2 text-xs font-semibold text-[var(--text-faint)]">
                  <span aria-hidden="true">{KIND_ICON[group.kind]}</span>
                  {SEARCH_KIND_LABEL[group.kind]}
                  <span className="font-normal">{group.total}건</span>
                  {scope === "all" && group.total > group.hits.length ? (
                    <button
                      type="button"
                      className="ml-auto font-normal text-[var(--accent)] hover:underline"
                      onClick={() => {
                        setScope(group.kind);
                        setActive(0);
                      }}
                    >
                      {group.total - group.hits.length}건 더 보기
                    </button>
                  ) : null}
                </div>
                {group.hits.map((hit) => {
                  position += 1;
                  const index = position;
                  return (
                    <button
                      key={`${hit.kind}-${hit.id}`}
                      type="button"
                      data-active={index === activeIndex}
                      onMouseMove={() => {
                        if (active !== index) {
                          setActive(index);
                        }
                      }}
                      onClick={() => open(hit)}
                      className="block w-full rounded-[var(--radius)] px-3 py-2 text-left data-[active=true]:bg-[var(--accent-soft)]"
                    >
                      <span className="flex min-w-0 items-baseline gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                          <Highlight text={hit.title} terms={terms} />
                        </span>
                        <span className="shrink-0 truncate text-[11px] text-[var(--text-faint)]">{hit.meta}</span>
                      </span>
                      {hit.snippet && hit.snippet !== hit.title ? (
                        <span className="mt-0.5 block truncate text-xs text-[var(--text-muted)]">
                          <span className="text-[var(--text-faint)]">{hit.field} · </span>
                          <Highlight text={hit.snippet} terms={terms} />
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))
          ) : (
            <div className="px-3 py-10 text-center text-sm text-[var(--text-muted)]">
              {searching ? "찾는 중…" : serverError || `‘${query.trim()}’에 맞는 내용이 없습니다.`}
            </div>
          )}
          {flat.length && searching ? (
            <div className="px-3 pb-2 text-xs text-[var(--text-faint)]">일정·회의록·업무일지를 찾는 중…</div>
          ) : null}
        </div>
      </div>

      {/* Hidden copy of the manual, only to index its text. */}
      <div ref={manualRef} hidden aria-hidden="true">
        <ManualContent />
      </div>
    </div>
  );
}
