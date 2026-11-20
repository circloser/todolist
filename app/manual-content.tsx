"use client";

import { useEffect, useRef } from "react";

// 사용자 매뉴얼 본문. 랜딩 페이지(로그인 전)와 보드 안의 매뉴얼 모달에서 함께
// 렌더링된다. 항목은 접어 두고(누르면 펼침), 목차·검색·#manual-… 링크로 가면
// 그 항목이 펼쳐지며, 인쇄할 때는 모두 펼친다.

export const MANUAL_SECTIONS = [
  { id: "manual-start", icon: "🧭", title: "처음 시작하기" },
  { id: "manual-account", icon: "🔐", title: "계정, 보드 가입과 권한" },
  { id: "manual-screen", icon: "🚀", title: "기본 화면" },
  { id: "manual-hierarchy", icon: "📂", title: "업무 위계와 목록" },
  { id: "manual-items", icon: "📋", title: "업무 추가·수정·삭제" },
  { id: "manual-steps", icon: "✅", title: "진행 단계와 체크리스트" },
  { id: "manual-templates", icon: "🧩", title: "업무 유형·단계 관리" },
  { id: "manual-dashboard", icon: "📊", title: "대시보드" },
  { id: "manual-calendar", icon: "🗓", title: "업무일정 (달력)" },
  { id: "manual-minutes", icon: "🗒", title: "회의록과 미참석자 확인" },
  { id: "manual-map", icon: "🗺", title: "지도·장소·구역(면적)" },
  { id: "manual-gantt", icon: "📅", title: "간트" },
  { id: "manual-search", icon: "🔍", title: "통합 검색" },
  { id: "manual-filter", icon: "🔎", title: "필터·검색·정렬" },
  { id: "manual-alerts", icon: "🔔", title: "알림 (일정·회의록·마감)" },
  { id: "manual-monthly", icon: "📄", title: "월간 보고서" },
  { id: "manual-members", icon: "👥", title: "구성원 관리" },
  { id: "manual-worklog", icon: "📝", title: "업무일지와 승인" },
  { id: "manual-views", icon: "🗂", title: "업무일지 모아보기" },
  { id: "manual-reports", icon: "🖨", title: "업무일지 리포트와 인쇄" },
  { id: "manual-options", icon: "⚙️", title: "운영 옵션 (부서장)" },
  { id: "manual-forms", icon: "📎", title: "기안문·공용 양식함" },
  { id: "manual-faq", icon: "❓", title: "자주 묻는 질문" },
  { id: "manual-tips", icon: "💡", title: "운영 팁" },
] as const;

type SectionId = (typeof MANUAL_SECTIONS)[number]["id"];

function Section({ id, children }: { id: SectionId; children: React.ReactNode }) {
  const meta = MANUAL_SECTIONS.find((section) => section.id === id)!;
  return (
    <section id={id} className="tb-manual-section scroll-mt-4 border-b border-[var(--border)] last:border-b-0">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-2 py-3 [&::-webkit-details-marker]:hidden">
          <h3 className="flex flex-1 items-center gap-2 text-[15px] font-bold">
            <span aria-hidden="true">{meta.icon}</span>
            {meta.title}
          </h3>
          <span
            aria-hidden="true"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[var(--text-faint)] transition group-open:rotate-180 group-hover:bg-[var(--surface-3)]"
          >
            ▾
          </span>
        </summary>
        <div className="space-y-2 pb-4 text-[14px] leading-[1.7] text-[var(--text-muted)] sm:text-[13px] sm:leading-6">{children}</div>
      </details>
    </section>
  );
}

