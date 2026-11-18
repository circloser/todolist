import { describe, expect, it } from "vitest";
import { BRAND, displayBoardTitle } from "../brand";
import { orgLine } from "./work-log-report";

describe("board titles", () => {
  it("keeps a title the team chose", () => {
    expect(displayBoardTitle("습지복원팀 업무 보드", "습지복원팀")).toBe("습지복원팀 업무 보드");
  });

  it("shows the team name instead of placeholder titles", () => {
    expect(displayBoardTitle("Workflow Command Center", "습지복원팀")).toBe("습지복원팀");
    expect(displayBoardTitle(BRAND.name, "습지복원팀")).toBe("습지복원팀");
    expect(displayBoardTitle("  ", "자생식물생태부")).toBe("자생식물생태부");
    expect(displayBoardTitle(null, "")).toBe(BRAND.name);
  });

  it("does not repeat the same name in report subtitles", () => {
    expect(orgLine({ organizationName: "습지복원팀", boardTitle: "습지복원팀" })).toBe("습지복원팀");
    expect(orgLine({ organizationName: "2026 / 습지복원팀", boardTitle: "습지복원팀" })).toBe(
      "2026 / 습지복원팀 · 습지복원팀"
    );
  });
});
