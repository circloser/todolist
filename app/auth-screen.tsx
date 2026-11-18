"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { BRAND, CompassMark } from "./brand";
import type { AuthResponse } from "./lib/team";
import type { WorkspaceSummary } from "./lib/workflow";

// Sign in / sign up, then pick (or ask to join, or create) a board.

type AuthScreenProps = {
  auth: AuthResponse | null;
  message: string;
  onAuth: (data: AuthResponse) => void;
  onEnter: (workspaceId: string) => void;
  onBack?: () => void;
};

type Mode = "login" | "signup";

async function postJson<T>(path: string, body: object) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  return { ok: response.ok, data };
}

function Notice({ tone, children }: { tone: "error" | "info" | "success"; children: React.ReactNode }) {
  const styles = {
    error: "border-[var(--danger-border)] bg-[var(--danger-soft)] text-[var(--danger)]",
    info: "border-[var(--warning-border)] bg-[var(--warning-soft)] text-[var(--text)]",
    success: "border-[var(--success-border)] bg-[var(--success-soft)] text-[var(--success)]",
  }[tone];

  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-[var(--radius)] border px-3 py-2 text-sm ${styles}`}
    >
      {children}
    </div>
  );
}

const FEATURES = [
  {
    title: "단계별 진행 보드",
    body: "계획부터 결과 보고까지 업무 유형별 단계를 순서대로 체크하고, 목록·지도·간트로 봅니다.",
    icon: "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z",
  },
  {
    title: "업무일지와 결재",
    body: "하루 한 장 일지를 쓰고 부서장이 승인·반려합니다. 보드에서 한 일을 불러와 빠르게 씁니다.",
    icon: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2zM9 7h7M9 11h5",
  },
  {
    title: "모아보기·보고서",
    body: "주간 표와 월간 달력으로 팀 전체를 한눈에, 개인·팀·연간 보고서는 A4로 바로 인쇄합니다.",
    icon: "M3 3v18h18M7 15l4-4 3 3 5-6",
  },
  {
    title: "개인 계정과 권한",
    body: "본인 업무와 일지만 수정하고, 부서장은 배정·승인과 운영 옵션을 관리합니다.",
    icon: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4",
  },
];

function FeatureIcon({ path }: { path: string }) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[var(--accent-soft)] text-[var(--accent)]">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={path} />
      </svg>
    </span>
  );
}

// Decorative mini product preview (not interactive).
function ProductPreview() {
  const rows = [
    { name: "김민지", color: "#e8eefc", cells: ["a", "a", "p", "p", ""] },
    { name: "박서준", color: "#fdf0de", cells: ["a", "p", "", "p", "p"] },
    { name: "이도윤", color: "#f6e6ef", cells: ["a", "a", "a", "r", "p"] },
  ];
  const tone: Record<string, string> = {
    a: "var(--complete)",
    p: "var(--warning)",
    r: "var(--danger)",
  };
  return (
    <div aria-hidden="true" className="tb-landing-preview hidden md:block">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2.5">
        <span className="text-xs font-semibold">이번 주 업무일지</span>
        <span className="text-[10px] text-[var(--text-faint)]">월 화 수 목 금</span>
      </div>
      <div className="space-y-1.5 px-4 py-3">
        {rows.map((row) => (
          <div key={row.name} className="flex items-center gap-2">
            <span className="w-12 truncate text-[11px] text-[var(--text-muted)]">{row.name}</span>
            <div className="grid flex-1 grid-cols-5 gap-1">
              {row.cells.map((cell, index) => (
                <span
                  key={index}
                  className="h-5 rounded-[4px] border border-[var(--border)]"
                  style={{
                    background: cell ? row.color : "transparent",
                    boxShadow: cell ? `inset 3px 0 0 ${tone[cell]}` : undefined,
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="space-y-2 border-t border-[var(--border)] px-4 py-3">
        {[
          ["습지 식생 조사 용역", 72],
          ["탐방로 정비 공사", 45],
          ["생태 모니터링 보고서", 90],
        ].map(([title, value]) => (
          <div key={title as string}>
            <div className="mb-1 flex justify-between text-[11px]">
              <span className="text-[var(--text-muted)]">{title}</span>
              <span className="font-semibold text-[var(--accent)]">{value}%</span>
            </div>
            <div className="tb-progress">
              <span style={{ width: `${value}%`, background: "var(--accent)" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AuthScreen({ auth, message, onAuth, onEnter, onBack }: AuthScreenProps) {
  const [mode, setMode] = useState<Mode>("login");
  const [loginId, setLoginId] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [joinWorkspaceId, setJoinWorkspaceId] = useState("");
  const [joinPassword, setJoinPassword] = useState("");
  const [joinName, setJoinName] = useState("");
  const [panel, setPanel] = useState<"" | "create" | "password">("");
  const [newYear, setNewYear] = useState(() => String(new Date().getFullYear()));
  const [newTeam, setNewTeam] = useState("");
  const [newBoardPassword, setNewBoardPassword] = useState("");
  const [copyPrevious, setCopyPrevious] = useState(false);
  const [previousPassword, setPreviousPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");

  const user = auth?.user ?? null;
  const boards = useMemo(() => auth?.boards ?? [], [auth]);
  const pending = auth?.pending ?? [];

  useEffect(() => {
    if (!user) {
      return;
    }
    let cancelled = false;
    void fetch("/api/tasks?workspaces=1", { cache: "no-store" })
      .then((response) => response.json() as Promise<{ workspaces?: WorkspaceSummary[] }>)
      .then((data) => {
        if (!cancelled) {
          setWorkspaces(data.workspaces ?? []);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [user]);

  const joinable = useMemo(
    () =>
      workspaces.filter(
        (workspace) => !boards.some((board) => board.workspaceId === workspace.id)
      ),
    [workspaces, boards]
  );
  const joinTarget =
    joinable.find((workspace) => workspace.id === joinWorkspaceId) ?? joinable[0] ?? null;

  async function run<T extends AuthResponse>(
    path: string,
    body: object,
    after?: (data: T) => void
  ) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { ok, data } = await postJson<T>(path, body);
      if (!ok) {
        throw new Error(data.error ?? "요청을 처리하지 못했습니다.");
      }
      after?.(data);
      return data;
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "요청을 처리하지 못했습니다.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function submitAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (mode === "signup" && password !== passwordConfirm) {
      setError("비밀번호 확인이 일치하지 않습니다.");
      return;
    }

    await run<AuthResponse>(
      "/api/auth",
      mode === "login"
        ? { action: "login", loginId, password }
        : { action: "signup", loginId, name, password },
      (data) => {
        setPassword("");
        setPasswordConfirm("");
        onAuth(data);
      }
    );
  }

  async function logout() {
    await run<AuthResponse>("/api/auth", { action: "logout" }, () => onAuth({ user: null }));
  }

  async function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!joinTarget) {
      return;
    }
    await run<AuthResponse>(
      "/api/auth",
      {
        action: "join",
        workspaceId: joinTarget.id,
        workspacePassword: joinPassword,
        name: joinName || user?.name,
      },
      (data) => {
        setJoinPassword("");
        onAuth(data);
        if (data.joined) {
          onEnter(joinTarget.id);
        } else if (data.requested) {
          setNotice(`'${joinTarget.label}' 가입을 신청했습니다. 부서장이 승인하면 입장할 수 있습니다.`);
        }
      }
    );
  }

  async function cancelJoin(workspaceId: string) {
    await run<AuthResponse>("/api/auth", { action: "cancel-join", workspaceId }, onAuth);
  }

  async function createBoard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = await run<AuthResponse & { workspace?: WorkspaceSummary }>(
      "/api/tasks",
      {
        action: "create-workspace",
        departmentName: newYear,
        teamName: newTeam,
        newWorkspacePassword: newBoardPassword,
        copyPreviousYear: copyPrevious,
        sourceWorkspacePassword: previousPassword,
      }
    );
    if (data?.workspace) {
      const refreshed = await fetch("/api/auth", { cache: "no-store" }).then((response) =>
        response.json()
      );
      onAuth(refreshed as AuthResponse);
      onEnter(data.workspace.id);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run<AuthResponse>(
      "/api/auth",
      { action: "change-password", currentPassword, newPassword: nextPassword },
      () => {
        setCurrentPassword("");
        setNextPassword("");
        setPanel("");
        setNotice("비밀번호를 변경했습니다. 다른 기기의 로그인은 해제되었습니다.");
      }
    );
  }

  return (
    <main className="tb-landing relative min-h-dvh overflow-hidden">
      <div aria-hidden="true" className="tb-landing-dots" />
      <div className="relative mx-auto grid max-w-[1180px] gap-8 px-4 pb-10 pt-7 sm:px-6 lg:grid-cols-[minmax(0,1fr)_448px] lg:gap-x-16 lg:gap-y-10 lg:px-8 lg:pt-14">
        <header className="lg:col-start-1 lg:row-start-1">
          <div className="flex items-center gap-2.5">
            <CompassMark size={36} />
            <div className="leading-tight">
              <div className="text-lg font-bold tracking-tight">{BRAND.name}</div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-faint)]">
                {BRAND.english}
              </div>
            </div>
          </div>
          <h1 className="mt-7 text-[30px] font-bold leading-[1.22] tracking-tight sm:text-[42px] lg:mt-12 lg:text-[48px]">
            팀의 업무 흐름과
            <br />
            <span className="tb-landing-highlight">하루의 기록</span>을 한 곳에서
          </h1>
          <p className="mt-4 max-w-[540px] text-[15px] leading-7 text-[var(--text-muted)]">
            단계별 진행 보드로 업무가 어디까지 왔는지 함께 보고, 매일의 업무일지를 쓰고
            결재받고, 주간·월간·연간 보고서까지 바로 인쇄합니다.
          </p>
        </header>

        <section
          aria-label={user ? "보드 선택" : "로그인"}
          className="w-full lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-center"
        >
        <div className="tb-card tb-landing-card space-y-4 p-5 sm:p-6">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              {user ? `${user.name}님, 반갑습니다` : mode === "login" ? "로그인" : "계정 만들기"}
            </h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              {user
                ? "입장할 연도/팀 보드를 선택해 주세요."
                : mode === "login"
                  ? "개인 아이디와 비밀번호로 들어갑니다."
                  : "가입 후 팀 보드에 가입을 신청하면 부서장이 승인합니다."}
            </p>
          </div>
          {message ? <Notice tone="info">{message}</Notice> : null}
          {error ? <Notice tone="error">{error}</Notice> : null}
          {notice ? <Notice tone="success">{notice}</Notice> : null}

          {!auth ? (
            <div className="py-6 text-center text-sm text-[var(--text-muted)]">불러오는 중…</div>
          ) : !user ? (
            <>
              <div className="tb-seg w-full" role="tablist">
                {(
                  [
                    ["login", "로그인"],
                    ["signup", "회원가입"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={mode === key}
                    data-active={mode === key}
                    onClick={() => {
                      setMode(key);
                      setError("");
                    }}
                    className="tb-seg-btn flex-1"
                  >
                    {label}
                  </button>
                ))}
              </div>
              <form onSubmit={submitAccount} className="grid gap-3">
                <label>
                  <span className="tb-label">아이디</span>
                  <input
                    value={loginId}
                    onChange={(event) => setLoginId(event.target.value)}
                    className="tb-field"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder="영문 소문자·숫자 3~32자"
                    required
                  />
                </label>
                {mode === "signup" ? (
                  <label>
                    <span className="tb-label">이름</span>
                    <input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      className="tb-field"
                      autoComplete="name"
                      placeholder="보드에 표시될 이름 (예: 김민지)"
                      maxLength={40}
                      required
                    />
                  </label>
                ) : null}
                <label>
                  <span className="tb-label">비밀번호</span>
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="tb-field"
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    placeholder={mode === "signup" ? "8자 이상" : ""}
                    required
                  />
                </label>
                {mode === "signup" ? (
                  <label>
                    <span className="tb-label">비밀번호 확인</span>
                    <input
                      type="password"
                      value={passwordConfirm}
                      onChange={(event) => setPasswordConfirm(event.target.value)}
                      className="tb-field"
                      autoComplete="new-password"
                      required
                    />
                  </label>
                ) : null}
                <button type="submit" disabled={busy} className="tb-btn tb-btn-primary">
                  {busy ? "처리 중…" : mode === "login" ? "로그인" : "가입하기"}
                </button>
                {mode === "signup" ? (
                  <p className="text-[11px] leading-4 text-[var(--text-faint)]">
                    가입 후 팀 보드에 가입을 신청하면 부서장이 승인합니다. 비밀번호를
                    잊으면 새 계정으로 신청하고 부서장에게 기존 구성원과 연결을 요청해
                    주세요.
                  </p>
                ) : null}
              </form>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] pb-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{user.name}</div>
                  <div className="truncate text-xs text-[var(--text-faint)]">@{user.loginId}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setPanel(panel === "password" ? "" : "password")}
                  className="tb-btn !px-3 !py-1.5 text-xs"
                >
                  비밀번호 변경
                </button>
                <button type="button" onClick={() => void logout()} className="tb-btn !px-3 !py-1.5 text-xs">
                  로그아웃
                </button>
              </div>

              {panel === "password" ? (
                <form onSubmit={changePassword} className="grid gap-2 rounded-[var(--radius)] border border-[var(--border)] p-3">
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    className="tb-field"
                    placeholder="현재 비밀번호"
                    autoComplete="current-password"
                    aria-label="현재 비밀번호"
                    required
                  />
                  <input
                    type="password"
                    value={nextPassword}
                    onChange={(event) => setNextPassword(event.target.value)}
                    className="tb-field"
                    placeholder="새 비밀번호 (8자 이상)"
                    autoComplete="new-password"
                    aria-label="새 비밀번호"
                    required
                  />
                  <button type="submit" disabled={busy} className="tb-btn tb-btn-primary">
                    변경
                  </button>
                </form>
              ) : null}

              <div>
                <span className="tb-label">내 보드</span>
                {boards.length ? (
                  <div className="grid gap-2">
                    {boards.map((board) => (
                      <button
                        key={board.workspaceId}
                        type="button"
                        disabled={!board.active}
                        onClick={() => onEnter(board.workspaceId)}
                        className="flex w-full items-center gap-2 rounded-[calc(var(--radius)-2px)] border border-[var(--border)] px-3 py-2.5 text-left text-sm transition hover:border-[var(--accent-border)] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{board.label}</span>
                          <span className="block truncate text-xs text-[var(--text-faint)]">
                            {board.memberName}
                            {board.active ? "" : " · 비활성화됨"}
                          </span>
                        </span>
                        <span
                          className={`tb-badge ${board.accessRole === "manager" ? "tb-badge-complete" : "tb-badge-muted"}`}
                        >
                          {board.accessRole === "manager" ? "부서장" : "구성원"}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-[var(--text-muted)]">
                    아직 가입한 보드가 없습니다. 아래에서 팀 보드에 가입을 신청해 주세요.
                  </p>
                )}
              </div>

              {pending.length ? (
                <div>
                  <span className="tb-label">승인 대기 중</span>
                  <div className="grid gap-2">
                    {pending.map((entry) => (
                      <div
                        key={entry.workspaceId}
                        className="flex items-center gap-2 rounded-[calc(var(--radius)-2px)] border border-dashed border-[var(--border-strong)] px-3 py-2 text-sm"
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {entry.label} <span className="text-[var(--text-faint)]">· {entry.name}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => void cancelJoin(entry.workspaceId)}
                          className="tb-btn !px-2.5 !py-1 text-xs"
                        >
                          신청 취소
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {joinable.length ? (
                <form onSubmit={join} className="grid gap-2 border-t border-[var(--border)] pt-3">
                  <span className="tb-label">보드 가입 신청</span>
                  <select
                    value={joinTarget?.id ?? ""}
                    onChange={(event) => setJoinWorkspaceId(event.target.value)}
                    className="tb-field"
                    aria-label="가입할 보드"
                  >
                    {joinable.map((workspace) => (
                      <option key={workspace.id} value={workspace.id}>
                        {workspace.label}
                      </option>
                    ))}
                  </select>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input
                      type="password"
                      value={joinPassword}
                      onChange={(event) => setJoinPassword(event.target.value)}
                      className="tb-field"
                      placeholder="보드 가입 암호"
                      aria-label="보드 가입 암호"
                      autoComplete="off"
                    />
                    <input
                      value={joinName}
                      onChange={(event) => setJoinName(event.target.value)}
                      className="tb-field"
                      placeholder={`표시 이름 (기본: ${user.name})`}
                      aria-label="보드에서 쓸 이름"
                      maxLength={40}
                    />
                  </div>
                  <button type="submit" disabled={busy || !joinTarget} className="tb-btn">
                    가입 신청
                  </button>
                  <p className="text-[11px] leading-4 text-[var(--text-faint)]">
                    보드 가입 암호는 부서장에게 받으세요. 부서장이 없는 보드는 첫 가입자가
                    부서장이 됩니다.
                  </p>
                </form>
              ) : null}

              <div className="border-t border-[var(--border)] pt-3">
                <button
                  type="button"
                  onClick={() => setPanel(panel === "create" ? "" : "create")}
                  className="text-sm font-semibold text-[var(--accent)] hover:underline"
                  aria-expanded={panel === "create"}
                >
                  {panel === "create" ? "▾" : "▸"} 새 연도/팀 보드 만들기
                </button>
                {panel === "create" ? (
                  <form onSubmit={createBoard} className="mt-2 grid gap-2">
                    <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-2">
                      <input
                        value={newYear}
                        onChange={(event) => setNewYear(event.target.value)}
                        className="tb-field"
                        placeholder="연도"
                        aria-label="연도"
                        required
                      />
                      <input
                        value={newTeam}
                        onChange={(event) => setNewTeam(event.target.value)}
                        className="tb-field"
                        placeholder="조직/팀명"
                        aria-label="조직/팀명"
                        required
                      />
                    </div>
                    <input
                      type="password"
                      value={newBoardPassword}
                      onChange={(event) => setNewBoardPassword(event.target.value)}
                      className="tb-field"
                      placeholder="보드 가입 암호 (4자 이상, 팀원에게 공유)"
                      aria-label="보드 가입 암호"
                      autoComplete="off"
                      required
                    />
                    <label className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                      <input
                        type="checkbox"
                        checked={copyPrevious}
                        onChange={(event) => setCopyPrevious(event.target.checked)}
                        className="h-4 w-4 accent-[var(--accent)]"
                      />
                      전년도 같은 팀 업무·구성원 복사
                    </label>
                    {copyPrevious ? (
                      <input
                        type="password"
                        value={previousPassword}
                        onChange={(event) => setPreviousPassword(event.target.value)}
                        className="tb-field"
                        placeholder="전년도 보드 가입 암호"
                        aria-label="전년도 보드 가입 암호"
                        autoComplete="off"
                      />
                    ) : null}
                    <button type="submit" disabled={busy} className="tb-btn tb-btn-primary">
                      만들고 부서장으로 입장
                    </button>
                  </form>
                ) : null}
              </div>

              {onBack ? (
                <button type="button" onClick={onBack} className="tb-btn w-full">
                  ← 보드로 돌아가기
                </button>
              ) : null}
            </>
          )}
        </div>
        </section>

        <section aria-label="주요 기능" className="lg:col-start-1 lg:row-start-2">
          <ul className="grid gap-3 sm:grid-cols-2">
            {FEATURES.map((feature) => (
              <li key={feature.title} className="tb-landing-feature flex gap-3">
                <FeatureIcon path={feature.icon} />
                <div>
                  <div className="text-sm font-semibold">{feature.title}</div>
                  <p className="mt-0.5 text-[13px] leading-5 text-[var(--text-muted)]">{feature.body}</p>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-6">
            <ProductPreview />
          </div>
        </section>
      </div>
      <footer className="relative pb-6 text-center text-xs text-[var(--text-faint)]">
        {BRAND.name} · {BRAND.tagline}
      </footer>
    </main>
  );
}
