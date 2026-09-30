// Thin wrapper around @kingstinct/react-native-healthkit. Every call into
// that library lives in this one file — nothing else in the app imports it
// directly — so if its exact method names have moved on by the time you
// `npm install` (native-module libraries like this one change their API
// across major versions more often than pure-JS packages, and this file was
// written without being able to install or run it in the build sandbox),
// this is the only file that needs fixing up against whatever version lands.
// Check the installed version's README/CHANGELOG against the calls below
// before you rely on this for real data.
import {
  isHealthDataAvailable,
  requestAuthorization,
  queryQuantitySamples,
  queryStatisticsForQuantity,
  HKQuantityTypeIdentifier,
  HKStatisticsOptions,
  HKUnits,
} from "@kingstinct/react-native-healthkit";

// Point-in-time readings — we want the latest value on each day.
const SAMPLE_TYPES = [
  HKQuantityTypeIdentifier.bodyMass,
  HKQuantityTypeIdentifier.bodyFatPercentage,
  HKQuantityTypeIdentifier.leanBodyMass,
] as const;

// Cumulative-over-the-day readings — we want the day's total.
const SUM_TYPES = [
  HKQuantityTypeIdentifier.stepCount,
  HKQuantityTypeIdentifier.activeEnergyBurned,
  HKQuantityTypeIdentifier.basalEnergyBurned, // "resting energy" in daily_metrics
  HKQuantityTypeIdentifier.dietaryEnergyConsumed,
  HKQuantityTypeIdentifier.dietaryProtein,
] as const;

export type DayReading = {
  date: string; // YYYY-MM-DD, local calendar day
  weight?: number; // lb
  body_fat?: number; // %, 0-100
  lean_mass?: number; // lb
  steps?: number;
  active_energy?: number; // kcal
  resting_energy?: number; // kcal
  dietary_energy?: number; // kcal
  protein?: number; // g
};

export async function healthKitAvailable(): Promise<boolean> {
  try {
    return await isHealthDataAvailable();
  } catch {
    return false;
  }
}

export async function requestHealthPermissions(): Promise<boolean> {
  try {
    await requestAuthorization([], [...SAMPLE_TYPES, ...SUM_TYPES]);
    // This library (like HealthKit itself) doesn't tell you whether the
    // person actually granted each item — only that the sheet was shown and
    // dismissed. We find out for real the first time a query comes back
    // empty vs. populated.
    return true;
  } catch (err) {
    console.warn("HealthKit authorization request failed", err);
    return false;
  }
}

function localIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

// Pulls the last `days` days of everything Huddle tracks and returns one
// merged row per calendar day, ready to upsert into daily_metrics. Point-in-
// time metrics (weight, body fat, lean mass) take the most recent sample
// that day; cumulative metrics (steps, energy) are summed for the day.
export async function readRecentHealthData(days = 14): Promise<DayReading[]> {
  const now = new Date();
  const from = startOfDay(now);
  from.setDate(from.getDate() - (days - 1));

  const byDate = new Map<string, DayReading>();
  const ensure = (iso: string) => {
    if (!byDate.has(iso)) byDate.set(iso, { date: iso });
    return byDate.get(iso) as DayReading;
  };

  const SAMPLE_FIELD: Record<string, keyof DayReading> = {
    [HKQuantityTypeIdentifier.bodyMass]: "weight",
    [HKQuantityTypeIdentifier.bodyFatPercentage]: "body_fat",
    [HKQuantityTypeIdentifier.leanBodyMass]: "lean_mass",
  };
  const SAMPLE_UNIT: Record<string, string> = {
    [HKQuantityTypeIdentifier.bodyMass]: HKUnits.Pound,
    [HKQuantityTypeIdentifier.bodyFatPercentage]: HKUnits.Percent,
    [HKQuantityTypeIdentifier.leanBodyMass]: HKUnits.Pound,
  };

  for (const type of SAMPLE_TYPES) {
    const samples = await queryQuantitySamples(type, {
      from,
      to: now,
      unit: SAMPLE_UNIT[type],
    }).catch(() => []);
    // Newest last isn't guaranteed, so sort and keep the latest sample per day.
    const sorted = [...samples].sort(
      (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
    );
    for (const s of sorted) {
      const iso = localIso(new Date(s.startDate));
      const row = ensure(iso);
      const field = SAMPLE_FIELD[type];
      const pct = type === HKQuantityTypeIdentifier.bodyFatPercentage;
      // HealthKit reports body-fat percentage as a 0-1 fraction; the app
      // stores it as 0-100, matching what the old Shortcut/Zapier pipeline
      // already wrote into daily_metrics.
      (row as any)[field] = pct ? s.quantity * 100 : s.quantity;
    }
  }

  const SUM_FIELD: Record<string, keyof DayReading> = {
    [HKQuantityTypeIdentifier.stepCount]: "steps",
    [HKQuantityTypeIdentifier.activeEnergyBurned]: "active_energy",
    [HKQuantityTypeIdentifier.basalEnergyBurned]: "resting_energy",
    [HKQuantityTypeIdentifier.dietaryEnergyConsumed]: "dietary_energy",
    [HKQuantityTypeIdentifier.dietaryProtein]: "protein",
  };
  const SUM_UNIT: Record<string, string> = {
    [HKQuantityTypeIdentifier.stepCount]: HKUnits.Count,
    [HKQuantityTypeIdentifier.activeEnergyBurned]: HKUnits.Kilocalorie,
    [HKQuantityTypeIdentifier.basalEnergyBurned]: HKUnits.Kilocalorie,
    [HKQuantityTypeIdentifier.dietaryEnergyConsumed]: HKUnits.Kilocalorie,
    [HKQuantityTypeIdentifier.dietaryProtein]: HKUnits.Gram,
  };

  for (let i = 0; i < days; i++) {
    const dayStart = new Date(from);
    dayStart.setDate(from.getDate() + i);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayStart.getDate() + 1);
    const iso = localIso(dayStart);

    for (const type of SUM_TYPES) {
      const stats = await queryStatisticsForQuantity(
        type,
        [HKStatisticsOptions.cumulativeSum],
        dayStart,
        dayEnd,
        SUM_UNIT[type]
      ).catch(() => null);
      const total = stats?.sumQuantity?.quantity;
      if (total != null && total > 0) {
        const row = ensure(iso);
        (row as any)[SUM_FIELD[type]] = Math.round(total);
      }
    }
  }

  return Array.from(byDate.values()).sort((a, b) => (a.date < b.date ? -1 : 1));
}
