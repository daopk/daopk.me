export interface VietnameseLunarDate {
  readonly day: number;
  readonly month: number;
  readonly year: number;
  readonly isLeapMonth: boolean;
}

const SUPPORTED_GREGORIAN_START_YEAR = 1900;
const SUPPORTED_GREGORIAN_END_YEAR = 2100;
const VIETNAM_TIMEZONE = 7;
const JULIAN_DAY_BASE = 2_415_021.076998695;
const SYNODIC_MONTH = 29.530588853;
const DISPLAY_STEMS = ["Giáp", "Ất", "Bính", "Đinh", "Mậu", "Kỷ", "Canh", "Tân", "Nhâm", "Quý"];
const DISPLAY_BRANCHES = [
  "Tý",
  "Sửu",
  "Dần",
  "Mão",
  "Thìn",
  "Tỵ",
  "Ngọ",
  "Mùi",
  "Thân",
  "Dậu",
  "Tuất",
  "Hợi",
];

export function gregorianToVietnameseLunar(date: Date): VietnameseLunarDate | null {
  const year = date.getFullYear();
  if (year < SUPPORTED_GREGORIAN_START_YEAR || year > SUPPORTED_GREGORIAN_END_YEAR) {
    return null;
  }

  const dayNumber = julianDayFromGregorianDate(date.getDate(), date.getMonth() + 1, year);
  const k = Math.floor((dayNumber - JULIAN_DAY_BASE) / SYNODIC_MONTH);
  let monthStart = newMoonDay(k + 1, VIETNAM_TIMEZONE);
  if (monthStart > dayNumber) {
    monthStart = newMoonDay(k, VIETNAM_TIMEZONE);
  }

  let month11Start = lunarMonth11Start(year, VIETNAM_TIMEZONE);
  let nextMonth11Start = month11Start;
  let lunarYear: number;

  if (month11Start >= monthStart) {
    lunarYear = year;
    month11Start = lunarMonth11Start(year - 1, VIETNAM_TIMEZONE);
  } else {
    lunarYear = year + 1;
    nextMonth11Start = lunarMonth11Start(year + 1, VIETNAM_TIMEZONE);
  }

  const day = dayNumber - monthStart + 1;
  const monthDiff = Math.floor((monthStart - month11Start) / 29);
  let month = monthDiff + 11;
  let isLeapMonth = false;

  if (nextMonth11Start - month11Start > 365) {
    const leapMonthDiff = leapMonthOffset(month11Start, VIETNAM_TIMEZONE);
    if (monthDiff >= leapMonthDiff) {
      month = monthDiff + 10;
      isLeapMonth = monthDiff === leapMonthDiff;
    }
  }

  if (month > 12) {
    month -= 12;
  }
  if (month >= 11 && monthDiff < 4) {
    lunarYear -= 1;
  }

  return { day, month, year: lunarYear, isLeapMonth };
}

export function formatVietnameseLunarShort(lunar: VietnameseLunarDate): string {
  const leapMark = lunar.isLeapMonth ? "N" : "";
  if (lunar.day === 1) {
    return `Tháng ${lunar.month}${leapMark}`;
  }

  return `${lunar.day}/${lunar.month}${leapMark}`;
}

export function formatVietnameseLunarLong(lunar: VietnameseLunarDate): string {
  const leapLabel = lunar.isLeapMonth ? " nhuận" : "";
  return `Âm lịch: ${lunar.day} tháng ${lunar.month}${leapLabel}, ${canChiYear(lunar.year)}`;
}

export function formatVietnameseLunarMonth(lunar: VietnameseLunarDate): string {
  const leapLabel = lunar.isLeapMonth ? " nhuận" : "";
  return `Tháng ${lunar.month}${leapLabel}`;
}

export function formatVietnameseLunarYear(lunar: VietnameseLunarDate): string {
  return canChiYear(lunar.year);
}

function canChiYear(year: number): string {
  const stemIndex = positiveModulo(year + 6, DISPLAY_STEMS.length);
  const branchIndex = positiveModulo(year + 8, DISPLAY_BRANCHES.length);
  return `${DISPLAY_STEMS[stemIndex]} ${DISPLAY_BRANCHES[branchIndex]}`;
}

