import type { Metadata, Viewport } from "next";
import "./globals.css";
import GlobalWaitOverlay from "../components/global-wait-overlay";
export const metadata: Metadata = { title: "SOS · Score Optimization System", description: "AI 기반 수학 실전 분석과 개인별 공략 훈련" };

// SOS283: viewport 메타가 없어서 모바일 브라우저가 데스크톱 폭(980px)으로 가정하고
// 화면 전체를 축소해 그렸다. 글씨가 작아지고 반응형 CSS의 @media도 의도대로 걸리지 않는다.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",   // 노치 있는 기기에서 좌우가 잘리지 않게
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="ko"><body>{children}<GlobalWaitOverlay/></body></html>; }