/** Opens (and scrolls to) a manual section wherever the manual is shown. */
export function revealManualSection(id: string, scroll = true) {
  let target: HTMLElement | null = null;
  document.querySelectorAll<HTMLElement>(`section[id="${CSS.escape(id)}"]`).forEach((section) => {
    const details = section.querySelector("details");
    if (details) {
      details.open = true;
    }
    if (section.offsetParent !== null && !target) {
      target = section;
    }
  });
  if (scroll && target) {
    (target as HTMLElement).scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function setAllSections(root: HTMLElement | null, open: boolean) {
  root?.querySelectorAll<HTMLDetailsElement>(".tb-manual-section details").forEach((details) => {
    details.open = open;
  });
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <span className="mx-0.5 inline-flex items-center rounded-md border border-[var(--border-strong)] bg-[var(--surface-2)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--text)]">
      {children}
    </span>
  );
}

function Who({ manager }: { manager?: boolean }) {
  return (
    <span
      className={`ml-1 inline-flex rounded-full px-1.5 py-px align-middle text-[10px] font-semibold ${
        manager
          ? "bg-[var(--complete-soft)] text-[var(--complete)]"
          : "bg-[var(--accent-soft)] text-[var(--accent)]"
      }`}
    >
      {manager ? "부서장" : "구성원"}
    </span>
  );
}

function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="ml-1 list-none space-y-1.5">
      {items.map((item, index) => (
        <li key={index} className="flex gap-2">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[11px] font-bold text-white">
            {index + 1}
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ol>
  );
}

export default function ManualContent() {
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Links to a section (#manual-…) open it; printing opens everything.
  useEffect(() => {
    const root = rootRef.current;
    const onClick = (event: MouseEvent) => {
      const link = (event.target as HTMLElement | null)?.closest<HTMLAnchorElement>('a[href^="#manual-"]');
      if (link) {
        revealManualSection(link.getAttribute("href")!.slice(1), false);
      }
    };
    const onPrint = () => setAllSections(root, true);
    document.addEventListener("click", onClick, true);
    window.addEventListener("beforeprint", onPrint);
    if (window.location.hash.startsWith("#manual-")) {
      revealManualSection(window.location.hash.slice(1));
    }
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("beforeprint", onPrint);
    };
  }, []);

  return (
    <div ref={rootRef} className="space-y-3">
      <div className="tb-no-print flex items-center justify-end gap-3 text-xs">
        <span className="mr-auto text-[var(--text-faint)]">항목을 누르면 펼쳐집니다</span>
        <button type="button" className="font-semibold text-[var(--accent)] hover:underline" onClick={() => setAllSections(rootRef.current, true)}>
          모두 펼치기
        </button>
        <button type="button" className="font-semibold text-[var(--accent)] hover:underline" onClick={() => setAllSections(rootRef.current, false)}>
          모두 접기
        </button>
      </div>
      <div className="rounded-[var(--radius)] bg-[var(--accent-soft)] p-4 text-[13px] leading-6 text-[var(--text-muted)]">
        <strong className="text-[var(--text)]">업무나침반</strong>은 팀 업무를{" "}
        <strong>업무 위계</strong>로 묶고 업무 유형별 <strong>진행 단계</strong>를 순서대로
        체크하며, 팀이 함께 보는 <strong>업무일정</strong>(달력)과{" "}
        <strong>회의록</strong>(미참석자 확인), 매일의 <strong>업무일지</strong>와 부서장{" "}
        <strong>결재</strong>, <strong>개인·팀·연간 보고서</strong>까지 한 곳에서 관리하는 팀
        업무 플랫폼입니다. 모든 사용자는 개인 계정으로 로그인하고, 본인 업무와 본인 일지만
        수정합니다.
      </div>

      <Section id="manual-start">
        <p className="font-semibold text-[var(--text)]">
          부서장
          <Who manager />
        </p>
        <Steps
          items={[
            <>
              첫 화면에서 <Key>회원가입</Key>으로 계정을 만듭니다.
            </>,
            <>
              <Key>보드 가입 신청</Key>에서 우리 팀 보드를 고르고 보드 가입 암호를 넣습니다.
              부서장이 아직 없는 보드는 <strong>첫 가입자가 부서장</strong>이 되므로, 팀원보다
              먼저 가입해 주세요. 새 보드가 필요하면 <Key>새 연도/팀 보드 만들기</Key>로 만들면
              바로 부서장이 됩니다.
            </>,
            <>
              팀원에게 사이트 주소와 <strong>보드 가입 암호</strong>를 알려 줍니다.
            </>,
            <>
              <Key>메뉴</Key> → <Key>구성원</Key>에 가입 신청이 오면 승인합니다(메뉴 버튼에 신청
              건수가 표시됩니다). 기존에 담당자로 쓰던 이름이
              있으면 <Key>기존 구성원에 연결</Key>을 골라야 그 업무를 이어서 수정할 수
              있습니다.
            </>,
            <>
              상단 <Key>⚙ 설정</Key> → <Key>운영 옵션</Key>에서 일지 열람 범위, 승인 절차 등을
              정하고, 필요하면 <Key>알림 웹훅</Key>에 Slack·Discord 웹훅을 등록해 마감 알림을
              켭니다.
            </>,
          ]}
        />
        <p className="pt-2 font-semibold text-[var(--text)]">
          구성원
          <Who />
        </p>
        <Steps
          items={[
            <>
              <Key>회원가입</Key> 후 <Key>보드 가입 신청</Key>에서 팀 보드와 부서장에게 받은
              가입 암호를 넣습니다. 보드에서 쓸 이름은 기존 담당자 이름과 똑같이 적으면
              부서장이 연결하기 쉽습니다.
            </>,
            <>부서장이 승인하면 보드에 들어갈 수 있습니다. 이후에는 로그인하면 바로 들어갑니다.</>,
            <>
              내 담당 업무의 단계를 체크하고, 일정은 <Key>업무일정</Key>에 올려 팀과
              공유합니다. 참석하지 못한 회의는 <Key>회의록</Key>을 읽고 확인을 누르고, 하루 일을
              마치면 <Key>업무일지</Key>를 써서 제출합니다.
            </>,
          ]}
        />
      </Section>

      <Section id="manual-account">
        <p>
          아이디는 영문 소문자·숫자 3~32자, 비밀번호는 8자 이상이며 아이디를 포함할 수
          없습니다. 로그인 상태는 30일 동안 유지되고, 마지막으로 연 보드로 바로 들어갑니다.
          로그인을 5번 연속 틀리면 10분간 잠깁니다.
        </p>
        <p>
          <strong>구성원</strong>은 보드 전체를 볼 수 있지만, 수정은 본인이 담당자인
          업무(단계·세부 체크리스트 포함)와 본인 업무일지만 할 수 있습니다. 다른 사람의 업무는
          &lsquo;보기 전용&rsquo;으로 표시되고 입력칸이 잠깁니다.
        </p>
        <p>
          <strong>부서장</strong>은 모든 업무를 수정·배정하고 업무 위계, 업무 유형·단계, 보드
          설정, 알림 웹훅, 구성원·가입 승인, 운영 옵션을 관리하며 업무일지를 승인·반려합니다.
          다른 구성원을 부서장으로 지정할 수 있지만 본인의 권한은 해제할 수 없어 항상 한 명
          이상의 부서장이 남습니다.
        </p>
        <p>
          <strong>해가 바뀌어도 같은 보드를 계속 쓰면 됩니다.</strong> 모든 단계가 완료된 업무는
          해가 바뀌면 완료한 연도의 <Key>📦 보관함</Key> 폴더(예: 2026년)로 자동으로 옮겨져 목록·대시보드·
          달력·지도·간트에서 빠지고, 진행 중인 업무는 그대로 남아 이어서 진행합니다. 보관함은{" "}
          <Key>메뉴</Key> → <Key>보관함</Key> 또는 목록 위의 <Key>📦 보관함 N</Key>에서 열며,
          연도 폴더 안에서 분류별로 보고, 검색하고, 업무를 눌러 단계별 완료일을 확인합니다.
          다시 진행할 업무는 <Key>목록으로 복원</Key>을 누르면 목록으로 돌아오고, 복원한 업무는 다시
          자동 보관되지 않습니다. 부서장은 언제든 직접 보관할 수도 있습니다: 목록에서 업무 오른쪽의{" "}
          <Key>📦</Key>(끝나지 않은 업무도 가능, 확인 후 옮김), 또는 분류 제목 줄의 <Key>📦</Key>로{" "}
          <strong>대분류(하위 분류 포함)·중분류 전체</strong>를 한 번에 옮깁니다. 완료된 업무는 완료한
          연도, 진행 중인 업무는 올해 폴더에 들어가며, 보관함에서 업무별 <Key>목록으로 복원</Key> 또는{" "}
          <Key>이 분류 모두 복원</Key>으로 되돌립니다. 보관과 복원은 <strong>부서장</strong>만 할 수
          있고, 구성원은 보관함을 열어 볼 수 있습니다. 통합 검색은 보관된 업무도 찾아 줍니다.
          일정·회의록·업무일지는 날짜로 쌓이므로 그대로 남습니다.
        </p>
        <p>
          연도별로 보드를 아예 나누고 싶다면 새 연도 보드를 만들 때 <Key>전년도 같은 팀 업무·구성원 복사</Key>를 고르면 업무·단계·
          체크리스트·색상·그룹 설정, 운영 옵션과 구성원(계정·권한 포함)이 복사됩니다.
          업무일지는 복사되지 않습니다. 비밀번호는 첫 화면의 <Key>비밀번호 변경</Key>에서
          바꾸며, 바꾸면 다른 기기의 로그인은 해제됩니다.
        </p>
      </Section>

      <Section id="manual-screen">
        <p>
          상단 첫 줄에는 보드 제목과 연도·팀, 전체 진행률(넓은 화면), 그리고 오른쪽에{" "}
          <Key>🔍 검색</Key> <Key>🔔 알림</Key> <Key>⚙ 설정</Key>(부서장) <Key>☰ 메뉴</Key>{" "}
          <Key>내 이름</Key> 버튼이 있습니다. <Key>메뉴</Key>에는 구성원, 양식함, 월간 보고서,
          업무 유형·단계(부서장), 변경 이력, 사용자 매뉴얼이 있고, <Key>내 이름</Key>에는
          보드 전환·계정과 로그아웃이 있습니다. 둘째 줄의 탭으로 화면을
          바꿉니다: <Key>대시보드</Key> <Key>목록</Key> <Key>업무일정</Key> <Key>회의록</Key>{" "}
          <Key>업무일지</Key> <Key>지도</Key> <Key>간트</Key>. 보드에 들어오면{" "}
          <strong>대시보드</strong>가 첫 화면이고, 업무 입력은 <strong>목록</strong>에서 하는
          것이 가장 편합니다(목록은 대분류가 접힌 상태로 열립니다).
        </p>
        <p>
          탭 옆 숫자는 확인할 것이 있다는 뜻입니다: 업무일정은 오늘 일정과 다른 구성원이 새로
          올린 일정, 회의록은 내가 아직 확인하지 않은 회의록, 업무일지는 승인 대기(부서장) 건수.
          목록 검색·필터 줄은 <strong>목록·간트</strong>에서만 보입니다(지도는 지도 안의 검색창을
          씁니다). 어느 화면에서든 상단의{" "}
          <Key>🔍</Key> 검색(단축키 <Key>Ctrl</Key>+<Key>K</Key>)으로 보드 전체를 찾을 수 있습니다.
        </p>
        <p>
          <Key>메뉴</Key> → <Key>변경 이력</Key>에서 보드에서 일어난 일을 종류별(업무·업무일지·
          업무일정·회의록·구성원·설정)로 거르고 검색해 볼 수 있습니다. 작성자는 로그인한 구성원
          이름으로 자동 기록됩니다. 보드 제목·조직명·연도/팀은 부서장이 <Key>⚙ 설정</Key> →{" "}
          <Key>보드</Key>에서 바꿉니다.
        </p>
      </Section>

      <Section id="manual-hierarchy">
        <p>
          목록은 <strong>업무 위계</strong> 기준으로 묶입니다. <strong>복원사업 &gt; 현장조사
          &gt; 식생</strong>처럼 입력하면 대분류·중분류·소분류 깊이에 따라 들여쓰기와 라벨이
          달라집니다. 구분자는 <Key>&gt;</Key> <Key>/</Key> <Key>|</Key> <Key>›</Key>{" "}
          <Key>→</Key> <Key>·</Key>를 쓸 수 있고, 비워 두면 <strong>미분류</strong>입니다.
        </p>
        <p>
          목록은 <strong>대분류가 모두 접힌 상태</strong>로 열립니다. 대분류 이름이나{" "}
          <Key>▸</Key>를 누르면 그 아래 중분류·소분류와 업무가 펼쳐지고, 위쪽의{" "}
          <Key>모두 펼치기</Key> <Key>모두 접기</Key>로 한 번에 바꿉니다. 검색어를 넣거나
          필터를 고르면 결과가 보이도록 자동으로 펼쳐지고, 검색을 지우면 다시 접힙니다.
          대시보드·업무일정·알림에서 업무를 누르면 그 업무가 있는 분류가 펼쳐집니다.
        </p>
        <p>
          접혀 있어도 대분류 줄에서 한눈에 볼 수 있습니다: 하위 분류까지 합친{" "}
          <strong>완료/전체 업무 수</strong>와 <strong>진행률</strong>, 업무가 많은 순서의{" "}
          <strong>담당자</strong>(세 명까지, 나머지는 &lsquo;외 N명&rsquo;), 편성 예산을 합친{" "}
          <strong>총 예산</strong>과 소요 예산 합계. 담당자나 예산 위에 마우스를 올리면 사람별
          건수와 편성·소요 예산이 모두 나옵니다.
        </p>
        <p>
          그룹 헤더의 <Key>＋ 업무</Key>로 그 그룹에 새 업무를 추가합니다(구성원은 본인 담당으로
          만들어지며, 부서장이 운영 옵션에서 막을 수 있습니다). 그룹 이름 수정 <Key>✎</Key>,
          대분류 삭제 <Key>×</Key>, 그룹 순서 드래그, <Key>＋ 대분류</Key> 추가는 부서장만
          합니다.
          <Who manager />
        </p>
        <p>
          업무 카드 왼쪽 <Key>⋮⋮</Key> 핸들을 끌어 순서를 바꾸거나 다른 그룹으로 옮길 수
          있습니다. 구성원은 본인 담당 업무만 옮길 수 있습니다.
        </p>
      </Section>

      <Section id="manual-items">
        <p>
          업무 추가 시 <strong>유형</strong>, 업무명, 담당자, 최종 마감일을 입력합니다. 유형을
          고르면 그 유형의 진행 단계가 자동으로 만들어집니다. 구성원이 만든 업무의 담당자는
          항상 본인이며, <strong>담당자 변경은 부서장</strong>만 합니다.
        </p>
        <p>
          업무 행을 누르면 상세가 펼쳐져 업무명, 업무 위계, 유형, 마감일, 위치, 예산, 계약
          정보, 메모, 링크/자료를 수정합니다. 다른 사람의 업무는 펼쳐 볼 수만 있습니다.
        </p>
        <p>
          업무 오른쪽의 <Key>⧉</Key>는 복제, <Key>×</Key>는 삭제입니다. 복제할 때 일정 유지 또는
          초기화를 고르며 진행 상태는 초기화됩니다. 구성원의 업무 등록·삭제는 부서장의 운영
          옵션에 따라 허용되지 않을 수 있습니다.
        </p>
      </Section>

      <Section id="manual-steps">
        <p>
          진행 단계는 앞에서부터 순서대로만 완료할 수 있고, 완료를 해제하면 이후 단계도 함께
          해제됩니다. 각 단계의 <strong>목표일</strong>을 넣으면 D-일수가 표시되고, 업무가 100%
          완료되면 진행바가 <strong>파란색 완료</strong>로 바뀝니다.
        </p>
        <p>
          단계별 <Key>세부 체크리스트</Key>로 작은 할 일을 관리하고, 단계와 상관없는 항목은{" "}
          <strong>공통 체크리스트</strong>에 둡니다. 단계·체크리스트는 그 업무의 담당자와
          부서장만 체크할 수 있습니다.
        </p>
      </Section>

      <Section id="manual-templates">
        <p>
          기본 유형은 <strong>외부 학술/조사 용역</strong>, <strong>내부 자체 연구 및 현장
          조사</strong>, <strong>생태 복원 및 조성 공사</strong>, <strong>내부 일반 행정 및
          기획</strong> 4가지입니다.
        </p>
        <p>
          부서장은 <Key>메뉴</Key> → <Key>업무 유형·단계</Key>에서 유형을 만들고 단계명·그룹·설명·진도 기준과
          순서를 고칩니다. 유형을 고치면 그 유형을 쓰는 기존 업무에도 반영되며, 완료한 단계의
          상태와 목표일은 최대한 유지됩니다. 사용 중인 유형은 삭제할 수 없습니다.
          <Who manager />
        </p>
      </Section>

      <Section id="manual-dashboard">
        <p>
          보드에 들어오면 처음 보이는 화면입니다. 전체 진행률, <strong>다가오는 일정·회의록</strong>
          (확인할 회의록과 내 후속 조치 포함), 상태 분포, 담당자 워크로드, 유형별 업무, 다가오는
          마감, 예산 요약, 병목 단계, 지역 현황을 보여줍니다(최근 활동은 <Key>메뉴</Key> → <Key>변경 이력</Key>). 위젯을 누르면 관련 목록이나 지도로 이동하고,{" "}
          <Key>위젯</Key> 버튼으로 표시 항목을 고릅니다(브라우저별 저장).
        </p>
      </Section>

      <Section id="manual-calendar">
        <p>
          <Key>업무일정</Key>은 보드의 모든 구성원이 함께 보는 달력으로, 흔히 쓰는 달력 앱처럼
          씁니다. 보기는 <Key>일</Key> <Key>주</Key> <Key>월</Key> <Key>두 달</Key>{" "}
          <Key>일정 목록</Key>이며 마지막에 쓴 보기를 기억합니다. <Key>‹</Key> <Key>›</Key>로
          넘기고 <Key>오늘</Key>로 돌아옵니다. 날짜 숫자를 누르면 그날의 일 보기로 갑니다.
          일요일·공휴일은 빨강, 토요일은 파랑입니다.
        </p>
        <p>
          <strong>빠르게 추가</strong>: 월·두 달 보기에서 날짜 칸을 <strong>클릭</strong>하면 작은
          입력 창이 뜹니다. 제목을 쓰고 <Key>Enter</Key>로 저장합니다(종일/시간, 분류 선택).{" "}
          <strong>여러 날을 끌어서 선택</strong>하면 <Key>기간 일정 1개</Key>(예: 3일 출장) 또는{" "}
          <Key>날마다 N개</Key>(같은 일정을 날짜마다 따로)를 고를 수 있습니다.{" "}
          <Key>Ctrl</Key>(맥은 <Key>⌘</Key>)을 누른 채 떨어진 날짜들을 클릭해 고른 뒤{" "}
          <Key>선택한 날마다 일정 만들기</Key>로 한 번에 넣을 수도 있습니다(<Key>Shift</Key>+클릭은
          범위 추가). 주·일 보기에서는 <strong>시간 칸을 위아래로 끌어</strong> 그 시간대 일정을
          만듭니다. <Key>옵션 더보기</Key>를 누르면 장소·참석자·알림·메모까지 적는 전체 입력
          창이 열립니다.
        </p>
        <p>
          <strong>반복 일정</strong>: <Key>+ 만들기</Key>(전체 입력 창)의 <Key>반복</Key>에서 매일 ·
          평일마다 · 매주 · 2주마다 · 매월 같은 날을 고르고 횟수나 종료일을 정하면, 만들어질 날짜를
          미리 보여 주고 한 번에 저장합니다(한 번에 100개까지). 만들어진 일정은 각각 따로
          고치거나 지울 수 있습니다.
        </p>
        <p>
          <strong>옮기기·고치기</strong>: 일정을 <strong>끌어서 다른 날</strong>(주·일 보기에서는
          다른 시간)로 놓으면 바로 옮겨지고, 아래 알림의 <Key>되돌리기</Key>로 취소합니다. 주·일
          보기에서 일정의 <strong>아래 끝을 끌면</strong> 끝나는 시간이 바뀝니다. 일정을 누르면
          요약 카드가 뜨고 <Key>✎ 수정</Key> <Key>⧉ 복제</Key> <Key>🗑 삭제</Key>와 회의 일정의{" "}
          <Key>📝 회의록 작성</Key>(제목·날짜·시간·장소·참석자가 채워진 회의록)을 쓸 수 있습니다.
          여러 날 일정은 막대로 이어져 보이고, 칸에 다 안 들어가면 <Key>+N개</Key>를 눌러 그날의
          모든 일정을 봅니다. 주·일 보기의 빨간 선은 지금 시각입니다.
        </p>
        <p>
          분류는 회의·현장·출장·교육·휴가·마감·기타이며, 위쪽 분류 칩으로 원하는 것만 보이게
          합니다. <Key>업무 마감 표시</Key>를 켜 두면 업무의 다음 단계 마감과 최종 마감이 ⚑로 함께
          나옵니다(누르면 그 업무로 이동). 참석 구성원을 고르지 않으면 팀 전체 일정이고, 알림은
          시작할 때·10분·30분·1시간·하루 전 중에 고릅니다. 누구나 일정을 올릴 수 있고,{" "}
          <strong>옮기기·수정·삭제는 등록한 사람과 부서장</strong>만 합니다.
        </p>
        <p>
          <strong>단축키</strong>(입력 중이 아닐 때): <Key>T</Key> 오늘, <Key>J</Key>/<Key>K</Key>{" "}
          다음/이전, <Key>D</Key> 일, <Key>W</Key> 주, <Key>M</Key> 월, <Key>X</Key> 두 달,{" "}
          <Key>A</Key> 일정 목록, <Key>C</Key> 만들기, <Key>Esc</Key> 닫기.
        </p>
      </Section>

      <Section id="manual-minutes">
        <p>
          <Key>회의록</Key>에서 <Key>+ 새 회의록</Key>으로 작성합니다. 회의명, 날짜·시간,
          장소, <strong>참석자(구성원 중 한 명 이상 필수)</strong>, 외부 참석자, 안건, 회의
          내용, 결정 사항, 후속 조치(담당·기한)를 적습니다. 저장하면 보드의 모든 구성원이 볼 수
          있고, 수정·삭제는 작성자와 부서장만 합니다.
        </p>
        <p>
          참석자로 고르지 않은 구성원은 <strong>미참석자</strong>가 됩니다. 미참석자에게는
          알림과 &lsquo;확인 필요&rsquo; 표시가 뜨고, 회의록을 읽은 뒤{" "}
          <Key>✓ 회의 내용을 확인했습니다</Key>를 누르면 확인 시각이 기록됩니다(잘못 눌렀다면{" "}
          <Key>확인 취소</Key>). 회의록 화면의 <strong>미참석자 확인</strong> 칸에서 누가
          언제 확인했는지 모두 볼 수 있습니다. 회의록이 쓰인 뒤에 가입한 구성원에게는 확인을
          요청하지 않습니다.
        </p>
        <p>
          후속 조치는 담당자·작성자·부서장이 완료 체크합니다. 목록의 <Key>확인 필요</Key>{" "}
          <Key>내 회의</Key> <Key>내 할 일</Key>로 걸러 보고, <Key>인쇄</Key>로 결재란과
          미참석자 확인 표가 들어간 A4 회의록을 출력하거나 PDF로 저장합니다.
        </p>
      </Section>

      <Section id="manual-map">
        <p>
          <Key>지도</Key>는 일반 지도 앱처럼 씁니다. 끌어서 이동, 휠·두 손가락으로 확대하고, 오른쪽
          위에서 <Key>일반</Key> <Key>위성</Key> <Key>하이브리드</Key>를 바로 바꿉니다. 오른쪽 버튼은{" "}
          <Key>📌</Key> 장소 추가, <Key>⬠</Key> 구역 그리기, <Key>＋</Key> 업무 추가, <Key>◎</Key> 내 위치,{" "}
          <Key>⤢</Key> 모든 핀이 보이게, <Key>⚙</Key> 지도 설정(지도 제공자·API 키)입니다.
        </p>
        <p>
          <strong>지도를 더블클릭</strong>(또는 마우스 오른쪽 클릭, 휴대폰은{" "}
          <strong>길게 누르기</strong>)하면 그 자리에 <Key>여기에 장소 추가</Key>{" "}
          <Key>여기에 업무 추가</Key> <Key>여기서 구역 그리기</Key> <Key>좌표 복사</Key> <Key>여기로 확대</Key> 메뉴가 뜹니다.{" "}
          <Key>Esc</Key>로 메뉴나 위치 지정 모드를 취소합니다.
        </p>
        <p>
          왼쪽 목록(휴대폰은 위쪽, <Key>▾</Key>로 펼침)의 검색창은 이 보드의 업무·장소를 바로 찾고,{" "}
          <Key>Enter</Key>를 누르면 지명도 찾습니다. 지명 결과를 고르면 그 자리에 핀이 놓이고{" "}
          <Key>장소로 저장</Key> <Key>여기에 업무 추가</Key>를 할 수 있습니다. 목록은{" "}
          <strong>업무 · 장소 · 구역 · 미지정</strong> 탭으로 나뉘고, 이름을 누르면 지도에서 그 핀으로
          이동합니다. 업무 탭에서 각 업무 오른쪽의 <Key>◉</Key>를 누르면 그 업무의 핀만 끄고 켤 수
          있고(<Key>모두 표시</Key> <Key>모두 숨기기</Key>, 이 브라우저에 기억), 아래의{" "}
          <Key>업무 핀</Key> <Key>장소 핀</Key> <Key>구역</Key>으로 종류 전체를 켜고 끕니다.
        </p>
        <p>
          핀을 누르면 정보 카드가 열립니다. 업무 핀(색: <strong>녹색=진행</strong>,{" "}
          <strong>주황=임박</strong>, <strong>빨강=지연</strong>, <strong>파랑=완료</strong>, 숫자=진행률)은{" "}
          <Key>업무 열기</Key> <Key>위치 다시 지정</Key> <Key>핀 삭제</Key>, 장소 핀은 <Key>수정</Key>{" "}
          <Key>삭제</Key>, 모두 <Key>길찾기</Key>(카카오맵) <Key>구글 지도</Key> <Key>좌표 복사</Key>를
          제공합니다. 핀은 끌어서 옮기면 바로 저장되고, 화면 아래 알림의 <Key>되돌리기</Key>로 취소할 수
          있습니다. 위치가 없는 업무는 <strong>위치 미지정</strong> 탭의 <Key>📍 지정</Key>을 누른 뒤
          지도를 클릭합니다.
        </p>
        <p>
          <strong>장소</strong>는 사무실·현장처럼 업무가 아닌 곳입니다. 유형(🏢 사무실 · 🌿 현장·조사지
          · 🤝 회의 장소 · 🏛 협력 기관 · 🅿️ 주차·집결지 · ⭐ 기타)을 고르고, 기타는 유형 이름(예:
          숙소)을 직접 적습니다. 주소와 메모(연락처, 출입·주차 안내)도 남깁니다. 장소 탭의 유형 칩으로
          원하는 유형만 보이게 하고, 각 장소 오른쪽의 <Key>◉</Key>로 그 핀만 끄고 켭니다(<Key>모두 표시</Key>{" "}
          <Key>모두 숨기기</Key>). 업무·장소·구역 모두 같은 방식으로 하나씩 켜고 끌 수 있습니다. 모두가 함께 보며, 업무 위치는 담당자·부서장, 장소는 등록한
          사람·부서장이 옮기거나 고칠 수 있습니다.
        </p>
        <p>
          <strong>구역(폴리곤)과 면적</strong>: <Key>⬠</Key>(또는 구역 탭의 <Key>구역 그리기</Key>)를
          누르고 지도에서 꼭짓점을 차례로 클릭합니다. 그리는 동안 위쪽 안내줄에 면적과 둘레가 바로
          표시되고, <Key>↶ 점 취소</Key>(<Key>Backspace</Key>)로 마지막 점을 지웁니다.{" "}
          <strong>더블클릭</strong>하거나 첫 점을 누르거나 <Key>완료</Key>(<Key>Enter</Key>)를 누르면
          닫히고, 이름·색·메모를 적어 저장합니다. 면적은 지구 곡률을 반영해 계산하며{" "}
          <strong>㎡ · ha · 평</strong>(넓으면 ㎢도)으로 보여 줍니다. 구역을 누르면 면적·둘레·꼭짓점
          수가 나오고 <Key>수정</Key> <Key>삭제</Key> <Key>영역 보기</Key> <Key>GeoJSON</Key>(내려받기)를
          쓸 수 있습니다. 구역 탭 위쪽에 전체 개수와 합계 면적이 나오고, 각 구역 오른쪽의{" "}
          <Key>◉</Key>로 그 구역만 끄고 켤 수 있습니다(<Key>모두 표시</Key> <Key>모두 숨기기</Key>, 이
          브라우저에 기억).
        </p>
        <p>
          <strong>SHP 올리기</strong>: 구역 탭의 <Key>⇪ SHP 올리기</Key>로 Shapefile을 올리면 면(폴리곤)이
          구역으로 바뀝니다. <strong>.zip 하나</strong>로 묶어 올리거나 <strong>.shp · .dbf · .prj</strong>(있으면
          .cpg)를 함께 고르세요. .prj의 좌표계(예: EPSG:5186 중부원점, 5179, UTM-K)를 읽어 지도 좌표로
          바꾸고, 한글 속성(EUC-KR·UTF-8)도 읽습니다. 미리 보기(주황 점선)에서 개수·합계 면적을 확인하고
          구역 이름으로 쓸 속성(예: 명칭)과 색을 고른 뒤 <Key>구역 N개 저장</Key>을 누릅니다. 한 번에
          300개까지, 점·선 도형은 제외되며 아주 복잡한 도형은 자동으로 단순화됩니다. 투영 좌표인데 .prj가
          없으면 가져올 수 없으니 .prj를 함께 올려 주세요.
        </p>
        <p>
          구역도 모두가 함께 보며 누구나 추가할 수 있고, 고치거나 지우는 것은 등록한 사람과 부서장만
          할 수 있습니다.
        </p>
      </Section>

      <Section id="manual-gantt">
        <p>
          등록일부터 최종 마감일까지를 막대로 보여주고, 채움은 진행률, 점은 단계 목표일입니다.
          본인 담당 업무는 막대 끝 핸들을 끌어 마감일을 바로 바꿀 수 있습니다.
        </p>
      </Section>

      <Section id="manual-search">
        <p>
          상단의 <Key>🔍</Key>(통합 검색)을 누르거나 <Key>Ctrl</Key>+<Key>K</Key>(맥은{" "}
          <Key>⌘</Key>+<Key>K</Key>), 글을 입력하는 중이 아닐 때는 <Key>/</Key>를 누르면 검색
          창이 열립니다. 검색어를 넣으면 보드 전체에서 찾아 종류별로 보여 줍니다.
        </p>
        <p>
          · <strong>업무</strong> 업무명, 업무 위계, 담당자, 메모, 위치, 계약 정보, 진행 단계,
          세부 체크리스트, 링크·자료
          <br />· <strong>업무일정</strong> 제목, 장소, 메모
          <br />· <strong>회의록</strong> 회의명, 회의 내용, 결정 사항, 안건, 후속 조치, 외부
          참석자, 장소, 작성자
          <br />· <strong>업무일지</strong> 오늘 한 일, 다음 계획, 특이사항, 부서장 의견(내가 볼 수
          있는 일지만. 열람 범위는 운영 옵션을 따릅니다)
          <br />· <strong>구성원</strong>, <strong>양식</strong>, <strong>사용자 매뉴얼</strong>
        </p>
        <p>
          여러 단어를 띄어 쓰면 <strong>모든 단어가 들어 있는 것</strong>만 찾습니다(예:{" "}
          &lsquo;우포늪 수질&rsquo;). 찾은 글자는 노란색으로 표시되고, 어디에서 찾았는지(회의 내용,
          체크리스트 등)가 함께 나옵니다. 종류마다 5건까지 보이며 <Key>더 보기</Key>나 위쪽
          칩으로 한 종류만 볼 수 있습니다. <Key>↑</Key> <Key>↓</Key>로 고르고{" "}
          <Key>Enter</Key>로 이동, <Key>Esc</Key>로 닫습니다. 최근 검색어 6개는 이 브라우저에
          남습니다.
        </p>
        <p>
          결과를 누르면 그 내용으로 바로 이동합니다: 업무는 <strong>목록</strong>에서 접힌 분류를
          펼쳐 그 업무를 열고, 일정은 <strong>업무일정</strong>에서 상세를, 회의록은 검색어가
          표시된 상태로 엽니다. 업무일지는 내 일지면 그 날짜의 <Key>내 일지</Key>로, 다른 사람
          일지면 <Key>모아보기</Key>의 그날 상세로 갑니다. 구성원은 구성원 관리, 양식은 양식함,
          매뉴얼은 해당 항목을 엽니다.
        </p>
        <p>
          목록 위의 검색창은 업무 목록을 거르는 <strong>필터</strong>이고, 통합 검색은 보드 전체에서
          찾아 <strong>이동</strong>하는 기능입니다.
        </p>
      </Section>

      <Section id="manual-filter">
        <p>
          검색창은 업무명·메모·세부 체크리스트를 함께 찾습니다. 상태·담당자·정렬은 상단에서,
          유형·업무 위계·단계·일정(D-3 이내/이번 주/이번 달/지연)은 <Key>필터</Key>에서
          조합하고 <Key>초기화</Key>로 풉니다. 검색·필터 중에는 목록의 대분류가 자동으로 펼쳐져
          찾은 업무가 바로 보이고, 모두 풀면 다시 접힙니다. 검색과 필터는 목록·간트에서
          보이며, 지도는 필터와 상관없이 모든 업무 핀을 보여 주고 지도 안의 검색창을 씁니다.
        </p>
      </Section>

      <Section id="manual-alerts">
        <p>
          상단 <Key>알림</Key>을 열면 <strong>오늘·내일 일정</strong>, 다른 구성원이{" "}
          <strong>새로 올리거나 바꾼 일정</strong>, <strong>확인할 회의록</strong>,{" "}
          <strong>내 후속 조치</strong>(3일 이내·지연), 그리고 담당자별 업무 마감 임박(D-3)·지연
          목록이 한곳에 모입니다. 항목을 누르면 해당 화면으로 바로 이동합니다.
        </p>
        <p>
          보드를 열어 둔 동안에는 화면 오른쪽 아래에 알림 창이 뜹니다: 그날 처음 들어오면 오늘
          일정 요약, 일정 시작 전(일정에 정한 알림 시점, 종일 일정은 오전 9시 기준), 다른
          구성원의 새 일정과 새 회의록. 일정은 몇 분마다 자동으로 새로 고쳐집니다. 알림 패널의{" "}
          <Key>알림 켜기</Key>로 브라우저 알림을 허용하면 다른 창을 보고 있을 때도 알려 줍니다.
          참석 구성원을 정한 일정은 그 사람들에게만, 정하지 않은 일정은 모두에게 알립니다.
        </p>
        <p>
          부서장이 <Key>⚙ 설정</Key> → <Key>알림 웹훅</Key>에 Slack 또는 Discord 웹훅 주소를
          저장하고{" "}
          <Key>발송 활성화</Key>를 켜면, <strong>평일 오전 9시</strong>에 지연·임박 업무가
          담당자별로 정리되고, 그날의 <strong>업무일정</strong>도 함께 자동 발송됩니다. 웹훅을 켠
          모든 보드가 대상이며, 보낼 업무와 일정이 없는 날은 보내지 않습니다. 알림 패널의 <Key>웹훅으로 발송</Key>으로 바로 보낼
          수도 있습니다.
          <Who manager />
        </p>
        <p>
          발송 결과는 변경 이력에 &lsquo;평일 자동 발송&rsquo;으로 남고, 웹훅 주소가 잘못되어
          실패하면 &lsquo;발송 실패&rsquo;와 이유가 기록됩니다. 지난 연도 보드처럼 더 알림이
          필요 없는 보드는 발송 활성화를 꺼 두세요.
        </p>
      </Section>

      <Section id="manual-monthly">
        <p>
          <Key>메뉴</Key> → <Key>월간 보고서</Key>에서 월을 고르면 완료 단계, 마감 달성, 신규·지연 현황, 상태 분포,
          담당자별 요약, 업무 목록이 나옵니다. 컬럼 헤더로 정렬하고, <Key>CSV 다운로드</Key>나{" "}
          <Key>인쇄 / PDF</Key>로 내보냅니다.
        </p>
      </Section>

      <Section id="manual-members">
        <p>
          <Key>메뉴</Key> → <Key>구성원</Key>에서 명단을 봅니다. 부서장에게는 가입 신청 건수가
          메뉴 버튼과 항목에 표시되며, 신청마다 <Key>새 구성원으로 추가</Key> 또는 <Key>기존 구성원에 연결</Key>과
          권한(구성원/부서장)을 골라 승인·거절합니다.
          <Who manager />
        </p>
        <p>
          부서장은 이름·역할(직급)·색상·권한을 바꾸고, 계정 없는 담당자 이름을 추가하거나
          보드에서 쓰던 담당자 이름을 <Key>한 번에 등록</Key>합니다. 이름을 바꾸면 그 이름의
          업무와 업무일지, 수정 권한도 함께 옮겨 갑니다. 퇴사·휴직자는 <Key>비활성화</Key>하면
          접속이 막히고 기록은 남으며, <Key>계정 해제</Key>는 로그인 계정 연결만 끊습니다.
        </p>
      </Section>

      <Section id="manual-worklog">
        <p>
          <Key>업무일지</Key> 탭(화면 전체) → <Key>내 일지</Key>에서 하루에 한 건씩{" "}
          <strong>오늘 한 일 · 관련 업무 · 다음 계획 · 특이사항</strong>을 써서 제출합니다(한국
          시간 기준). <Key>↻ 보드 활동 불러오기</Key>는 그날 내가 완료한 단계·체크리스트를
          채워 주고, 관련 업무는 내 담당 업무가 먼저 제안됩니다.
        </p>
        <p>
          승인 절차가 켜진 보드에서는 부서원이 제출한 일지가 &lsquo;승인 대기&rsquo;가 됩니다.
          부서장이 <strong>반려</strong>하면 사유가 표시되고, 보완해 다시 제출합니다. 승인된 일지를
          고칠 수 있는지는 운영 옵션에 따릅니다.
        </p>
        <p>
          부서장은 <Key>승인 대기</Key>에서 쌓인 부서원 일지를 승인·반려(사유 필수)·승인
          취소합니다. 다른 사람의 일지 내용은 고칠 수 없습니다.{" "}
          <strong>부서장이 직접 쓴 본인 일지는 승인이 필요 없어</strong> 승인 대기 없이 바로
          &lsquo;제출&rsquo;(초록)로 기록되고, 언제든 고칠 수 있습니다. 구성원을 부서장으로 지정하면
          그 사람의 승인 대기 중인 일지도 승인 없이 기록된 것으로 바뀝니다.
          <Who manager />
        </p>
      </Section>

      <Section id="manual-views">
        <p>
          <Key>모아보기</Key>에서 여러 사람·여러 날의 일지를 한 화면에서 봅니다.
          <br />· <Key>일간 카드</Key> 하루치를 구성원별 카드로 보고 바로 승인·반려
          <br />· <Key>주간 표</Key> 구성원 × 요일 표, 칸을 누르면 상세, 사람별·날짜별 작성 수
          <br />· <Key>월간 달력</Key> 한 명이면 칸마다 요약, 여러 명이면 이름표, 날짜를 누르면
          일간 카드로 이동
          <br />· <Key>목록</Key> 한 달치를 날짜순으로, CSV 내려받기
        </p>
        <p>
          ‹ ›로 기간을 옮기고 이름표로 대상을, 상태 필터로 승인 대기·승인·반려를 고릅니다.
          다른 사람 일지는 운영 옵션에서 허용된 경우에만 보입니다.
        </p>
      </Section>

      <Section id="manual-reports">
        <p>
          <Key>리포트·인쇄</Key>에서 형식과 기간(최대 1년)을 고르면 미리보기가 나옵니다.
          미리보기가 곧 인쇄 결과이며, <Key>인쇄 / PDF 저장</Key> 후 인쇄 창에서 &lsquo;PDF로
          저장&rsquo;을 고르면 파일로 보관됩니다(A4).
        </p>
        <p>
          · <strong>개인 상세</strong> 결재란, 작성률·승인 현황, 미작성 평일, 관련 업무(언급
          일수·현재 진행률), 특이사항, 일자별 상세표. 여러 명이면 한 사람당 한 부씩.
          <br />· <strong>팀 요약표</strong> 구성원별 현황, 일자별 작성 점표, 팀 특이사항(전체
          열람 권한 필요).
          <br />· <strong>연간 보고서</strong> 월별 작성률 그래프와 월별 현황, 한 해의 관련
          업무와 특이사항. 여러 명이면 구성원 × 월 색상표가 담긴 팀 연간 개요가 앞에 붙습니다.
        </p>
      </Section>

      <Section id="manual-options">
        <p>
          상단 <Key>⚙ 설정</Key> → <Key>운영 옵션</Key>에서 부서장이 보드별로 켜고 끄며(구성원
          관리 창의 <Key>⚙ 운영 옵션</Key> 버튼으로도 열립니다), 바꾸면 바로 저장되고 변경
          이력에 남습니다.
          <Who manager />
        </p>
        <p>
          · <strong>다른 구성원의 일지 열람</strong> 본인 일지만 / 지정한 구성원만 전체 열람 /
          모든 구성원이 전체 열람
          <br />· <strong>승인 절차 사용</strong> 끄면 일지는 기록만 됩니다.
          <br />· <strong>승인된 일지 잠금</strong> 끄면 승인된 일지도 고칠 수 있고, 고치면 다시
          승인 대기가 됩니다.
          <br />· <strong>지난 날짜 작성 허용 기간</strong> 제한 없음·1·3·7·14·30일(정하면 미래
          날짜도 막음)
          <br />· <strong>구성원의 새 업무 등록 / 본인 업무 삭제</strong> 끄면 부서장만 합니다.
        </p>
        <p>어떤 옵션을 켜도 다른 사람의 업무·일지를 고치는 것은 허용되지 않습니다.</p>
      </Section>

      <Section id="manual-forms">
        <p>
          <Key>메뉴</Key> → <Key>양식함</Key>에서 팀이 함께 쓰는 표준 양식(hwp, hwpx, doc, docx, pdf, xlsx / 최대
          1MB)을 올리고 내려받습니다. 삭제는 올린 사람 또는 부서장이 합니다.
        </p>
      </Section>

      <Section id="manual-faq">
        <p>
          <strong className="text-[var(--text)]">Q. 비밀번호를 잊었어요.</strong>
          <br />새 계정으로 가입해 같은 보드에 가입 신청을 하고, 부서장에게 &lsquo;기존 구성원에
          연결&rsquo;로 승인해 달라고 하세요. 이전 업무와 업무일지를 그대로 이어서 씁니다.
        </p>
        <p>
          <strong className="text-[var(--text)]">Q. 업무에 &lsquo;보기 전용&rsquo;이 떠서 고칠 수
          없어요.</strong>
          <br />다른 사람이 담당자인 업무입니다. 담당자 변경이 필요하면 부서장에게 요청하세요.
          내 업무인데 보기 전용이라면, 업무의 담당자 이름과 내 구성원 이름이 같은지 부서장에게
          확인을 부탁하세요.
        </p>
        <p>
          <strong className="text-[var(--text)]">Q. 가입 신청을 했는데 들어갈 수 없어요.</strong>
          <br />부서장의 승인을 기다리는 중입니다. 첫 화면의 &lsquo;승인 대기 중&rsquo;에서 상태를
          볼 수 있습니다.
        </p>
        <p>
          <strong className="text-[var(--text)]">Q. 승인된 일지를 고치고 싶어요.</strong>
          <br />부서장에게 <Key>승인 취소</Key>를 요청하거나, 운영 옵션의 &lsquo;승인된 일지
          잠금&rsquo;을 끄면 고칠 수 있습니다.
        </p>
        <p>
          <strong className="text-[var(--text)]">Q. 일정 알림 창이 뜨지 않아요.</strong>
          <br />알림 창은 보드를 열어 둔 동안에만 뜹니다. 일정에 알림 시점을 정했는지, 참석
          구성원에 내가 들어 있는지(비워 두면 모두) 확인하세요. 다른 창을 볼 때도 받으려면 알림
          패널에서 <Key>알림 켜기</Key>로 브라우저 알림을 허용하세요.
        </p>
        <p>
          <strong className="text-[var(--text)]">Q. 회의에 참석했는데 &lsquo;확인 필요&rsquo;가 떠요.</strong>
          <br />회의록 작성자가 나를 참석자로 고르지 않은 경우입니다. 작성자(또는 부서장)에게
          참석자 수정을 요청하거나, 내용을 읽고 <Key>✓ 회의 내용을 확인했습니다</Key>를 누르세요.
        </p>
        <p>
          <strong className="text-[var(--text)]">Q. 자동 마감 알림이 오지 않아요.</strong>
          <br /><Key>⚙ 설정</Key> → <Key>알림 웹훅</Key>의 주소와 &lsquo;발송 활성화&rsquo;를
          확인하고, <Key>메뉴</Key> → <Key>변경 이력</Key>에
          &lsquo;발송 실패&rsquo; 기록이 있는지 보세요. 그날 지연·임박 업무가 없으면 보내지
          않습니다.
        </p>
      </Section>

      <Section id="manual-tips">
        <p>
          · 담당자 색상은 목록·대시보드·지도에 공통 적용됩니다.
          <br />· 업무·업무일정·회의록·업무일지는 연도/팀 보드별로 팀 공용 서버에 저장되고,
          대시보드 위젯, 지도 설정, 달력의 보기(일·주·월·두 달·목록), 지도의 켜고 끈 핀은 각 브라우저에 저장됩니다.
          <br />· 무엇이 어디 있는지 기억나지 않을 때는 <Key>Ctrl</Key>+<Key>K</Key>로 통합
          검색을 열어 단어 하나만 넣어 보세요.
          <br />· 대분류가 많다면 목록을 접힌 채로 두고 대분류 줄의 담당자·총 예산·진행률로
          전체를 먼저 훑어본 뒤 필요한 분류만 펼쳐 보세요.
          <br />· 색상 규칙: 파랑=완료, 녹색=진행, 주황=임박·승인 대기, 빨강=지연·반려,
          회색=잠김/보조 정보.
          <br />· 이 매뉴얼은 로그인 전 첫 화면 아래와 보드의 <Key>메뉴</Key> → &lsquo;사용자
          매뉴얼&rsquo;에서
          언제든 볼 수 있습니다.
        </p>
      </Section>
    </div>
  );
}
