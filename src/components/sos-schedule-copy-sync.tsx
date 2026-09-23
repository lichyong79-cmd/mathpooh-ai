"use client";

import { useEffect } from "react";
import { SOS_DEFAULT_START_LABEL } from "@/lib/sos-schedule";

const LEGACY_LABEL = "수요일 밤 11시";

/**
 * ParentPortal의 기존 신청 카드에 남아 있는 고정 시간 문구를
 * 현재 SOS 기본 운영시간과 맞춘다. 해당 원문이 제거되면 아무 작업도 하지 않는다.
 */
export default function SosScheduleCopySync() {
  useEffect(() => {
    const sync = () => {
      document
        .querySelectorAll<HTMLElement>(".application-cycle-grid label > span")
        .forEach((node) => {
          if (node.textContent?.trim() === LEGACY_LABEL)
            node.textContent = SOS_DEFAULT_START_LABEL;
        });
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
