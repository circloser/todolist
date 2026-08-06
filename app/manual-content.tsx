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
        이 보드는 팀 업무를 <strong>업무 위계</strong>로 묶고, 업무 유형별{" "}
        <strong>진행 단계</strong>를 순서대로 체크하며, 예산·계약·위치·자료까지
        함께 관리하는 협업용 진행 보드입니다.
      </div>

      <Section icon="🚀" title="기본 화면과 설정">
        <p>
          상단의 <Key>목록</Key> <Key>대시보드</Key> <Key>지도</Key>{" "}
          <Key>간트</Key> 버튼으로 보기를 전환합니다. 일상 입력과 확인은{" "}
          <strong>목록</strong> 화면을 중심으로 사용하면 가장 편합니다.
        </p>
        <p>
          보드명은 상단 제목을 바로 수정하거나, 화면 하단의{" "}
          <strong>보드 설정</strong>에서 조직명·보드명·사용자명을 함께 관리합니다.
          사용자명은 각 PC/브라우저에 저장되며, 변경 이력의 작성자로 사용됩니다.
        </p>
      </Section>

      <Section icon="📂" title="업무 위계와 목록 사용">
        <p>
          목록은 <strong>업무 위계</strong> 기준으로 묶입니다. 예를 들어{" "}
          <strong>복원사업 &gt; 현장조사 &gt; 식생</strong>처럼 입력하면 대분류,
          중분류, 소분류 깊이에 따라 목록에서 들여쓰기와 라벨이 달라집니다.
        </p>
        <p>
          위계 구분자는 <Key>&gt;</Key> <Key>/</Key> <Key>|</Key>{" "}
          <Key>›</Key> <Key>→</Key> <Key>·</Key>를 사용할 수 있습니다. 비워 두면{" "}
          <strong>미분류</strong>로 표시됩니다.
        </p>
        <p>
          각 그룹 헤더의 <Key>＋ 업무</Key>를 누르면 해당 그룹의 맨 아래에 새
          업무가 추가됩니다. 업무를 추가해도 기존 필터가 자동으로 바뀌지 않으며,
          하단의 <Key>＋ 대분류</Key> 메뉴로 빈 그룹을 먼저 만들 수도 있습니다.
        </p>
        <p>
          그룹은 접기/펼치기가 가능하고, 그룹 왼쪽 핸들과 업무 카드 왼쪽{" "}
          <Key>⋮⋮</Key> 핸들을 드래그해 수동 순서를 저장할 수 있습니다. 그룹
          헤더의 <Key>×</Key>는 대분류 삭제입니다. 업무가 있는 대분류를 삭제하면
          업무 자체는 남고, 해당 대분류와 하위 위계의 업무들은{" "}
          <strong>미분류</strong>로 이동합니다.
        </p>
      </Section>

      <Section icon="📋" title="업무 추가·수정·삭제">
        <p>
          업무 추가 시 <strong>유형</strong>, 업무명, 담당자, 최종 마감일을 입력합니다.
          유형을 고르면 해당 업무에 맞는 진행 단계가 자동으로 생성됩니다.
        </p>
        <p>
          업무 행을 클릭하면 상세가 펼쳐집니다. 상세에서는 담당자 색상, 업무
          위계, 유형, 최종 마감일, 위치, 편성 예산, 소요 예산, 계약금액,
          계약업체, 업체 담당자, 업체 연락처, 메모, 링크/자료를 수정합니다.
        </p>
        <p>
          업무 오른쪽의 <Key>⧉</Key>는 복제, <Key>×</Key>는 삭제입니다. 복제 시
          일정 유지 또는 일정 초기화를 선택할 수 있고, 진행 상태는 새 업무처럼
          초기화됩니다.
        </p>
      </Section>

      <Section icon="✅" title="진행 단계와 세부 체크리스트">
        <p>
          진행 단계는 업무 상세에서 <strong>세로 목록</strong>으로 표시됩니다.
          단계는 왼쪽부터 순차적으로만 완료할 수 있으며, 앞 단계가 끝나지 않으면
          뒤 단계는 잠깁니다. 완료를 해제하면 이후 단계도 함께 해제됩니다.
        </p>
        <p>
          각 단계의 <strong>목표일</strong>에 날짜를 넣으면 D-일수가 표시됩니다.
          완료된 단계의 목표일은 경고색으로 남지 않으며, 업무가 100% 완료되면
          최종 마감일이 지나도 업무 상태와 진행바는 <strong>파란색 완료</strong>로
          표시됩니다.
        </p>
        <p>
          단계별 <Key>세부 체크리스트</Key>를 열면 해당 단계 안에서 작은 할 일을
          추가·체크·삭제할 수 있습니다. 단계와 직접 연결되지 않는 항목은 아래{" "}
          <strong>공통 체크리스트</strong>에 두고, 내용·기한·애로사항을 함께
          관리합니다.
        </p>
      </Section>

      <Section icon="🧩" title="업무 유형·단계 관리">
        <p>
          기본 유형은 <strong>외부 학술/조사 용역</strong>,{" "}
          <strong>내부 자체 연구 및 현장 조사</strong>,{" "}
          <strong>생태 복원 및 조성 공사</strong>,{" "}
          <strong>내부 일반 행정 및 기획</strong> 4가지입니다.
        </p>
        <p>
          상단 <Key>유형·단계</Key> 또는 업무 추가 폼의{" "}
          <Key>＋ 새 유형 만들기</Key>에서 유형 편집기를 엽니다. 단계명, 그룹,
          설명, 진도 기준을 수정하고 단계 순서를 조정할 수 있습니다.
        </p>
        <p>
          유형의 단계를 수정하면 그 유형을 쓰는 기존 업무에도 반영됩니다. 이미
          완료한 단계의 상태와 목표일은 최대한 유지되고, 새 단계는 미완료로
          추가됩니다. 사용 중인 유형은 삭제할 수 없습니다.
        </p>
      </Section>

      <Section icon="📊" title="대시보드">
        <p>
          대시보드는 전체 진행률, 상태 분포, 담당자 워크로드, 유형별 업무,
          다가오는 마감, 예산 요약, 병목 단계, 지역 현황, 최근 활동을 보여줍니다.
          위젯을 클릭하면 관련 목록이나 지도로 이동합니다.
        </p>
        <p>
          우측 상단 <Key>위젯</Key> 버튼으로 표시할 항목을 선택할 수 있습니다.
          위젯 표시 설정은 각 브라우저에 저장됩니다.
        </p>
      </Section>

      <Section icon="🗺" title="지도">
        <p>
          위치가 지정된 업무는 지도에 마커로 표시됩니다. 색상은{" "}
          <strong>파랑=업무 완료</strong>, <strong>녹색=진행</strong>,{" "}
          <strong>주황=마감 임박</strong>, <strong>빨강=지연</strong>입니다.
          여러 업무가 같은 좌표에 있으면 하나의 큰 마커로 묶입니다.
        </p>
        <p>
          위치는 업무 상세의 <strong>위치(습지보호지역)</strong> 목록에서 선택하거나,
          지도 사이드 패널의 <Key>📍</Key> 버튼을 누른 뒤 지도를 클릭해 지정합니다.
          <Key>＋ 지도를 클릭해 새 업무 추가</Key>로 좌표가 들어간 업무를 바로
          만들 수도 있습니다.
        </p>
        <p>
          지도 표시 업무 목록이나 지도 팝업의 <Key>핀 삭제</Key>를 누르면 업무는
          그대로 두고 좌표만 제거됩니다. 삭제된 업무는 지도에서 빠지고{" "}
          <strong>위치 미지정</strong> 목록으로 이동합니다.
        </p>
      </Section>

      <Section icon="📅" title="간트">
        <p>
          간트는 등록일과 최종 마감일을 기준으로 업무 기간을 가로 막대로
          보여줍니다. 막대 안의 채움은 진행률이고, 단계 목표일은 작은 점으로
          표시됩니다.
        </p>
        <p>
          막대 끝의 핸들을 좌우로 드래그하면 최종 마감일을 바로 조정할 수
          있습니다. 마감일이 없는 업무는 일정 미지정으로 표시됩니다.
        </p>
      </Section>

      <Section icon="🔎" title="필터·검색·정렬">
        <p>
          검색창은 업무명, 메모, 세부 체크리스트를 함께 찾습니다. 상태, 담당자,
          정렬 방식은 상단에서 바로 바꾸고, <Key>필터</Key>에서는 유형, 업무 위계,
          단계, 일정(D-3 이내 / 이번 주 / 이번 달 / 지연)을 조합합니다.
        </p>
        <p>
          담당자 칩, 병목 단계 칩, 대시보드 위젯을 클릭해도 관련 필터가 적용됩니다.
          필터를 풀려면 상세 필터 영역의 <Key>초기화</Key>를 누릅니다.
        </p>
      </Section>

      <Section icon="🔔" title="마감 알림">
        <p>
          상단 <Key>알림</Key>에는 지연·임박(D-3 이내) 건수가 표시됩니다. 열어 보면
          담당자별로 마감이 가까운 업무와 지연 업무가 정리되고, 항목을 클릭하면
          해당 업무로 이동합니다.
        </p>
        <p>
          보드 설정에 Slack 또는 Discord 웹훅 URL을 저장하고 활성화하면 알림
          패널에서 담당자별 마감 목록을 전송할 수 있으며, 평일 오전 9시에 자동
          다이제스트를 보낼 수 있습니다.
        </p>
      </Section>

      <Section icon="📄" title="월간 보고서">
        <p>
          <Key>보고서</Key>에서 월을 선택하면 완료 단계 수, 마감 달성, 신규·지연
          현황, 상태 분포, 담당자별 요약, 업무 목록을 확인합니다. 업무 목록의
          컬럼 헤더를 누르면 대분류·업무명·담당·진행률·마감일·상태 기준으로
          정렬됩니다.
        </p>
        <p>
          <Key>CSV 다운로드</Key>는 Excel에서 열 수 있고, <Key>인쇄 / PDF</Key>는
          보고서 영역만 출력합니다.
        </p>
      </Section>

      <Section icon="📎" title="기안문·공용 양식함">
        <p>
          <Key>양식</Key>에서는 팀이 함께 쓰는 표준 양식(hwp, hwpx, doc, docx,
          pdf, xlsx / 파일당 최대 1MB)을 올리고 내려받습니다. 오래된 양식은
          삭제해서 최신 파일만 남겨 두는 방식으로 관리합니다.
        </p>
      </Section>

      <Section icon="💡" title="운영 팁">
        <p>
          · 담당자 색상은 업무 상세의 색상 선택기로 지정하며, 목록·대시보드·지도에
          공통 적용됩니다.
        </p>
        <p>
          · 모든 업무 데이터는 팀 공용 서버에 저장되어 같은 내용을 봅니다.
          사용자명과 대시보드 위젯 표시 설정은 각 브라우저에 저장됩니다.
        </p>
        <p>
          · 색상 규칙은 업무 상태 기준으로 통일됩니다 — 파랑=업무 완료,
          녹색=진행, 주황=임박, 빨강=지연, 회색=잠김/보조 정보입니다.
        </p>
      </Section>
    </div>
  );
}
