import { describe, expect, it } from "vitest";
import { renderMinutesHtml } from "./minutes-report";
import {
  KOREAN_HOLIDAYS,
  addMonths,
  eventTimeLabel,
  eventsOnDay,
  monthWeeks,
  minutesAudience,
  myOpenActions,
  normalizeEventInput,
  normalizeMinutesInput,
  reminderAtMs,
  remindsMember,
  unreadMinutesFor,
  type CalendarEvent,
  type MeetingMinutes,
} from "./schedule";

function event(overrides: Partial<CalendarEvent>): CalendarEvent {
  return {
    id: 1,
    title: "회의",
    category: "meeting",
    startDate: "2026-11-18",
    endDate: "2026-11-18",
    allDay: false,
    startTime: "10:00",
    endTime: "11:00",
    location: "",
    description: "",
    attendeeIds: [],
    reminderMinutes: 10,
    createdByMemberId: 1,
    createdByName: "최부장",
    updatedBy: "",
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

describe("event input", () => {
  it("accepts a timed event and cleans fields", () => {
    const result = normalizeEventInput({
      title: "  주간 회의 ",
      category: "meeting",
      startDate: "2026-11-18",
      allDay: false,
      startTime: "10:00",
      endTime: "11:30",
      attendeeIds: [3, "3", 4, -1],
      reminderMinutes: "30",
    });
    expect(result).toEqual({
      value: {
        title: "주간 회의",
        category: "meeting",
        startDate: "2026-11-18",
        endDate: "2026-11-18",
        allDay: false,
        startTime: "10:00",
        endTime: "11:30",
        location: "",
        description: "",
        attendeeIds: [3, 4],
        reminderMinutes: 30,
      },
    });
  });

  it("rejects bad input with a reason", () => {
    expect(normalizeEventInput({ startDate: "2026-11-18" })).toHaveProperty("error");
    expect(normalizeEventInput({ title: "x", startDate: "2026-02-30" })).toHaveProperty("error");
    expect(normalizeEventInput({ title: "x", startDate: "2026-11-18", endDate: "2026-11-17" })).toHaveProperty("error");
    expect(normalizeEventInput({ title: "x", startDate: "2026-11-18", allDay: false })).toHaveProperty("error");
    expect(
      normalizeEventInput({ title: "x", startDate: "2026-11-18", allDay: false, startTime: "11:00", endTime: "10:00" })
    ).toHaveProperty("error");
  });

  it("defaults unknown categories and drops times for all-day events", () => {
    const result = normalizeEventInput({ title: "x", startDate: "2026-11-18", category: "party", startTime: "10:00" });
    expect(result).toMatchObject({ value: { category: "etc", allDay: true, startTime: null, reminderMinutes: null } });
  });
});

describe("calendar helpers", () => {
  it("orders a day's events: all-day first, then by time", () => {
    const events = [
      event({ id: 1, title: "오후", startTime: "15:00" }),
      event({ id: 2, title: "출장", allDay: true, startTime: null, startDate: "2026-11-17", endDate: "2026-11-19" }),
      event({ id: 3, title: "오전", startTime: "09:00" }),
      event({ id: 4, title: "다른 날", startDate: "2026-11-20", endDate: "2026-11-20" }),
    ];
    expect(eventsOnDay(events, "2026-11-18").map((entry) => entry.title)).toEqual(["출장", "오전", "오후"]);
    expect(eventTimeLabel(events[1])).toBe("11/17~11/19 종일");
    expect(eventTimeLabel(events[0])).toBe("15:00~11:00");
  });

  it("builds Sunday-start month grids", () => {
    const weeks = monthWeeks("2026-11");
    expect(weeks[0][0]).toBe("2026-11-01");
    expect(weeks.at(-1)?.[6]).toBe("2026-12-05");
    const december = monthWeeks("2026-12");
    expect(december[0][0]).toBe("2026-11-29");
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
  });

  it("computes reminders in Korean time and who gets them", () => {
    const timed = event({ startTime: "10:00", reminderMinutes: 10 });
    expect(new Date(reminderAtMs(timed) as number).toISOString()).toBe("2026-11-18T00:50:00.000Z");
    expect(reminderAtMs(event({ reminderMinutes: null }))).toBeNull();
    const allDay = event({ allDay: true, startTime: null, reminderMinutes: 1440 });
    expect(new Date(reminderAtMs(allDay) as number).toISOString()).toBe("2026-11-17T00:00:00.000Z");
    expect(remindsMember(event({ attendeeIds: [] }), 5)).toBe(true);
    expect(remindsMember(event({ attendeeIds: [2, 5] }), 5)).toBe(true);
    expect(remindsMember(event({ attendeeIds: [2] }), 5)).toBe(false);
  });

  it("knows Korean holidays including substitutes", () => {
    expect(KOREAN_HOLIDAYS["2026-09-25"]).toBe("추석");
    expect(KOREAN_HOLIDAYS["2026-10-05"]).toBe("대체공휴일");
    expect(KOREAN_HOLIDAYS["2026-11-18"]).toBeUndefined();
  });
});

describe("meeting minutes", () => {
  const names = new Map([[2, "김민지"]]);

  it("normalizes minutes and fills action item owners", () => {
    const result = normalizeMinutesInput(
      {
        title: "11월 주간 회의",
        meetingDate: "2026-11-18",
        startTime: "10:00",
        attendeeIds: [1, 2],
        actionItems: [
          { text: "현장 사진 정리", ownerId: 2, dueDate: "2026-11-20" },
          { text: "  ", ownerId: 2 },
          { text: "외부 업체 연락", ownerName: "업체 담당" },
        ],
      },
      names
    );
    expect(result).toMatchObject({
      value: {
        title: "11월 주간 회의",
        actionItems: [
          { text: "현장 사진 정리", ownerId: 2, ownerName: "김민지", dueDate: "2026-11-20", done: false },
          { text: "외부 업체 연락", ownerId: null, ownerName: "업체 담당", dueDate: null, done: false },
        ],
      },
    });
    expect(normalizeMinutesInput({ meetingDate: "2026-11-18" })).toHaveProperty("error");
  });

  it("finds my open action items that are due soon", () => {
    const minutes = [
      {
        id: 7,
        title: "주간 회의",
        actionItems: [
          { text: "A", ownerId: 2, ownerName: "김민지", dueDate: "2026-11-19", done: false },
          { text: "B", ownerId: 2, ownerName: "김민지", dueDate: "2026-12-30", done: false },
          { text: "C", ownerId: 2, ownerName: "김민지", dueDate: "2026-11-10", done: true },
          { text: "D", ownerId: 3, ownerName: "박서준", dueDate: "2026-11-19", done: false },
        ],
      },
    ];
    expect(myOpenActions(minutes, 2, "2026-11-18").map((item) => item.text)).toEqual(["A"]);
  });

  it("prints an escaped A4 document", () => {
    const minute: MeetingMinutes = {
      id: 1,
      title: "<b>주간</b> 회의",
      meetingDate: "2026-11-18",
      startTime: "10:00",
      endTime: "11:00",
      location: "회의실",
      attendeeIds: [2],
      guests: "외부 자문위원",
      agenda: "안건 1",
      content: "내용\n둘째 줄",
      decisions: "",
      actionItems: [{ text: "사진 정리", ownerId: 2, ownerName: "김민지", dueDate: "2026-11-20", done: true }],
      eventId: null,
      acknowledgments: [{ memberId: 3, memberName: "박서준", acknowledgedAt: "2026-11-19T05:05:00.000Z" }],
      authorMemberId: 1,
      authorName: "최부장",
      updatedBy: "",
      createdAt: "",
      updatedAt: "",
    };
    const html = renderMinutesHtml(minute, {
      organizationName: "습지복원팀",
      boardTitle: "습지복원팀",
      memberNames: names,
      members: [
        { id: 1, name: "최부장", active: true },
        { id: 2, name: "김민지", active: true },
        { id: 3, name: "박서준", active: true },
        { id: 4, name: "이하늘", active: false },
      ],
      generatedAt: "now",
      generatedBy: "최부장",
    });
    expect(html).toContain("&lt;b&gt;주간&lt;/b&gt; 회의");
    expect(html).toContain("김민지, 외부 자문위원");
    expect(html).toContain("2026년 11월 18일 (수) 10:00 ~ 11:00");
    expect(html).toContain('<span class="done">완료</span>');
    expect(html).toContain("@page { size: A4;");
    expect(html).toContain("미참석자 확인 (1/2)");
    expect(html).toContain('박서준</td><td><span class="done">확인</span> 11/19 14:05');
    expect(html).toContain('최부장</td><td><span class="muted">미확인</span>');
    expect(html).not.toContain("이하늘");
  });

  it("requires at least one member attendee", () => {
    expect(normalizeMinutesInput({ title: "회의", meetingDate: "2026-11-18", attendeeIds: [] })).toEqual({
      error: "참석한 구성원을 한 명 이상 선택해 주세요.",
    });
  });

  it("splits attendees and absentees and finds minutes I still need to read", () => {
    const members = [
      { id: 1, name: "최부장", active: true },
      { id: 2, name: "김민지", active: true },
      { id: 3, name: "박서준", active: true },
    ];
    const minute = {
      id: 9,
      title: "주간 회의",
      meetingDate: "2026-11-18",
      attendeeIds: [1],
      acknowledgments: [{ memberId: 2, memberName: "김민지", acknowledgedAt: "2026-11-18T09:00:00.000Z" }],
    };
    const audience = minutesAudience(minute, members);
    expect(audience.attendees).toEqual([{ id: 1, name: "최부장" }]);
    expect(audience.absentees.map((member) => [member.name, Boolean(member.acknowledgedAt)])).toEqual([
      ["김민지", true],
      ["박서준", false],
    ]);
    expect(audience.confirmed).toBe(1);
    expect(unreadMinutesFor([minute], 3).map((entry) => entry.id)).toEqual([9]);
    expect(unreadMinutesFor([minute], 2)).toEqual([]);
    expect(unreadMinutesFor([minute], 1)).toEqual([]);

    // Someone who joined after the minutes were written is not asked to confirm.
    const written = { ...minute, createdAt: "2026-11-18T10:00:00.000Z" };
    expect(unreadMinutesFor([written], 3, "2026-11-20T00:00:00.000Z")).toEqual([]);
    expect(
      minutesAudience(written, [...members, { id: 5, name: "신입", active: true, createdAt: "2026-11-20T00:00:00.000Z" }])
        .absentees.map((member) => member.name)
    ).toEqual(["김민지", "박서준"]);
  });
});
