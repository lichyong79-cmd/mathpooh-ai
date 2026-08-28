"use client";

type Audience = "student" | "parent";

const studentSteps = [
  [
    "01",
    "실전모의고사",
    "배정된 시험의 응시 가능 시간을 확인하고 시험을 시작합니다. 시험 중에는 다른 화면으로 이동하지 말고, 답안 제출 전 미응답 문항을 확인합니다.",
  ],
  [
    "02",
    "SOS 진단",
    "최근 오답 중 필요한 단원을 짧게 진단합니다. 답을 입력한 뒤 풀이 사진까지 제출하면 다음 문항으로 이동합니다.",
  ],
  [
    "03",
    "개인별 훈련",
    "진단에서 발견된 취약 유형을 10문항으로 훈련합니다. 막히면 ‘모르겠어요’를 사용하고 안내 순서대로 교정합니다.",
  ],
  [
    "04",
    "오답 교정",
    "틀린 문항은 힌트 → 재도전 → 풀이 확인 순서로 다시 학습합니다. 정답만 외우지 말고 직접 다시 풀어야 교정이 완료됩니다.",
  ],
  [
    "05",
    "재검증·굳히기",
    "바로미터 상승 여부에 따라 2차 훈련 또는 3제 굳히기가 이어집니다. 화면에 표시된 마지막 단계까지 완료합니다.",
  ],
];

const parentSteps = [
  [
    "신청",
    "SOS 5회 묶음 신청",
    "관리자가 공개한 운영 일정 5개를 한 번에 신청합니다. 신규 학부모는 로그인 화면의 ‘SOS 5회 신규 신청’, 기존 학부모는 자녀를 선택한 뒤 ‘SOS 신청’ 탭을 이용합니다.",
  ],
  [
    "첫 로그인",
    "비밀번호 변경",
    "처음 안내받은 비밀번호로 로그인하면 자녀 기록을 열기 전에 새 비밀번호 변경 화면이 나타납니다. 본인만 아는 6자리 이상의 비밀번호로 바꾼 뒤 이용합니다.",
  ],
  [
    "홈",
    "오늘 확인할 내용",
    "미완료 학습, 최근 시험, 최근 활동, 우선 보완 단원을 한 화면에서 확인합니다. ‘진행 필요’가 보이면 자녀가 남은 학습을 이어가도록 안내해 주세요.",
  ],
  [
    "성적분석",
    "점수보다 변화 확인",
    "시험별 점수 추이와 단원·난이도별 누적 정답률을 봅니다. 한 번의 점수보다 최근 흐름과 반복되는 취약 단원을 중심으로 확인합니다.",
  ],
  [
    "SOS 학습",
    "주차별 학습경로 확인",
    "진단·훈련·재검증의 진행 상태와 문항 수, 정답률, 바로미터 변화를 확인합니다. 모든 단계가 끝난 주차에는 ‘학습완료’ 도장이 표시됩니다.",
  ],
  [
    "종합리포트",
    "전체 성장 요약",
    "최근 성적, 보완 방향, SOS 진행 상태와 코멘트를 한 번에 확인하고 필요하면 인쇄할 수 있습니다.",
  ],
];

