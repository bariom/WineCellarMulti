import type { RestaurantSalesSummary } from "../types";

export type RestaurantPerformancePeriod = "week" | "month" | "semester" | "year" | "custom";
export type RestaurantChartGranularity = "day" | "week" | "month";

export type RestaurantChartConfig = {
  granularity: RestaurantChartGranularity;
  movingAverageWindow: number;
  movingAverageLabel: { it: string; en: string };
};

export type RestaurantRevenueBucket = {
  date: string;
  periodEnd: string;
  revenue: number;
  cost: number;
  grossMargin: number;
  bottles: number;
  glasses: number;
  movingAverage: number;
};

const DAY_MS = 86_400_000;

function isoTimestamp(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function timestampIso(value: number) {
  return new Date(value).toISOString().slice(0, 10);
}

export function inclusiveDayCount(fromDate: string, toDate: string) {
  return Math.max(Math.floor((isoTimestamp(toDate) - isoTimestamp(fromDate)) / DAY_MS) + 1, 0);
}

export function previousEquivalentRange(fromDate: string, toDate: string) {
  const days = inclusiveDayCount(fromDate, toDate);
  const previousTo = isoTimestamp(fromDate) - DAY_MS;
  return {
    fromDate: timestampIso(previousTo - Math.max(days - 1, 0) * DAY_MS),
    toDate: timestampIso(previousTo),
  };
}

export function restaurantChartConfig(
  period: RestaurantPerformancePeriod,
  fromDate: string,
  toDate: string,
): RestaurantChartConfig {
  const days = inclusiveDayCount(fromDate, toDate);
  if (period === "week") {
    return { granularity: "day", movingAverageWindow: 3, movingAverageLabel: { it: "Media mobile 3 gg", en: "3-day moving average" } };
  }
  if (period === "month") {
    return { granularity: "day", movingAverageWindow: 7, movingAverageLabel: { it: "Media mobile 7 gg", en: "7-day moving average" } };
  }
  if (period === "semester" || period === "year") {
    return { granularity: "week", movingAverageWindow: 4, movingAverageLabel: { it: "Media mobile 4 sett.", en: "4-week moving average" } };
  }
  if (days <= 14) {
    return { granularity: "day", movingAverageWindow: 3, movingAverageLabel: { it: "Media mobile 3 gg", en: "3-day moving average" } };
  }
  if (days <= 45) {
    return { granularity: "day", movingAverageWindow: 7, movingAverageLabel: { it: "Media mobile 7 gg", en: "7-day moving average" } };
  }
  if (days <= 180) {
    return { granularity: "week", movingAverageWindow: 4, movingAverageLabel: { it: "Media mobile 4 sett.", en: "4-week moving average" } };
  }
  return { granularity: "month", movingAverageWindow: 3, movingAverageLabel: { it: "Media mobile 3 mesi", en: "3-month moving average" } };
}

export function buildRestaurantRevenueSeries(
  rawSeries: RestaurantSalesSummary["series"],
  currency: string,
  fromDate: string,
  toDate: string,
  config: RestaurantChartConfig,
) {
  const start = isoTimestamp(fromDate);
  const days = inclusiveDayCount(fromDate, toDate);
  const rawByDate = new Map<string, Omit<RestaurantRevenueBucket, "date" | "periodEnd" | "movingAverage">>();
  rawSeries
    .filter((point) => point.currency === currency)
    .forEach((point) => {
      const current = rawByDate.get(point.date) || { revenue: 0, cost: 0, grossMargin: 0, bottles: 0, glasses: 0 };
      current.revenue += Number(point.revenue) || 0;
      current.cost += Number(point.cost) || 0;
      current.grossMargin += Number(point.gross_margin) || 0;
      current.bottles += Number(point.bottles) || 0;
      current.glasses += Number(point.glasses) || 0;
      rawByDate.set(point.date, current);
    });

  const completeDays = Array.from({ length: days }, (_, index) => {
    const date = timestampIso(start + index * DAY_MS);
    return { date, ...(rawByDate.get(date) || { revenue: 0, cost: 0, grossMargin: 0, bottles: 0, glasses: 0 }) };
  });
  const salesDays = completeDays.filter((point) => point.revenue > 0).length;
  const buckets: Array<Omit<RestaurantRevenueBucket, "movingAverage">> = [];
  const bucketIndexes = new Map<string, number>();

  completeDays.forEach((point, dayIndex) => {
    const bucketKey = config.granularity === "day"
      ? point.date
      : config.granularity === "week"
        ? `week-${Math.floor(dayIndex / 7)}`
        : point.date.slice(0, 7);
    const existingIndex = bucketIndexes.get(bucketKey);
    if (existingIndex === undefined) {
      bucketIndexes.set(bucketKey, buckets.length);
      buckets.push({
        date: point.date,
        periodEnd: point.date,
        revenue: point.revenue,
        cost: point.cost,
        grossMargin: point.grossMargin,
        bottles: point.bottles,
        glasses: point.glasses,
      });
      return;
    }
    const bucket = buckets[existingIndex];
    bucket.periodEnd = point.date;
    bucket.revenue += point.revenue;
    bucket.cost += point.cost;
    bucket.grossMargin += point.grossMargin;
    bucket.bottles += point.bottles;
    bucket.glasses += point.glasses;
  });

  const points = buckets.map((bucket, index) => {
    const windowStart = Math.max(index - config.movingAverageWindow + 1, 0);
    const window = buckets.slice(windowStart, index + 1);
    return {
      ...bucket,
      movingAverage: window.reduce((total, point) => total + point.revenue, 0) / window.length,
    };
  });

  return { points, salesDays };
}
