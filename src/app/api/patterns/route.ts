import { NextRequest, NextResponse } from "next/server";
import { ensureInitialized } from "@/lib/init";
import { analyzeAll } from "@/lib/analyzer";

export const dynamic = "force-dynamic";

// GET /api/patterns — Pattern analysis results
export async function GET(request: NextRequest) {
  ensureInitialized();

  const { searchParams } = request.nextUrl;
  const rawDays = parseInt(searchParams.get("days") || "30", 10);
  const days = Number.isFinite(rawDays) && rawDays > 0 ? Math.min(rawDays, 365) : 30;
  const projectFilter = searchParams.get("project") || undefined;
  const rawFreq = parseInt(searchParams.get("minFrequency") || "3", 10);
  const minFrequency = Number.isFinite(rawFreq) && rawFreq > 0 ? rawFreq : 3;

  const analysis = analyzeAll({ days, projectFilter, minFrequency });

  return NextResponse.json(analysis);
}
