import { Suspense } from "react";
import ProblemBankClient from "./ProblemBankClient";

export default function ProblemBankPage() {
  return (
    <Suspense
      fallback={
        <main
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            background: "#f4f6fa",
            color: "#315f39",
            fontWeight: 800,
          }}
        >
          문제은행을 불러오는 중입니다.
        </main>
      }
    >
      <ProblemBankClient />
    </Suspense>
  );
}
