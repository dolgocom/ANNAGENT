import axios from "axios";
import { logger } from "./logger";

const OURA_BASE = "https://api.ouraring.com/v2";

function getHeaders() {
  const token = process.env.OURA_API_TOKEN;
  if (!token) throw new Error("OURA_API_TOKEN is required");
  return { Authorization: `Bearer ${token}` };
}

export interface OuraDailyReadiness {
  day: string;
  score: number;
  temperature_deviation?: number;
}

export interface OuraSleepData {
  day: string;
  score?: number;
  total_sleep_duration?: number;
  average_hrv?: number;
  lowest_heart_rate?: number;
}

export async function getOuraReadiness(startDate: string, endDate: string): Promise<OuraDailyReadiness[]> {
  try {
    const resp = await axios.get(`${OURA_BASE}/usercollection/daily_readiness`, {
      headers: getHeaders(),
      params: { start_date: startDate, end_date: endDate },
    });
    return resp.data.data ?? [];
  } catch (err) {
    logger.error({ err }, "Failed to fetch Oura readiness");
    return [];
  }
}

export async function getOuraSleep(startDate: string, endDate: string): Promise<OuraSleepData[]> {
  try {
    const resp = await axios.get(`${OURA_BASE}/usercollection/daily_sleep`, {
      headers: getHeaders(),
      params: { start_date: startDate, end_date: endDate },
    });
    return resp.data.data ?? [];
  } catch (err) {
    logger.error({ err }, "Failed to fetch Oura sleep");
    return [];
  }
}

export async function getOuraTodayData(): Promise<{ readiness: OuraDailyReadiness | null; sleep: OuraSleepData | null }> {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0]!;
  const yesterdayStr = new Date(today.getTime() - 86400000).toISOString().split("T")[0]!;

  const [readinessArr, sleepArr] = await Promise.all([
    getOuraReadiness(yesterdayStr, todayStr),
    getOuraSleep(yesterdayStr, todayStr),
  ]);

  const readiness = readinessArr.find(r => r.day === todayStr) ?? readinessArr[readinessArr.length - 1] ?? null;
  const sleep = sleepArr.find(s => s.day === todayStr) ?? sleepArr[sleepArr.length - 1] ?? null;

  return { readiness, sleep };
}
