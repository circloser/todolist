import { describe, expect, it } from "vitest";
import {
  highlightParts,
  likeAllClause,
  likePattern,
  matchesAll,
  parseSearchQuery,
  searchSnippet,
} from "./search";

describe("통합 검색 helpers", () => {
  it("splits a query into unique lower-case words", () => {
    expect(parseSearchQuery("  우포늪  식생 ABC 식생 ")).toEqual(["우포늪", "식생", "abc"]);
    expect(parseSearchQuery("")).toEqual([]);
    expect(parseSearchQuery(null)).toEqual([]);
    expect(parseSearchQuery("a b c d e f g")).toHaveLength(5);
  });

  it("requires every word somewhere in the fields", () => {
    const fields: Array<[string, string]> = [
      ["제목", "우포늪 식생 조사"],
      ["메모", "드론 촬영 포함"],
    ];
    expect(matchesAll(fields, ["우포늪", "드론"])).toBe(true);
    expect(matchesAll(fields, ["우포늪", "수질"])).toBe(false);
    expect(matchesAll(fields, [])).toBe(false);
    expect(matchesAll([["제목", "GIS Map"]], ["gis"])).toBe(true);
  });

  it("cuts a snippet around the first match and says which field it came from", () => {
    const long = `${"가".repeat(100)} 핵심 문장 ${"나".repeat(100)}`;
    const hit = searchSnippet(
      [
        ["제목", "주간 회의"],
        ["회의 내용", long],
      ],
      ["핵심"],
      40
    );
    expect(hit.field).toBe("회의 내용");
    expect(hit.snippet.startsWith("…")).toBe(true);
    expect(hit.snippet.endsWith("…")).toBe(true);
    expect(hit.snippet).toContain("핵심 문장");
    expect(searchSnippet([["제목", "주간 회의"]], ["없음"])).toEqual({ field: "제목", snippet: "주간 회의" });
  });

  it("marks every occurrence of every word", () => {
    expect(highlightParts("식생 조사와 식생 복원", ["식생", "복원"])).toEqual([
      { text: "식생", hit: true },
      { text: " 조사와 ", hit: false },
      { text: "식생", hit: true },
      { text: " ", hit: false },
      { text: "복원", hit: true },
    ]);
    expect(highlightParts("Drone", ["dro"])).toEqual([
      { text: "Dro", hit: true },
      { text: "ne", hit: false },
    ]);
  });

  it("builds escaped LIKE clauses", () => {
    expect(likePattern("50%_off\\")).toBe("%50\\%\\_off\\\\%");
    const { clause, binds } = likeAllClause(["title", "memo"], ["a", "b"]);
    expect(clause).toBe(
      "(title LIKE ? ESCAPE '\\' OR memo LIKE ? ESCAPE '\\') AND (title LIKE ? ESCAPE '\\' OR memo LIKE ? ESCAPE '\\')"
    );
    expect(binds).toEqual(["%a%", "%a%", "%b%", "%b%"]);
  });
});
