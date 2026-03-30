import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);

/**
 * 判断是否 A 股基金常用交易时段（可扩展节假日日历）
 * 周一至周五 9:30–15:00（北京时间 UTC+8），含午休；午休期间仍按「盘中」展示估值（gsz）
 */
export function isTradingTime(now: Date = new Date()): boolean {
  const t = dayjs.utc(now).utcOffset(8);
  const day = t.day();
  if (day === 0 || day === 6) {
    return false;
  }
  const minutes = t.hour() * 60 + t.minute();
  const sessionStart = 9 * 60 + 30;
  const sessionEnd = 15 * 60;
  return minutes >= sessionStart && minutes <= sessionEnd;
}
