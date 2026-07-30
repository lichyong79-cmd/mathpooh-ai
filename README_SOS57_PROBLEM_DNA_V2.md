# SOS57 · Problem DNA V2 기반 구축

## 적용 내용
- 문항 분석 결과를 `problem-dna-v2.0` 단일 온톨로지로 통일
- 10개 분석 영역: 기본정보, 개념, 사고, 계산, 난이도, 출제의도, 예상오류, 함정, 교육가치, AI 요약
- 모든 태그에 `evidence`와 `confidence` 저장
- AI JSON Schema 강제 및 서버 2차 검증
- 기존 화면 호환용 subject/unit/topic/difficulty/summary 자동 생성
- 문제은행 등록 시 `problem_dna`, `dna_tags`, 분석 버전, DNA 기반 embedding 저장
- 교사 수정 보호용 `teacher_overrides`, `locked_fields` 컬럼 추가

## 먼저 실행할 SQL
Supabase SQL Editor에서 아래 파일을 1회 실행합니다.

`supabase-v2.2-problem-dna-v2.sql`

SQL 실행 전에 배포하면 새 컬럼이 없어 분석 저장 단계에서 오류가 납니다.

## 분석 흐름
시험지+해설지 업로드 → 빠른 자르기 → Problem DNA V2 분석 → JSON 검증 →
저신뢰/검토필요 문항은 REVIEW → 안전 문항은 AUTO_REGISTERED → 문제은행 등록

## 다음 단계
문제은행 상세화면에 DNA 전체 조회/수정 UI와 필드 잠금 기능을 연결합니다.