export default function SosUserManual({ audience }: { audience: Audience }) {
  const student = audience === "student";
  const steps = student ? studentSteps : parentSteps;
  return (
    <section className={`sos-user-guide ${audience}`}>
      <header className="guide-cover">
        <div>
          <small>MATHPOOH SOS · USER GUIDE</small>
          <h2>{student ? "학생 사용자 매뉴얼" : "학부모 사용자 매뉴얼"}</h2>
          <p>
            {student
              ? "시험부터 진단·훈련·오답 교정까지, 화면에 표시되는 순서대로 진행하세요."
              : "자녀의 점수만 보는 페이지가 아니라, 무엇을 보완하고 어디까지 학습했는지 확인하는 페이지입니다."}
          </p>
        </div>
        <b>{student ? "끝까지 직접 풀기" : "과정과 변화 확인"}</b>
      </header>

      <div className="guide-flow">
        {steps.map(([no, title, description]) => (
          <article key={no}>
            <i>{no}</i>
            <div>
              <h3>{title}</h3>
              <p>{description}</p>
            </div>
          </article>
        ))}
      </div>

      {student ? (
        <>
          <GuideSection
            title="문제 풀이 화면 사용법"
            eyebrow="HOW TO LEARN"
            items={[
              [
                "답 입력",
                "객관식은 번호를 선택하고 단답형은 정답을 입력합니다. 답을 입력하지 않으면 다음 문항으로 넘어갈 수 없습니다.",
              ],
              [
                "풀이 사진",
                "직접 푼 풀이가 보이도록 촬영해 제출합니다. 사진 제출 시간도 학습 기록에 포함됩니다.",
              ],
              [
                "모르겠어요",
                "무작정 찍지 말고 ‘모르겠어요’를 누릅니다. 이후 제공되는 힌트와 교정 과정을 따라갑니다.",
              ],
              [
                "힌트·재도전",
                "힌트를 본 뒤 반드시 다시 계산합니다. 재도전 답을 입력하고 정답 여부를 확인합니다.",
              ],
              [
                "풀이 확인",
                "계속 틀리면 해설을 읽고 자신의 풀이에서 잘못된 부분을 찾습니다. 확인 후 정답을 다시 입력해야 교정됩니다.",
              ],
              [
                "이어하기",
                "중간에 나가도 저장된 문항부터 이어집니다. 나의SOS 또는 SOS 공략에서 ‘이어하기’를 누릅니다.",
              ],
            ]}
          />
          <GuideSection
            title="화면의 상태 뜻"
            eyebrow="STATUS GUIDE"
            items={[
              ["시작 전", "학습이 배정됐지만 아직 시작하지 않은 상태입니다."],
              [
                "진행 중",
                "현재 풀고 있는 단계입니다. 남은 문항을 이어서 완료하세요.",
              ],
              [
                "AI 문항 준비 중",
                "다음 개인별 문항을 생성·검증하고 있습니다. 짧게는 10분, 길게는 30분 이상 걸릴 수 있으며 화면은 45초마다 상태를 자동 확인합니다. 화면을 닫아도 작업은 계속됩니다.",
              ],
              [
                "AI 생성 다시 시도",
                "생성 작업이 중단됐을 때만 표시됩니다. 누르면 이미 통과한 문항은 보존하고 실패한 단계부터 다시 예약합니다.",
              ],
              [
                "교정 필요",
                "최초 풀이가 틀려 오답 학습이 남아 있는 상태입니다.",
              ],
              [
                "완료·통과",
                "해당 단계가 끝난 상태입니다. 다음 단계가 있으면 화면에 자동으로 표시됩니다.",
              ],
            ]}
          />
          <GuideSection
            title="꼭 지켜 주세요"
            eyebrow="IMPORTANT"
            tone="warn"
            items={[
              [
                "직접 풀기",
                "검색·생성형 AI·타인의 도움 없이 풀어야 진단과 추천이 정확해집니다.",
              ],
              [
                "AI 준비 중 기다리기",
                "여러 번 예약하거나 새로고침하지 않아도 됩니다. 궁금하면 ‘지금 확인’을 한 번 누르고, 나중에 다시 접속해 이어서 학습해도 됩니다.",
              ],
              [
                "정답 이상",
                "문제나 정답이 이상해 보이면 임의로 맞추지 말고 문항 번호와 화면을 촬영해 담당 선생님께 보냅니다.",
              ],
              [
                "제출 확인",
                "버튼을 연속으로 누르지 말고 ‘저장됨’, ‘제출 완료’, ‘교정 완료’ 문구를 확인합니다.",
              ],
            ]}
          />
        </>
      ) : (
        <>
          <GuideSection
            title="숫자와 상태 읽는 법"
            eyebrow="REPORT GUIDE"
            items={[
              [
                "미완료 학습",
                "자녀가 현재 마쳐야 할 진단·훈련 단계입니다. 문항 수가 남아 있으면 이어서 진행해야 합니다.",
              ],
              [
                "정답률",
                "최초 풀이 결과를 중심으로 보여주는 성취 지표입니다. 교정 완료와는 구분해서 봅니다.",
              ],
              [
                "바로미터",
                "해당 소단원에서 현재 해결 가능한 문제 난이도를 나타냅니다. 시작값보다 현재값이 상승했는지 확인합니다.",
              ],
              [
                "AI 문항 준비 중",
                "개인별 다음 훈련 문항을 생성·검증 중인 상태입니다. 짧게는 10분, 길게는 30분 이상 걸릴 수 있으며 오류가 아닙니다. 완료되면 다음 학습이 열립니다.",
              ],
              [
                "학습완료 도장",
                "해당 주차에 필요한 진단·훈련·교정 과정이 모두 종료됐다는 뜻입니다.",
              ],
            ]}
          />
          <GuideSection
            title="학부모님이 도와주실 부분"
            eyebrow="PARENT CHECK"
            tone="parent"
            items={[
              [
                "신청·입금 확인",
                "5회 묶음을 신청한 뒤 관리자가 입금완료 처리하면 자녀 계정에 5개 회차가 등록됩니다. 시험지는 매주 회차에 연결되는 즉시 자동 배정됩니다.",
              ],
              [
                "답보다 과정 확인",
                "몇 점인지보다 미완료 학습을 끝냈는지, 취약 단원 바로미터가 변했는지 확인해 주세요.",
              ],
              [
                "대신 풀어주지 않기",
                "진단 단계에서 도움을 받으면 잘못된 학습경로가 만들어질 수 있습니다. 혼자 풀도록 해주세요.",
              ],
              [
                "주 1회 확인",
                "SOS 학습 탭에서 이번 주 완료 도장과 남은 단계를 확인하면 충분합니다.",
              ],
              [
                "이상 발생 시",
                "오랫동안 같은 화면이거나 정답이 이상하면 학생 이름·단계·문항 번호가 보이게 촬영해 담당 선생님께 전달해 주세요.",
              ],
            ]}
          />
        </>
      )}

      <div className="guide-help">
        <b>문제가 해결되지 않나요?</b>
        <span>
          학생 이름 · 학습 단계 · 문항 번호 · 오류 화면을 함께 보내주시면 가장
          빠르게 확인할 수 있습니다.
        </span>
      </div>
      <style jsx global>{`
        .sos-user-guide {
          max-width: 1180px;
          margin: 0 auto 45px;
          color: #17231c;
        }
        .guide-cover {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 25px;
          padding: 30px;
          border-radius: 20px;
          background: linear-gradient(125deg, #173f2b, #2e7649 70%, #4b9863);
          color: #fff;
          box-shadow: 0 15px 35px rgba(27, 91, 52, 0.17);
        }
        .guide-cover small {
          color: #bde0c7;
          font-size: 10px;
          font-weight: 1000;
          letter-spacing: 0.14em;
        }
        .guide-cover h2 {
          margin: 7px 0;
          font-size: 28px;
        }
        .guide-cover p {
          margin: 0;
          color: #dcece1;
          line-height: 1.7;
        }
        .guide-cover > b {
          padding: 11px 15px;
          border-radius: 99px;
          background: #fff;
          color: #286541;
          white-space: nowrap;
          font-size: 12px;
        }
        .guide-flow {
          display: grid;
          gap: 10px;
          margin-top: 15px;
        }
        .guide-flow article {
          display: flex;
          gap: 15px;
          align-items: flex-start;
          padding: 18px 20px;
          border: 1px solid #dfe8e2;
          border-radius: 15px;
          background: #fff;
        }
        .guide-flow i {
          display: grid;
          place-items: center;
          flex: 0 0 42px;
          height: 42px;
          border-radius: 12px;
          background: #eaf5ed;
          color: #2d7749;
          font-style: normal;
          font-weight: 1000;
        }
        .guide-flow h3 {
          margin: 1px 0 6px;
          font-size: 16px;
        }
        .guide-flow p {
          margin: 0;
          color: #66736b;
          font-size: 13px;
          line-height: 1.7;
        }
        .guide-section {
          margin-top: 17px;
          padding: 23px;
          border: 1px solid #dfe7e2;
          border-radius: 18px;
          background: #fff;
        }
        .guide-section > header small {
          color: #368056;
          font-size: 9px;
          font-weight: 1000;
          letter-spacing: 0.13em;
        }
        .guide-section > header h3 {
          margin: 5px 0 17px;
          font-size: 21px;
        }
        .guide-card-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 9px;
        }
        .guide-card-grid article {
          padding: 15px;
          border-radius: 12px;
          background: #f4f8f5;
        }
        .guide-card-grid b,
        .guide-card-grid span {
          display: block;
        }
        .guide-card-grid b {
          margin-bottom: 5px;
          color: #285f3e;
          font-size: 13px;
        }
        .guide-card-grid span {
          color: #69766e;
          font-size: 12px;
          line-height: 1.65;
        }
        .guide-section.warn {
          border-color: #edd7aa;
          background: #fffdf8;
        }
        .guide-section.warn .guide-card-grid article {
          background: #fff7e8;
        }
        .guide-section.warn .guide-card-grid b {
          color: #94601a;
        }
        .guide-section.parent .guide-card-grid article {
          background: #eef5fa;
        }
        .guide-section.parent .guide-card-grid b {
          color: #315f7c;
        }
        .guide-help {
          display: flex;
          gap: 13px;
          align-items: center;
          margin-top: 17px;
          padding: 18px 21px;
          border-radius: 14px;
          background: #253e31;
          color: #fff;
        }
        .guide-help span {
          color: #cedbd3;
          font-size: 12px;
          line-height: 1.6;
        }
        @media (max-width: 720px) {
          .sos-user-guide {
            padding: 0 14px;
          }
          .guide-cover {
            align-items: flex-start;
            flex-direction: column;
            padding: 23px;
          }
          .guide-cover h2 {
            font-size: 23px;
          }
          .guide-cover > b {
            font-size: 10px;
          }
          .guide-card-grid {
            grid-template-columns: 1fr;
          }
          .guide-section {
            padding: 18px;
          }
          .guide-help {
            align-items: flex-start;
            flex-direction: column;
          }
          .guide-flow article {
            padding: 15px;
          }
          .guide-flow i {
            flex-basis: 36px;
            height: 36px;
            font-size: 11px;
          }
        }
      `}</style>
    </section>
  );
}

function GuideSection({
  title,
  eyebrow,
  items,
  tone = "",
}: {
  title: string;
  eyebrow: string;
  items: string[][];
  tone?: string;
}) {
  return (
    <section className={`guide-section ${tone}`}>
      <header>
        <small>{eyebrow}</small>
        <h3>{title}</h3>
      </header>
      <div className="guide-card-grid">
        {items.map(([name, text]) => (
          <article key={name}>
            <b>{name}</b>
            <span>{text}</span>
          </article>
        ))}
      </div>
    </section>
  );
}
