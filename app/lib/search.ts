// 통합 검색: query parsing, matching, snippets and highlight ranges shared by
// the search API and the search window. A query is split on spaces and every
// word must appear somewhere in a result (in any of its fields).

export const SEARCH_MAX_TERMS = 5;
export const SEARCH_MAX_TERM_LENGTH = 40;

export type SearchKind = "item" | "event" | "minutes" | "worklog" | "place" | "member" | "document" | "manual";

export const SEARCH_KIND_LABEL: Record<SearchKind, string> = {
  item: "업무",
  event: "업무일정",
  minutes: "회의록",
  worklog: "업무일지",
  place: "장소",
  member: "구성원",
  document: "양식",
  manual: "매뉴얼",
};

export type SearchHit = {
  kind: SearchKind;
  /** Unique within its kind. */
  id: string;
  title: string;
  /** Which field the snippet comes from, e.g. "회의 내용". */
  field: string;
  snippet: string;
  /** Short context: date, person, category… */
  meta: string;
  /** Kind-specific navigation data. */
  target: Record<string, string | number | null>;
};

export type SearchResponse = {
  query?: string;
  hits?: SearchHit[];
  error?: string;
};

/** Lower-cased, de-duplicated search words (empty when nothing to search). */
export function parseSearchQuery(raw: unknown) {
  if (typeof raw !== "string") {
    return [];
  }
  const terms: string[] = [];
  for (const word of raw.toLocaleLowerCase("ko-KR").split(/\s+/)) {
    const term = word.trim().slice(0, SEARCH_MAX_TERM_LENGTH);
    if (term && !terms.includes(term)) {
      terms.push(term);
    }
  }
  return terms.slice(0, SEARCH_MAX_TERMS);
}

export type SearchField = [label: string, text: string | null | undefined];

/** Whether every term appears in at least one of the fields. */
export function matchesAll(fields: SearchField[], terms: string[]) {
  if (!terms.length) {
    return false;
  }
  const haystack = fields.map(([, text]) => (text ?? "").toLocaleLowerCase("ko-KR"));
  return terms.every((term) => haystack.some((text) => text.includes(term)));
}

/**
 * The first field containing a search word, cut to about `width` characters
 * around the match (with … where text was dropped).
 */
export function searchSnippet(fields: SearchField[], terms: string[], width = 90) {
  for (const term of terms) {
    for (const [label, raw] of fields) {
      const text = (raw ?? "").replace(/\s+/g, " ").trim();
      const index = text.toLocaleLowerCase("ko-KR").indexOf(term);
      if (index < 0) {
        continue;
      }
      if (text.length <= width) {
        return { field: label, snippet: text };
      }
      const start = Math.max(0, Math.min(index - Math.floor(width / 3), text.length - width));
      const end = Math.min(text.length, start + width);
      return {
        field: label,
        snippet: `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`,
      };
    }
  }
  const [label, raw] = fields.find(([, text]) => text?.trim()) ?? ["", ""];
  const text = (raw ?? "").replace(/\s+/g, " ").trim();
  return { field: label, snippet: text.length > width ? `${text.slice(0, width)}…` : text };
}

/** Splits text into plain and matching parts for <mark> highlighting. */
export function highlightParts(text: string, terms: string[]) {
  const lower = text.toLocaleLowerCase("ko-KR");
  const marks: boolean[] = new Array(text.length).fill(false);
  for (const term of terms) {
    if (!term) {
      continue;
    }
    for (let index = lower.indexOf(term); index >= 0; index = lower.indexOf(term, index + term.length)) {
      marks.fill(true, index, index + term.length);
    }
  }
  const parts: Array<{ text: string; hit: boolean }> = [];
  for (let index = 0; index < text.length; index += 1) {
    const last = parts.at(-1);
    if (last && last.hit === marks[index]) {
      last.text += text[index];
    } else {
      parts.push({ text: text[index], hit: marks[index] });
    }
  }
  return parts;
}

/** A LIKE pattern for `term` with %, _ and \ escaped (use with ESCAPE '\'). */
export function likePattern(term: string) {
  return `%${term.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}

/**
 * SQL that requires every term to appear in one of `columns`, with its binds:
 * "(a LIKE ? ESCAPE '\' OR b LIKE ? ESCAPE '\') AND (…)".
 */
export function likeAllClause(columns: string[], terms: string[]) {
  const clause = terms
    .map(() => `(${columns.map((column) => `${column} LIKE ? ESCAPE '\\'`).join(" OR ")})`)
    .join(" AND ");
  const binds = terms.flatMap((term) => columns.map(() => likePattern(term)));
  return { clause, binds };
}
