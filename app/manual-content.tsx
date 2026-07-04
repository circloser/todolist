// 사용자 매뉴얼 본문. task-board.tsx의 매뉴얼 모달에서 렌더링되며,
// #manual-print 인쇄 영역 안에 들어가므로 정적 JSX만 사용한다.

function Section({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-[var(--border)] pb-5 last:border-b-0 last:pb-0">
      <h3 className="mb-2.5 flex items-center gap-2 text-[15px] font-bold">
        <span>{icon}</span>
        {title}
      </h3>
      <div className="space-y-2 text-[13px] leading-6 text-[var(--text-muted)]">
        {children}
      </div>
    </section>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <span className="mx-0.5 inline-flex items-center rounded-md border border-[var(--border-strong)] bg-[var(--surface-2)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--text)]">
      {children}
    </span>
  );
}

export default function ManualContent() {
  return (
    <div className="space-y-5">
      <div className="rounded-[var(--radius)] bg-[var(--accent-soft)] p-4 text-[13px] leading-6 text-[var(--text-muted)]">
        이 보드는 팀의 업무를 <strong>유형별 진행 단계(프리셋)</strong>로 관리하는
        도구입니다. 업무를 추가하면 선택한 유형의 단계가 체크리스트로 생성되고,
        단계를 순서대로 완료 체크하며 진행률을 공유합니다.
      </div>

      <Section icon="🚀" title="시작하기">
        <p>
          화면 상단의 <Key>대시보드</Key> <Key>목록</Key> <Key>지도</Key>{" "}
          <Key>표</Key> <Key>간트</Key> 버튼으로 보기를 전환합니다. 처음 열면
          프로젝트 전체 현황을 요약한 대시보드가 표시됩니다.
        </p>
        <p>
          하단 <strong>보드 설정</strong>에서 <strong>사용자명</strong>을 먼저
          입력하세요 — 변경 이력에 누가 수정했는지 기록됩니다. 조직명·보드명도
          같은 곳에서 바꿀 수 있습니다.
        </p>
      </Section>

      <Section icon="📋" title="업무 추가와 진행 체크">
        <p>
          <strong>추가</strong>: 목록 하단의 <Key>새 업무 추가</Key> 폼에서{" "}
          <strong>유형</strong>을 고르면 그 유형의 진행 단계가 미리보기로
          표시되고, 추가 시 체크리스트로 생성됩니다.
        </p>
        <p>
          <strong>진행 체크</strong>: 업무를 펼치면(▾) 단계 목록이 나옵니다.
          단계는 <strong>순서대로만</strong> 완료할 수 있으며(이전 단계 완료
          필요), 완료를 해제하면 이후 단계도 함께 해제됩니다. 각 단계에{" "}
          <Key>+ 기한</Key>으로 목표일을 지정하면 D-일수가 표시됩니다.
        </p>
        <p>
          <strong>세부 체크리스트</strong>: 단계보다 작은 할 일(내용·기한·
          애로사항)을 업무 안에 자유롭게 추가합니다.
        </p>
        <p>
          <strong>링크/자료</strong>: 관련 공문·드라이브 링크를 이름과 함께
          붙여 둘 수 있습니다 (http/https만 허용).
        </p>
        <p>
          <strong>복제</strong>: 카드의 <Key>⧉</Key> 버튼 — 단계 구조를 그대로
          복사하며, <strong>일정 유지</strong>(마감·목표일 복사)와{" "}
          <strong>일정 초기화</strong> 중 선택합니다. 진행 상태는 항상
          초기화됩니다.
        </p>
        <p>
          <strong>순서 변경</strong>: 카드 왼쪽 <Key>⋮⋮</Key> 핸들을 드래그해
          원하는 위치에 놓으면 수동 정렬 순서가 저장됩니다.
        </p>
      </Section>

      <Section icon="🧩" title="유형·단계 프리셋 관리">
        <p>
          업무 성격(외부 용역, 현장 조사, 공사, 행정 등)마다 진행 절차가
          다르므로, 절차를 <strong>유형(프리셋)</strong>으로 관리합니다.
        </p>
        <p>
          툴바의 <Key>유형·단계</Key> 버튼 또는 새 업무 폼의{" "}
          <Key>＋ 새 유형 만들기…</Key>로 편집기를 엽니다. 단계는{" "}
          <Key>+ 단계 추가</Key>로 원하는 개수만큼 만들고, ▲▼로 순서를 바꾸고,
          ×로 삭제합니다.
        </p>
        <p>
          <strong>주의</strong>: 유형의 단계를 수정하면 그 유형을 쓰는{" "}
          <strong>기존 업무에도 반영</strong>됩니다. 이미 완료한 단계의 상태와
          기한은 유지되고, 새 단계는 미완료로 추가되며, 삭제한 단계는
          제거됩니다. 사용 중인 유형은 삭제할 수 없습니다.
        </p>
      </Section>

      <Section icon="📊" title="대시보드">
        <p>
          진행률·상태 분포·담당자 워크로드·유형별 업무·다가오는 마감·예산·병목
          단계·지역 현황·최근 활동을 한눈에 봅니다. 대부분의 위젯은{" "}
          <strong>클릭하면 해당 조건의 목록/지도로 이동</strong>합니다.
        </p>
        <p>
          우측 상단 <Key>위젯</Key> 버튼으로 표시할 위젯을 선택할 수 있으며,
          설정은 브라우저에 저장됩니다.
        </p>
      </Section>

      <Section icon="🗺" title="지도 (습지보호지역)">
        <p>
          위치가 지정된 업무가 대한민국 지도 위에 상태색 마커(파랑=진행,
          주황=임박, 빨강=지연, 초록=완료)로 표시됩니다. 같은 지점의 여러
          업무는 하나의 큰 마커로 묶이고, 클릭하면 전체 목록이 팝업으로
          나옵니다.
        </p>
        <p>
          <strong>위치 지정</strong> 방법 두 가지 — ① 업무 상세의{" "}
          <strong>위치</strong> 입력에서 전국 습지보호지역 목록을 선택(좌표
          자동 입력) ② 지도 사이드 패널의 <Key>📍</Key> 버튼을 누른 뒤 지도를
          클릭.
        </p>
        <p>
          <Key>＋ 지도를 클릭해 새 업무 추가</Key>를 누르고 지점을 클릭하면 그
          좌표로 새 업무를 바로 만들 수 있습니다.
        </p>
      </Section>

      <Section icon="📅" title="표 · 간트">
        <p>
          <strong>표</strong>: 업무×단계 매트릭스입니다. 셀을 클릭해 단계를
          완료/해제하고, 셀 아래 <Key>+</Key>로 목표일을 지정합니다. 유형이
          다른 업무는 별도의 표로 나뉘어 표시됩니다.
        </p>
        <p>
          <strong>간트</strong>: 날짜축 타임라인 — 막대는 등록일→마감일이고
          채워진 만큼이 진행률입니다. 점은 단계 목표일, 빨간 세로선은
          오늘입니다. <strong>막대 끝 핸들을 좌우로 드래그</strong>하면 마감일이
          바로 변경됩니다.
        </p>
      </Section>

      <Section icon="🔎" title="필터와 검색">
        <p>
          검색창은 업무명·메모·세부 체크리스트를 함께 찾습니다.{" "}
          <Key>필터</Key> 버튼에서 유형·대분류·단계·일정(D-3 이내 / 이번 주 /
          이번 달 / 지연) 조건을 조합할 수 있고, 활성 필터 수가 배지로
          표시됩니다.
        </p>
        <p>
          모바일에서는 <Key>필터</Key>를 누르면 모든 필터와 도구(보고서·양식·
          유형 관리)가 하단 시트로 열립니다.
        </p>
      </Section>

      <Section icon="🔔" title="마감 알림과 웹훅">
        <p>
          툴바의 <Key>알림</Key> 벨에 지연·임박(D-3 이내) 건수가 표시되고,
          누르면 담당자별 목록이 열립니다. 항목을 클릭하면 해당 업무로
          이동합니다.
        </p>
        <p>
          <strong>웹훅 발송</strong>: 보드 설정의 <strong>알림 웹훅</strong>에
          Slack 또는 Discord 웹훅 URL을 저장하고 활성화하면 — ① 알림 패널의{" "}
          <Key>웹훅으로 발송</Key>으로 즉시 발송 ② <strong>평일 오전 9시</strong>
          에 자동으로 담당자별 마감 다이제스트가 채널로 전송됩니다.
        </p>
      </Section>

      <Section icon="📄" title="월간 보고서">
        <p>
          툴바의 <Key>보고서</Key> — 월을 선택하면 완료 단계 수, 마감 달성,
          신규·지연 현황과 상태 분포·담당자별 차트, 업무 목록이 정리됩니다.
        </p>
        <p>
          <Key>CSV 다운로드</Key>는 Excel에서 바로 열리고(한글 정상),{" "}
          <Key>인쇄 / PDF</Key>는 브라우저 인쇄로 보고서 영역만 출력합니다
          (PDF로 저장 선택 가능).
        </p>
      </Section>

      <Section icon="📎" title="기안문 · 공용 양식함">
        <p>
          툴바의 <Key>양식</Key> — 팀이 함께 쓰는 기안문 등 표준 양식(hwp,
          hwpx, doc, docx, pdf, xlsx / 파일당 최대 1MB)을 올려 두면 누구나
          <Key>⬇ 다운로드</Key>로 받아 사용합니다. 양식을 통일하려면 최신
          파일 하나만 남기고 이전 버전은 삭제하세요.
        </p>
      </Section>

      <Section icon="💡" title="팁">
        <p>
          · 담당자 색상은 업무 상세의 색상 선택기로 지정 — 목록·지도·대시보드에
          공통 적용됩니다.
        </p>
        <p>
          · 모든 데이터는 팀 공용 서버(Cloudflare D1)에 저장되어 전원이 같은
          내용을 봅니다. 사용자명과 위젯 표시 설정만 각자 브라우저에
          저장됩니다.
        </p>
        <p>
          · 단계 셀·마커·배지의 색상 규칙은 항상 동일합니다 — 초록=완료,
          파랑(인디고)=진행 가능, 주황=임박(D-3 이내), 빨강=지연, 회색=잠김
          (이전 단계 미완료).
        </p>
      </Section>
    </div>
  );
}
