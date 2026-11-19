import { describe, expect, it } from "vitest";

import {
  clockLabel,
  datesBetween,
  entryDuration,
  fromMinutes,
  hiddenPerDay,
  isBarEntry,
  repeatDates,
  snapMinutes,
  timedLayout,
  weekSegments,
  weekStart,
  type LayoutEntry,
} from "./calendar-layout";

const entry = (key: string, startDate: string, endDate = startDate, startTime: string | null = null, endTime: string | null = null): LayoutEntry => ({
  key,
  startDate,
  endDate,
  allDay: startTime === null,
  startTime,
  endTime,
  title: key,
});

const week = datesBetween("2026-11-15", "2026-11-21");

describe("weekSegments", () => {
  it("clips multi-day events to the week and stacks overlaps in lanes", () => {
    const segments = weekSegments(
      [entry("trip", "2026-11-12", "2026-11-17"), entry("fair", "2026-11-16", "2026-11-19"), entry("meet", "2026-11-18", "2026-11-18", "10:00")],
      week
    );
    const trip = segments.find((s) => s.entry.key === "trip")!;
    expect(trip).toMatchObject({ col: 0, span: 3, lane: 0, before: true, after: false });
    const fair = segments.find((s) => s.entry.key === "fair")!;
    expect(fair).toMatchObject({ col: 1, span: 4, lane: 1 });
    const meet = segments.find((s) => s.entry.key === "meet")!;
    expect(meet.lane).toBe(0);
  });

  it("counts what does not fit per day", () => {
    const segments = weekSegments([entry("a", "2026-11-16"), entry("b", "2026-11-16"), entry("c", "2026-11-16", "2026-11-17")], week);
    expect(hiddenPerDay(segments, 7, 2)).toEqual([0, 1, 0, 0, 0, 0, 0]);
  });

  it("treats timed multi-day events as bars", () => {
    expect(isBarEntry(entry("x", "2026-11-16", "2026-11-17", "22:00", "02:00"))).toBe(true);
    expect(isBarEntry(entry("y", "2026-11-16", "2026-11-16", "09:00"))).toBe(false);
  });
});

describe("timedLayout", () => {
  it("puts overlapping events side by side", () => {
    const boxes = timedLayout([
      entry("a", "2026-11-16", "2026-11-16", "09:00", "10:00"),
      entry("b", "2026-11-16", "2026-11-16", "09:30", "11:00"),
      entry("c", "2026-11-16", "2026-11-16", "13:00", "14:00"),
    ]);
    const byKey = Object.fromEntries(boxes.map((box) => [box.entry.key, box]));
    expect(byKey.a).toMatchObject({ column: 0, columns: 2 });
    expect(byKey.b).toMatchObject({ column: 1, columns: 2 });
    expect(byKey.c).toMatchObject({ column: 0, columns: 1 });
  });

  it("gives events without an end one hour", () => {
    expect(entryDuration({ startTime: "09:00", endTime: null })).toBe(60);
    expect(entryDuration({ startTime: "09:00", endTime: "09:05" })).toBe(15);
  });
});

describe("dates and times", () => {
  it("finds the Sunday and walks ranges either way", () => {
    expect(weekStart("2026-11-19")).toBe("2026-11-15");
    expect(datesBetween("2026-11-03", "2026-11-01")).toEqual(["2026-11-01", "2026-11-02", "2026-11-03"]);
  });

  it("snaps and formats minutes", () => {
    expect(snapMinutes(9 * 60 + 8)).toBe(9 * 60 + 15);
    expect(fromMinutes(-5)).toBe("00:00");
    expect(fromMinutes(25 * 60)).toBe("23:59");
    expect(clockLabel("13:30")).toBe("오후 1:30");
    expect(clockLabel("00:00")).toBe("오전 12시");
  });
});

describe("repeatDates", () => {
  it("weekly by count", () => {
    expect(repeatDates("2026-11-03", "weekly", { count: 3 })).toEqual(["2026-11-03", "2026-11-10", "2026-11-17"]);
  });

  it("weekdays until a date skip the weekend", () => {
    expect(repeatDates("2026-11-20", "weekdays", { until: "2026-11-25" })).toEqual([
      "2026-11-20",
      "2026-11-23",
      "2026-11-24",
      "2026-11-25",
    ]);
  });

  it("monthly skips months without that day", () => {
    expect(repeatDates("2026-01-31", "monthly", { count: 3 })).toEqual(["2026-01-31", "2026-03-31", "2026-05-31"]);
  });

  it("never makes more than 100", () => {
    expect(repeatDates("2026-01-01", "daily", { until: "2027-12-31" })).toHaveLength(100);
    expect(repeatDates("2026-01-01", "none", { count: 5 })).toEqual(["2026-01-01"]);
  });
});
