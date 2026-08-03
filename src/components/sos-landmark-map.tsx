"use client";

type SubjectName = "대수" | "미적분1" | "확률과통계";

type LandmarkProgress = {
  best: number;
  recent: number;
  attempts: number;
};

type Props = {
  data: Record<SubjectName, LandmarkProgress>;
  onSelect: (subject: SubjectName) => void;
};

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value || 0)));

function stageLabel(progress: number) {
  if (progress >= 90) return "랜드마크 완공";
  if (progress >= 80) return "외관 마감 중";
  if (progress >= 70) return "야간 조명 공사";
  if (progress >= 60) return "상층부 완성";
  if (progress >= 50) return "유리 외벽 시공";
  if (progress >= 40) return "외벽 공사 시작";
  if (progress >= 30) return "중층 골조 공사";
  if (progress >= 20) return "저층 골조 공사";
  if (progress >= 10) return "기초 공사";
  return "부지 조성 중";
}

function LandmarkLabel({
  subject,
  place,
  progress,
  className,
  onClick,
}: {
  subject: SubjectName;
  place: string;
  progress: number;
  className: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`landmark-label ${className}`} onClick={onClick}>
      <span>{place}</span>
      <strong>{subject}</strong>
      <b>{progress}%</b>
      <small>{stageLabel(progress)}</small>
    </button>
  );
}

