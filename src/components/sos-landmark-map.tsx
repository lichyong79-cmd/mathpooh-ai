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
            <path d="M410 68 C455 48 520 52 565 78 C604 101 625 132 621 169 C617 201 632 226 654 250 C679 277 682 309 670 337 C657 365 672 394 700 420 C731 449 737 483 716 512 C694 542 656 553 621 566 C585 580 553 610 511 607 C470 604 446 579 415 557 C383 534 345 529 320 500 C295 471 295 437 310 405 C326 371 316 340 299 310 C281 278 282 244 300 216 C321 184 342 163 354 132 C367 99 382 80 410 68 Z" fill="url(#landFill)" stroke="#4dc2d8" strokeWidth="3" />
            <path d="M410 55 C455 35 520 39 565 65 C604 88 625 119 621 156 C617 188 632 213 654 237 C679 264 682 296 670 324 C657 352 672 381 700 407 C731 436 737 470 716 499 C694 529 656 540 621 553 C585 567 553 597 511 594 C470 591 446 566 415 544 C383 521 345 516 320 487 C295 458 295 424 310 392 C326 358 316 327 299 297 C281 265 282 231 300 203 C321 171 342 150 354 119 C367 86 382 67 410 55 Z" fill="url(#landTop)" stroke="#65d7e7" strokeWidth="2.5" />
            <path d="M335 172 C392 194 448 211 502 243 C552 273 594 304 646 350" fill="none" stroke="#4297a8" strokeWidth="2" opacity="0.72" />
            <path d="M321 384 C386 358 445 373 500 410 C554 446 612 468 682 474" fill="none" stroke="#397e91" strokeWidth="2" opacity="0.64" />
            <path d="M414 88 C438 160 421 240 449 318 C474 385 523 452 566 565" fill="none" stroke="#34798c" strokeWidth="2" opacity="0.55" />
          </g>

          {[[350,170],[370,183],[395,176],[430,195],[465,218],[505,246],[544,273],[584,304],[620,338],[652,373],[682,419],[694,463],[661,506],[618,541],[566,571],[514,576],[465,552],[419,522],[375,488],[340,447],[325,399],[333,350],[315,301],[302,253],[319,210]].map(([x,y], i) => (
            <circle key={i} cx={x} cy={y} r={i % 4 === 0 ? 4 : 2.4} fill={i % 3 === 0 ? "#ffd86b" : "#78dfff"} opacity="0.9" filter="url(#cityGlow)" />
          ))}
          <g className="map-place-labels">
            <text x="337" y="157">서울</text><text x="672" y="448">부산</text><text x="576" y="323">대구</text><text x="444" y="332">대전</text><text x="355" y="448">광주</text>
          </g>

          <g className="landmark-svg algebra-building" transform="translate(300 178) scale(.72) skewX(-4)" onClick={() => onSelect("대수")}>
            <ellipse cx="65" cy="246" rx="78" ry="17" fill="#020b12" opacity="0.7" />
            <path d="M16 238 L32 18 L115 0 L126 238 Z" fill="#172531" stroke="#6f7c82" strokeWidth="2" opacity="0.82" />
            <g clipPath="url(#clipAlgebra)">
              <path d="M16 238 L32 18 L115 0 L126 238 Z" fill="url(#goldBuilding)" />
              {Array.from({ length: 13 }, (_, i) => <line key={i} x1="24" y1={24 + i * 16} x2="121" y2={10 + i * 17} stroke="#ffe89a" strokeWidth="4" opacity="0.65" />)}
            </g>
            {algebra < 90 ? <g className="construction-lines"><line x1="3" y1="238" x2="120" y2="15"/><line x1="126" y1="238" x2="30" y2="18"/><line x1="5" y1="84" x2="133" y2="84"/><line x1="3" y1="146" x2="132" y2="146"/></g> : null}
          </g>

          <g className="landmark-svg calculus-building" transform="translate(386 78) scale(.70)" onClick={() => onSelect("미적분1")}>
            <ellipse cx="58" cy="310" rx="70" ry="16" fill="#020b12" opacity="0.72" />
            <path d="M18 300 C23 204 31 112 48 25 L58 0 L68 25 C85 112 93 204 98 300 Z" fill="#142736" stroke="#54788f" strokeWidth="2" opacity="0.85" />
            <g clipPath="url(#clipCalculus)">
              <path d="M18 300 C23 204 31 112 48 25 L58 0 L68 25 C85 112 93 204 98 300 Z" fill="url(#blueBuilding)" />
              {Array.from({ length: 15 }, (_, i) => <line key={i} x1={24 + i * .5} y1={286 - i * 18} x2={92 - i * .5} y2={286 - i * 18} stroke="#8fd9ff" strokeWidth="4" opacity="0.68" />)}
            </g>
            {calculus < 90 ? <g className="construction-lines"><line x1="7" y1="300" x2="58" y2="0"/><line x1="108" y1="300" x2="58" y2="0"/><line x1="10" y1="113" x2="104" y2="113"/><line x1="9" y1="202" x2="106" y2="202"/></g> : null}
          </g>

          <g className="landmark-svg statistics-building" transform="translate(642 374) scale(.92)" onClick={() => onSelect("확률과통계")}>
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
