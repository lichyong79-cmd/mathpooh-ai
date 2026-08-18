"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  estimateNumberBox,
  measureNumberBox,
  parseOriginalQuestionNo,
  type NumberMaskBox,
} from "@/lib/crop/question-number-mask";

/**
 * 진단·훈련 화면의 문항 이미지.
 *
 * maskOriginalNumber 가 켜지면 원본 시험지에 인쇄된 문항번호의 위치를
 * 이미지에서 직접 측정해서, 딱 그 자리에만 로고를 덮는다.
 * 가림막과 로고가 같은 상자를 쓰므로 "로고 따로 · 번호 따로"가 생기지 않고,
 * 상자 크기가 글자 줄 높이에 묶여 있으므로 본문을 덮지도 않는다.
 */
export default function SosProblemImage({
  src,
  alt,
  maskOriginalNumber = false,
  problemCode = "",
}: {
  src: string;
  alt: string;
  maskOriginalNumber?: boolean;
  /** problem_bank_questions.problem_code (`<시험지 UUID>-013`). 있으면 정확도가 올라간다. */
  problemCode?: string;
}) {
  const imageRef = useRef<HTMLImageElement | null>(null);
  const runRef = useRef(0);
  const [box, setBox] = useState<NumberMaskBox | null>(null);
  const [measuring, setMeasuring] = useState(maskOriginalNumber);

  const analyse = useCallback(() => {
    if (!maskOriginalNumber) return;
    const element = imageRef.current;
    if (!element) return;

    const naturalWidth = element.naturalWidth;
    const naturalHeight = element.naturalHeight;
    if (!naturalWidth || !naturalHeight) return;

    const run = runRef.current;
    const originalNo = parseOriginalQuestionNo(problemCode);

    // 1차: 화면에 이미 그려진 이미지로 바로 측정한다(추가 네트워크 요청 없음).
    const direct = measureNumberBox(element, naturalWidth, naturalHeight, originalNo);
    if (direct) {
      setBox(direct);
      setMeasuring(false);
      return;
    }

    // 2차: 다른 도메인 이미지라 캔버스가 오염된 경우 CORS 요청으로 한 번 더 시도.
    const probe = new Image();
    probe.crossOrigin = "anonymous";
    probe.decoding = "async";
    probe.onload = () => {
      if (runRef.current !== run) return;
      const retry = measureNumberBox(
        probe,
        probe.naturalWidth || naturalWidth,
        probe.naturalHeight || naturalHeight,
        originalNo,
      );
      setBox(retry ?? estimateNumberBox(naturalWidth, naturalHeight, originalNo));
      setMeasuring(false);
    };
    probe.onerror = () => {
      if (runRef.current !== run) return;
      setBox(estimateNumberBox(naturalWidth, naturalHeight, originalNo));
      setMeasuring(false);
    };
    probe.src = src;
  }, [maskOriginalNumber, problemCode, src]);

  useEffect(() => {
    runRef.current += 1;
    setBox(null);
    setMeasuring(maskOriginalNumber);
    if (!maskOriginalNumber) return;
    const element = imageRef.current;
    // 캐시된 이미지는 onLoad 가 안 뜰 수 있으므로 여기서도 한 번 확인한다.
    if (element?.complete && element.naturalWidth) analyse();
  }, [src, maskOriginalNumber, analyse]);

  const hideUntilMeasured = maskOriginalNumber && measuring;

  return (
    <div className={`sos-problem-image-wrap${hideUntilMeasured ? " is-measuring" : ""}`}>
      <img
        ref={imageRef}
        src={src}
        alt={alt}
        onLoad={() => analyse()}
        onError={() => setMeasuring(false)}
      />
      {maskOriginalNumber && box ? (
        <span className="sos-origin-mask-layer" aria-hidden="true">
          <span
            className="sos-origin-logo"
            style={{
              left: `${box.leftPct}%`,
              top: `${box.topPct}%`,
              width: `${box.widthPct}%`,
              height: `${box.heightPct}%`,
            }}
          >
            <img src="/sos-mini-logo.png" alt="" />
          </span>
        </span>
      ) : null}
    </div>
  );
}
