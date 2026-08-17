# SOS245 난이도 검증실패 진단/집계 수정

- 표본 결과는 문항 ID당 최종 상태 1개만 집계합니다.
- `기준 유지 / 기준과 변경 / 미판정 / 검토필요 / 검증실패`는 상호배타적이며 합계가 표본 수와 일치합니다.
- 재검증 성공 시 기존 실패 상태를 교체하며 누적하지 않습니다.
- 재검증 완료 메시지의 복구/실패 숫자를 state updater 부작용 없이 실제 응답 기준으로 계산합니다.
- 실패 원인을 timeout / HTTP 429/4xx/5xx / response JSON / incomplete(max_output_tokens/content_filter) / empty response / structured JSON parse로 분리합니다.
- 실패 단계도 독립 재풀이 / 난이도 판정으로 표시합니다.
- 카드의 `기술 상세`에서 API status/incomplete reason/output type을 확인할 수 있습니다.
- OpenAI Responses API max_output_tokens를 1차 5000, 자동 재시도 7000으로 확대했습니다. reasoning token도 max_output_tokens에 포함되므로 SOS244의 반복 빈 응답 가능성을 낮춥니다.
- 검증실패가 1개라도 남아 있으면 ② 전체 재판정은 계속 잠깁니다.
- 표본검증/재검증은 DB 난이도를 변경하지 않습니다.
