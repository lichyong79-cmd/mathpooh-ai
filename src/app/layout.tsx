import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "SOS · Score Optimization System", description: "AI 기반 수학 실전 분석과 개인별 공략 훈련" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="ko"><body>{children}</body></html>; }
