export const SOS_DEFAULT_START_TIME = "22:20";
export const SOS_DEFAULT_START_LABEL = "수요일 밤 10시 20분";

export function sosScheduledAtForDate(startDate: string) {
  const date = String(startDate ?? "").trim();
  return date ? `${date}T${SOS_DEFAULT_START_TIME}:00+09:00` : "";
}

export function sosCycleStartLabel(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return SOS_DEFAULT_START_LABEL;
  const date = new Date(raw);
  if (!Number.isFinite(date.getTime())) return SOS_DEFAULT_START_LABEL;

  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  const weekday = part("weekday") || "수요일";
  const hour24 = Number(part("hour"));
  const minute = Number(part("minute"));
  if (!Number.isFinite(hour24) || !Number.isFinite(minute))
    return SOS_DEFAULT_START_LABEL;

  const period = hour24 >= 18 ? "밤" : hour24 >= 12 ? "오후" : "오전";
  const hour12 = hour24 % 12 || 12;
  return `${weekday} ${period} ${hour12}시${minute ? ` ${minute}분` : ""}`;
}
