import type { Mission } from "./v14-types";

export type HomeClassLike = {
  id: number;
  status: string;
  scheduled_start_at: string;
  pedagogy_closed_at?: string | null;
};

export type HomeFocus =
  | { kind: "class"; item: HomeClassLike; reason: "active" | "within_30" }
  | { kind: "mission"; item: Mission; reason: "urgent" | "overdue" | "today" | "next" }
  | null;

function partsFor(timestamp: number, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(timestamp));
  const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: read("year"), month: read("month"), day: read("day"), hour: read("hour"), minute: read("minute"), second: read("second") };
}

export function dateKeyFor(timestamp: number, timezone: string) {
  const value = partsFor(timestamp, timezone);
  return `${String(value.year).padStart(4,"0")}-${String(value.month).padStart(2,"0")}-${String(value.day).padStart(2,"0")}`;
}

export function greetingForTimestamp(timestamp: number, timezone: string, boundaries: { morning_start?: string; afternoon_start?: string; night_start?: string }) {
  const value = partsFor(timestamp, timezone);
  const current = value.hour * 60 + value.minute;
  const parse = (raw: string | undefined, fallback: number) => {
    if (!raw || !/^\d{2}:\d{2}$/.test(raw)) return fallback;
    const [hour, minute] = raw.split(":").map(Number);
    return hour * 60 + minute;
  };
  const morning = parse(boundaries.morning_start, 5 * 60);
  const afternoon = parse(boundaries.afternoon_start, 12 * 60);
  const night = parse(boundaries.night_start, 20 * 60);
  if (current >= morning && current < afternoon) return "Buenos días";
  if (current >= afternoon && current < night) return "Buenas tardes";
  return "Buenas noches";
}

export function minutesUntilClass(item: HomeClassLike, now: number) {
  return Math.ceil((new Date(item.scheduled_start_at).getTime() - now) / 60_000);
}

function missionReason(mission: Mission, now: number, timezone: string): "urgent" | "overdue" | "today" | "next" {
  if (mission.priority === "urgent") return "urgent";
  if (mission.state === "not_done" || (mission.due_at && new Date(mission.due_at).getTime() < now)) return "overdue";
  if (mission.due_at && dateKeyFor(new Date(mission.due_at).getTime(), timezone) === dateKeyFor(now, timezone)) return "today";
  return "next";
}

function missionRank(mission: Mission, now: number, timezone: string) {
  const reason = missionReason(mission, now, timezone);
  const group = reason === "urgent" ? 0 : reason === "overdue" ? 1 : reason === "today" ? 2 : 3;
  const due = mission.due_at ? new Date(mission.due_at).getTime() : Number.MAX_SAFE_INTEGER;
  return [group, due, -mission.priority_score] as const;
}

export function selectHomeFocus(classes: HomeClassLike[], missions: Mission[], now: number, timezone: string): HomeFocus {
  const active = classes
    .filter((item) => item.status === "active")
    .sort((a, b) => new Date(a.scheduled_start_at).getTime() - new Date(b.scheduled_start_at).getTime())[0];
  if (active) return { kind: "class", item: active, reason: "active" };

  const within30 = classes
    .filter((item) => item.status === "scheduled")
    .map((item) => ({ item, distance: new Date(item.scheduled_start_at).getTime() - now }))
    .filter(({ distance }) => distance >= -30 * 60_000 && distance <= 30 * 60_000)
    .sort((a, b) => Math.abs(a.distance) - Math.abs(b.distance) || a.distance - b.distance)[0]?.item;
  if (within30) return { kind: "class", item: within30, reason: "within_30" };

  const mission = [...missions].sort((a, b) => {
    const ar = missionRank(a, now, timezone), br = missionRank(b, now, timezone);
    return ar[0]-br[0] || ar[1]-br[1] || ar[2]-br[2];
  })[0];
  return mission ? { kind: "mission", item: mission, reason: missionReason(mission, now, timezone) } : null;
}

function timezoneOffsetMs(timestamp: number, timezone: string) {
  const value = partsFor(timestamp, timezone);
  const representedUtc = Date.UTC(value.year, value.month-1, value.day, value.hour, value.minute, value.second);
  return representedUtc - timestamp;
}

function zonedMidnightUtc(dateKey: string, timezone: string) {
  const [year,month,day] = dateKey.split("-").map(Number);
  const guess = Date.UTC(year,month-1,day,0,0,0);
  const offset = timezoneOffsetMs(guess, timezone);
  return guess - offset;
}

export function dayWindow(timestamp: number, timezone: string) {
  const key = dateKeyFor(timestamp, timezone);
  const [year,month,day] = key.split("-").map(Number);
  const nextGuess = new Date(Date.UTC(year,month-1,day+1)).toISOString().slice(0,10);
  return {
    key,
    from: new Date(zonedMidnightUtc(key, timezone)).toISOString(),
    to: new Date(zonedMidnightUtc(nextGuess, timezone)).toISOString(),
  };
}