export default function SOSLandmarkMap({ data, onSelect }: Props) {
  const algebra = clamp(data.대수.best);
  const calculus = clamp(data.미적분1.best);
  const statistics = clamp(data.확률과통계.best);
  const recentValues = [data.대수.recent, data.미적분1.recent, data.확률과통계.recent].filter((v) => v > 0);
  const cityCondition = recentValues.length
    ? Math.round(recentValues.reduce((sum, value) => sum + value, 0) / recentValues.length)
    : 0;
  const weather = cityCondition >= 80 ? "clear" : cityCondition >= 60 ? "normal" : "cloudy";

  return (
    <section className={`sos-landmark-map weather-${weather}`} aria-label="SOS 대한민국 랜드마크">
      <div className="landmark-map-head">
        <div>
          <small>MATHPOOH SOS</small>
          <h1>SOS LANDMARK</h1>
          <p>실전모의고사 최고 기록으로 나만의 대한민국을 건설하세요.</p>
        </div>
        <div className="city-condition-card">
          <span>최근 도시 컨디션</span>
          <b>{cityCondition || "-"}<em>{cityCondition ? "%" : ""}</em></b>
          <small>{weather === "clear" ? "맑고 활기찬 도시" : weather === "normal" ? "안정적인 도시" : "보수 공사 중"}</small>
        </div>
      </div>

      <div className="landmark-stage">
        <div className="landmark-stars" aria-hidden="true" />
        <div className="weather-cloud cloud-one" aria-hidden="true" />
        <div className="weather-cloud cloud-two" aria-hidden="true" />
        <div className="weather-rain" aria-hidden="true" />

        <svg className="korea-relief" viewBox="0 0 1100 650" role="img" aria-label="대한민국 3D 야경 지도">
          <defs>
            <linearGradient id="landFill" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#183c52" />
              <stop offset="0.55" stopColor="#0f2b3c" />
              <stop offset="1" stopColor="#071c2b" />
            </linearGradient>
            <linearGradient id="landTop" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#2b6474" />
              <stop offset="1" stopColor="#103a4e" />
            </linearGradient>
            <filter id="mapShadow" x="-30%" y="-30%" width="160%" height="180%">
              <feDropShadow dx="0" dy="26" stdDeviation="20" floodColor="#000814" floodOpacity="0.75" />
            </filter>
            <filter id="cityGlow" x="-300%" y="-300%" width="700%" height="700%">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <clipPath id="clipAlgebra"><rect x="0" y={240 - algebra * 2.4} width="130" height={algebra * 2.4} /></clipPath>
            <clipPath id="clipCalculus"><rect x="0" y={300 - calculus * 3} width="120" height={calculus * 3} /></clipPath>
            <clipPath id="clipStatistics"><rect x="0" y={230 - statistics * 2.3} width="180" height={statistics * 2.3} /></clipPath>
          </defs>

          <ellipse cx="550" cy="555" rx="420" ry="72" fill="#03121d" opacity="0.78" />
          <g filter="url(#mapShadow)" transform="translate(0 20)">
            <path d="M440 60 C505 45 570 60 620 95 C670 132 690 190 675 238 C660 284 684 323 723 351 C768 384 788 435 756 480 C726 521 675 532 637 565 C596 602 530 610 482 585 C443 565 418 526 377 508 C326 485 289 448 300 398 C312 346 286 310 268 269 C248 223 266 176 304 144 C344 110 388 78 440 60 Z" fill="url(#landFill)" stroke="#4dc2d8" strokeWidth="3" />
            <path d="M440 49 C505 34 570 49 620 84 C670 121 690 179 675 227 C660 273 684 312 723 340 C768 373 788 424 756 469 C726 510 675 521 637 554 C596 591 530 599 482 574 C443 554 418 515 377 497 C326 474 289 437 300 387 C312 335 286 299 268 258 C248 212 266 165 304 133 C344 99 388 67 440 49 Z" fill="url(#landTop)" stroke="#65d7e7" strokeWidth="2.5" />
            <path d="M334 155 C410 190 468 230 540 250 C605 268 650 317 705 370" fill="none" stroke="#4297a8" strokeWidth="2" opacity="0.72" />
            <path d="M320 360 C395 335 452 364 515 405 C576 445 635 465 708 464" fill="none" stroke="#397e91" strokeWidth="2" opacity="0.64" />
            <path d="M400 100 C438 178 412 260 448 332 C478 390 532 444 584 548" fill="none" stroke="#34798c" strokeWidth="2" opacity="0.55" />
          </g>

          {[[356,165],[382,184],[418,175],[452,206],[490,224],[528,249],[562,271],[600,300],[636,333],[677,372],[707,416],[684,467],[638,505],[582,548],[518,558],[458,530],[401,493],[355,448],[329,399],[343,340],[316,282],[302,225]].map(([x,y], i) => (
            <circle key={i} cx={x} cy={y} r={i % 4 === 0 ? 4 : 2.4} fill={i % 3 === 0 ? "#ffd86b" : "#78dfff"} opacity="0.9" filter="url(#cityGlow)" />
          ))}
          <g className="map-place-labels">
            <text x="330" y="151">서울</text><text x="704" y="442">부산</text><text x="577" y="282">대구</text><text x="425" y="332">대전</text><text x="356" y="432">광주</text>
          </g>

          <g className="landmark-svg algebra-building" transform="translate(300 192) skewX(-4)" onClick={() => onSelect("대수")}>
            <ellipse cx="65" cy="246" rx="78" ry="17" fill="#020b12" opacity="0.7" />
            <path d="M16 238 L32 18 L115 0 L126 238 Z" fill="#172531" stroke="#6f7c82" strokeWidth="2" opacity="0.82" />
            <g clipPath="url(#clipAlgebra)">
              <path d="M16 238 L32 18 L115 0 L126 238 Z" fill="url(#goldBuilding)" />
              {Array.from({ length: 13 }, (_, i) => <line key={i} x1="24" y1={24 + i * 16} x2="121" y2={10 + i * 17} stroke="#ffe89a" strokeWidth="4" opacity="0.65" />)}
            </g>
            {algebra < 90 ? <g className="construction-lines"><line x1="3" y1="238" x2="120" y2="15"/><line x1="126" y1="238" x2="30" y2="18"/><line x1="5" y1="84" x2="133" y2="84"/><line x1="3" y1="146" x2="132" y2="146"/></g> : null}
          </g>

          <g className="landmark-svg calculus-building" transform="translate(472 103) scale(.88)" onClick={() => onSelect("미적분1")}>
            <ellipse cx="58" cy="310" rx="70" ry="16" fill="#020b12" opacity="0.72" />
            <path d="M18 300 C23 204 31 112 48 25 L58 0 L68 25 C85 112 93 204 98 300 Z" fill="#142736" stroke="#54788f" strokeWidth="2" opacity="0.85" />
            <g clipPath="url(#clipCalculus)">
              <path d="M18 300 C23 204 31 112 48 25 L58 0 L68 25 C85 112 93 204 98 300 Z" fill="url(#blueBuilding)" />
              {Array.from({ length: 15 }, (_, i) => <line key={i} x1={24 + i * .5} y1={286 - i * 18} x2={92 - i * .5} y2={286 - i * 18} stroke="#8fd9ff" strokeWidth="4" opacity="0.68" />)}
            </g>
            {calculus < 90 ? <g className="construction-lines"><line x1="7" y1="300" x2="58" y2="0"/><line x1="108" y1="300" x2="58" y2="0"/><line x1="10" y1="113" x2="104" y2="113"/><line x1="9" y1="202" x2="106" y2="202"/></g> : null}
          </g>

          <g className="landmark-svg statistics-building" transform="translate(675 386)" onClick={() => onSelect("확률과통계")}>
            <ellipse cx="92" cy="238" rx="105" ry="18" fill="#020b12" opacity="0.72" />
            <g fill="#132a31" stroke="#4f8178" strokeWidth="2" opacity="0.88">
              <path d="M5 230 L20 45 L67 30 L72 230 Z"/><path d="M60 230 L76 10 L126 0 L132 230 Z"/><path d="M120 230 L137 60 L176 48 L181 230 Z"/>
            </g>
            <g clipPath="url(#clipStatistics)">
              <path d="M5 230 L20 45 L67 30 L72 230 Z" fill="#0c8f77"/><path d="M60 230 L76 10 L126 0 L132 230 Z" fill="#13b68d"/><path d="M120 230 L137 60 L176 48 L181 230 Z" fill="#087d6c"/>
              {Array.from({ length: 10 }, (_, i) => <g key={i} stroke="#9affd8" strokeWidth="3" opacity="0.65"><line x1="14" y1={216-i*16} x2="70" y2={216-i*16}/><line x1="68" y1={216-i*19} x2="130" y2={216-i*19}/><line x1="128" y1={216-i*15} x2="180" y2={216-i*15}/></g>)}
            </g>
            {statistics < 90 ? <g className="construction-lines"><line x1="0" y1="230" x2="74" y2="10"/><line x1="185" y1="230" x2="76" y2="10"/><line x1="0" y1="145" x2="184" y2="145"/></g> : null}
          </g>

          <defs>
            <linearGradient id="goldBuilding" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#ffd968"/><stop offset=".45" stopColor="#b97817"/><stop offset="1" stopColor="#58310b"/></linearGradient>
            <linearGradient id="blueBuilding" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#8ddaff"/><stop offset=".45" stopColor="#2588c6"/><stop offset="1" stopColor="#0d3559"/></linearGradient>
          </defs>
        </svg>

        <LandmarkLabel subject="대수" place="서울 · 63빌딩" progress={algebra} className="label-algebra" onClick={() => onSelect("대수")} />
        <LandmarkLabel subject="미적분1" place="서울 · 롯데월드타워" progress={calculus} className="label-calculus" onClick={() => onSelect("미적분1")} />
        <LandmarkLabel subject="확률과통계" place="부산 · 해운대 LCT" progress={statistics} className="label-statistics" onClick={() => onSelect("확률과통계")} />
      </div>

      <div className="landmark-map-foot">
        <span><i className="dot gold" />대수 최고 기록 {algebra}%</span>
        <span><i className="dot blue" />미적분1 최고 기록 {calculus}%</span>
        <span><i className="dot green" />확률과통계 최고 기록 {statistics}%</span>
        <b>건물을 누르면 상세 현황을 확인할 수 있습니다.</b>
      </div>
    </section>
  );
}
