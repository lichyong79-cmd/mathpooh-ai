-- SOS v1.2: 한글 원본 + 시험지 PDF + 해설지 PDF 세트 등록
-- Supabase SQL Editor에서 한 번 실행하세요.

alter table public.source_files
  add column if not exists grade text,
  add column if not exists subject text,
  add column if not exists hwp_path text,
  add column if not exists exam_pdf_path text,
  add column if not exists solution_pdf_path text,
  add column if not exists original_hwp_name text,
  add column if not exists exam_pdf_name text,
  add column if not exists solution_pdf_name text;

-- 기존 단일 PDF 데이터 호환
update public.source_files
set exam_pdf_path = storage_path
where exam_pdf_path is null and storage_path is not null;
