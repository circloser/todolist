import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DASHBOARD_WIDGETS,
  defaultWidgetPrefs,
  escapeHtml,
  isoDate,
  periodRange,
} from "./board-config";

describe("board config helpers", () => {
  it("escapes user text before building popup HTML", () => {
    expect(escapeHtml(`<span data-x="1">Tom & 'Kim'</span>`)).toBe(
      "&lt;span data-x=&quot;1&quot;&gt;Tom &amp; &#39;Kim&#39;&lt;/span&gt;"
    );
  });

  it("enables every dashboard widget by default", () => {
    expect(Object.keys(defaultWidgetPrefs)).toEqual(
      DASHBOARD_WIDGETS.map((widget) => widget.key)
    );
    expect(Object.values(defaultWidgetPrefs).every(Boolean)).toBe(true);
  });

  it("formats local dates as ISO calendar days", () => {
    expect(isoDate(new Date(2026, 6, 28))).toBe("2026-07-28");
  });
});

describe("periodRange", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-28T09:00:00+09:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns this week's Monday-Sunday range", () => {
    expect(periodRange("week")).toEqual({
      start: "2026-07-27",
      end: "2026-08-02",
    });
  });

  it("returns this month's first-last day range", () => {
    expect(periodRange("month")).toEqual({
      start: "2026-07-01",
      end: "2026-07-31",
    });
  });
});
