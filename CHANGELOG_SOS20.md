# SOS20 변경사항

## OpenAI PDF 전달 오류 수정

- Responses API의 `input_file` 항목에서 `file_url`과 `filename`을 동시에 전달하던 문제를 수정했습니다.
- 시험지 PDF와 해설지 PDF는 각각 `file_url`만 전달합니다.
- 수정 대상:
  - `POST /api/analysis/probe`
  - `POST /api/analysis/start`

기존 오류:

```text
Mutually exclusive parameters: Ensure you are only providing one of 'file_id' or 'filename'.
```

이 버전은 별도 SQL 실행이 필요하지 않습니다.
