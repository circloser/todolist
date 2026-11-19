"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { BRAND, CompassMark } from "./brand";
import CompassArt from "./compass-art";
import ManualContent, { MANUAL_SECTIONS, revealManualSection } from "./manual-content";
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

// Print only the manual (the rest of the landing is hidden by print CSS).
function printManual() {
  document.body.classList.add("tb-printing-manual");
  const cleanup = () => {
    document.body.classList.remove("tb-printing-manual");
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  window.setTimeout(() => {
    window.print();
    window.setTimeout(cleanup, 1000);
  }, 0);
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
    <main className="tb-landing relative min-h-dvh overflow-x-hidden">
      <section className="relative grid lg:min-h-dvh lg:grid-cols-[minmax(0,1.12fr)_minmax(440px,0.88fr)]">
        <div className="tb-hero-art relative flex flex-col overflow-hidden px-5 pb-6 pt-5 text-white sm:px-8 sm:pb-10 sm:pt-6 lg:px-14 lg:py-12">
          <div className="relative z-10 flex items-center gap-2.5">
            <CompassMark size={34} className="rounded-[9px] ring-1 ring-white/25" />
            <div className="leading-tight">
              <div className="text-base font-bold tracking-tight">{BRAND.name}</div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/55">
                {BRAND.english}
              </div>
            </div>
            <a
              href="#manual"
              className="ml-auto rounded-full border border-white/25 px-3.5 py-1.5 text-xs font-semibold text-white/85 transition hover:border-white/60 hover:text-white"
            >
              사용자 매뉴얼
            </a>
          </div>

          <div className="relative hidden flex-1 items-center justify-center py-5 sm:flex lg:py-6">
            <CompassArt className="h-auto w-[min(56vw,220px)] sm:w-[300px] lg:w-[min(40vw,50vh,520px)]" />
          </div>

          <div className="relative z-10 mt-6 sm:mt-0">
            <p className="text-[12px] font-semibold tracking-[0.18em] text-[#a7f0e0]">
              진행 · 일정 · 회의록 · 일지 · 보고서
            </p>
            <h1 className="mt-1.5 text-[26px] font-bold leading-[1.18] tracking-tight sm:mt-2 sm:text-[36px] lg:text-[44px]">
              팀의 방향을, 한눈에.
            </h1>
            <p className="mt-2 max-w-[460px] text-[14px] leading-6 text-white/70 sm:mt-3 sm:text-[15px]">
              업무 진행부터 일정·회의록·업무일지·보고서까지, {BRAND.name} 하나로.
            </p>
          </div>
        </div>

        <div className="tb-hero-side relative flex items-start justify-center px-4 pb-8 pt-0 sm:items-center sm:px-8 sm:py-10 lg:py-12">
          <section aria-label={user ? "보드 선택" : "로그인"} className="relative -mt-3 w-full max-w-[420px] sm:mt-0">
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
          {!user ? (
            <p className="border-t border-[var(--border)] pt-3 text-center text-xs text-[var(--text-muted)]">
              처음이신가요?{" "}
              <a href="#manual-start" className="font-semibold text-[var(--accent)] hover:underline">
                시작 안내 보기
              </a>
            </p>
          ) : null}
        </div>
          </section>
        </div>
      </section>

      <section
        id="manual"
        aria-labelledby="manual-title"
        className="tb-landing-manual relative mx-auto max-w-[1180px] scroll-mt-4 px-4 pb-10 sm:px-6 sm:pb-14 lg:px-8"
      >
        <div className="tb-no-print mb-4 flex flex-wrap items-end justify-between gap-3 border-t border-[var(--border)] pt-7 sm:mb-6 sm:pt-10">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
              User guide
            </p>
            <h2 id="manual-title" className="mt-1 text-xl font-bold tracking-tight sm:text-[28px]">
              사용자 매뉴얼
            </h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              처음 쓰는 분은 &lsquo;처음 시작하기&rsquo;부터 읽어 보세요. 로그인하지 않아도 볼 수
              있습니다.
            </p>
          </div>
          <button type="button" onClick={printManual} className="tb-btn hidden sm:inline-flex">
            🖨 매뉴얼 인쇄
          </button>
        </div>
        <div className="grid gap-6 lg:grid-cols-[230px_minmax(0,1fr)]">
          <nav aria-label="매뉴얼 목차" className="tb-no-print hidden lg:sticky lg:top-6 lg:block lg:self-start">
            <ul className="flex flex-wrap gap-1.5 lg:flex-col lg:gap-0.5">
              {MANUAL_SECTIONS.map((section) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    onClick={(event) => {
                      event.preventDefault();
                      revealManualSection(section.id);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-xs text-[var(--text-muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] lg:flex lg:rounded-[var(--radius)] lg:border-transparent lg:bg-transparent lg:py-1.5 lg:text-[13px]"
                  >
                    <span aria-hidden="true">{section.icon}</span>
                    {section.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div id="manual-print" className="tb-card min-w-0 px-4 py-3 shadow-[var(--shadow-md)] sm:px-7 sm:py-5">
            <ManualContent />
          </div>
        </div>
      </section>

      <footer className="relative pb-6 text-center text-xs text-[var(--text-faint)]">
        {BRAND.name} · {BRAND.tagline}
      </footer>
    </main>
  );
}
