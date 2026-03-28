import { DateTime } from "luxon";

/**
 * 用户输入的 Y-M-D H:M 视为 timeZone（IANA）下的本地墙钟时间，转为 UTC 时刻。
 */
export function zonedWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): Date {
  const dt = DateTime.fromObject({ year, month, day, hour, minute, second: 0 }, { zone: timeZone });
  if (!dt.isValid) throw new Error("invalid_zoned_local_time");
  return new Date(dt.toMillis());
}

/** 该时区在 utcMs 处相对 UTC 的偏移（分钟，东为正），用于标准经度 ≈ (offset/60)*15° */
export function utcOffsetMinutesEastOfUtc(utcMs: number, timeZone: string): number {
  return DateTime.fromMillis(utcMs, { zone: "utc" }).setZone(timeZone).offset;
}

/** 该时区在 utcMs 处使用的标准经度（东经为正、西经为负） */
export function standardMeridianEastDegrees(timeZone: string, utcMs: number): number {
  return (utcOffsetMinutesEastOfUtc(utcMs, timeZone) / 60) * 15;
}

/** 将 UTC 时刻换为东八区拆解，供 lunar-javascript Solar.fromYmdHms（库惯例） */
export function utcInstantToBeijingYmdHms(d: Date): { y: number; m: number; d: number; h: number; mi: number; s: number } {
  const dt = DateTime.fromJSDate(d, { zone: "utc" }).setZone("Asia/Shanghai");
  return {
    y: dt.year,
    m: dt.month,
    d: dt.day,
    h: dt.hour,
    mi: dt.minute,
    s: dt.second,
  };
}

export function formatDateTimeInZone(utcDate: Date, timeZone: string): string {
  return DateTime.fromJSDate(utcDate, { zone: "utc" }).setZone(timeZone).toFormat("yyyy-MM-dd HH:mm:ss");
}