function julianDayFromGregorianDate(day: number, month: number, year: number): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  let jd =
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045;

  if (jd < 2_299_161) {
    jd = day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - 32083;
  }

  return jd;
}

function newMoonDay(k: number, timezone: number): number {
  const t = k / 1236.85;
  const t2 = t * t;
  const t3 = t2 * t;
  const dr = Math.PI / 180;
  let jd =
    2_415_020.75933 +
    SYNODIC_MONTH * k +
    0.0001178 * t2 -
    0.000000155 * t3 +
    0.00033 * Math.sin((166.56 + 132.87 * t - 0.009173 * t2) * dr);
  const m = 359.2242 + 29.10535608 * k - 0.0000333 * t2 - 0.00000347 * t3;
  const mPrime = 306.0253 + 385.81691806 * k + 0.0107306 * t2 + 0.00001236 * t3;
  const f = 21.2964 + 390.67050646 * k - 0.0016528 * t2 - 0.00000239 * t3;
  const correction =
    (0.1734 - 0.000393 * t) * Math.sin(m * dr) +
    0.0021 * Math.sin(2 * m * dr) -
    0.4068 * Math.sin(mPrime * dr) +
    0.0161 * Math.sin(2 * mPrime * dr) -
    0.0004 * Math.sin(3 * mPrime * dr) +
    0.0104 * Math.sin(2 * f * dr) -
    0.0051 * Math.sin((m + mPrime) * dr) -
    0.0074 * Math.sin((m - mPrime) * dr) +
    0.0004 * Math.sin((2 * f + m) * dr) -
    0.0004 * Math.sin((2 * f - m) * dr) -
    0.0006 * Math.sin((2 * f + mPrime) * dr) +
    0.001 * Math.sin((2 * f - mPrime) * dr) +
    0.0005 * Math.sin((2 * mPrime + m) * dr);
  const deltaT =
    t < -11
      ? 0.001 + 0.000839 * t + 0.0002261 * t2 - 0.00000845 * t3 - 0.000000081 * t * t3
      : -0.000278 + 0.000265 * t + 0.000262 * t2;

  jd += correction - deltaT;
  return Math.floor(jd + 0.5 + timezone / 24);
}

function sunLongitudeSector(julianDay: number, timezone: number): number {
  const t = (julianDay - 2_451_545.5 - timezone / 24) / 36525;
  const t2 = t * t;
  const dr = Math.PI / 180;
  const meanAnomaly = 357.5291 + 35_999.0503 * t - 0.0001559 * t2 - 0.00000048 * t * t2;
  const meanLongitude = 280.46645 + 36_000.76983 * t + 0.0003032 * t2;
  const longitudeCorrection =
    (1.9146 - 0.004817 * t - 0.000014 * t2) * Math.sin(meanAnomaly * dr) +
    (0.019993 - 0.000101 * t) * Math.sin(2 * meanAnomaly * dr) +
    0.00029 * Math.sin(3 * meanAnomaly * dr);
  const trueLongitude = positiveModulo((meanLongitude + longitudeCorrection) * dr, 2 * Math.PI);

  return Math.floor((trueLongitude / Math.PI) * 6);
}

function lunarMonth11Start(year: number, timezone: number): number {
  const offset = julianDayFromGregorianDate(31, 12, year) - 2_415_021;
  const k = Math.floor(offset / SYNODIC_MONTH);
  let monthStart = newMoonDay(k, timezone);
  if (sunLongitudeSector(monthStart, timezone) >= 9) {
    monthStart = newMoonDay(k - 1, timezone);
  }

  return monthStart;
}

function leapMonthOffset(month11Start: number, timezone: number): number {
  const k = Math.floor((month11Start - JULIAN_DAY_BASE) / SYNODIC_MONTH + 0.5);
  let lastSector = 0;
  let index = 1;
  let sector = sunLongitudeSector(newMoonDay(k + index, timezone), timezone);

  do {
    lastSector = sector;
    index += 1;
    sector = sunLongitudeSector(newMoonDay(k + index, timezone), timezone);
  } while (sector !== lastSector && index < 14);

  return index - 1;
}

function positiveModulo(value: number, modulo: number): number {
  return ((value % modulo) + modulo) % modulo;
}
