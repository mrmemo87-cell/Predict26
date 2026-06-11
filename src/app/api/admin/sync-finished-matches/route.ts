import { NextResponse } from "next/server";

import { syncFinishedMatches } from "@/lib/football-data/postMatchSync";

export async function POST(request: Request) {
  const configuredSecret = process.env.CRON_SECRET;

  if (!configuredSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured; use the admin Sync finished matches action instead." },
      { status: 501 },
    );
  }

  const authHeader = request.headers.get("authorization") ?? "";
  if (authHeader !== `Bearer ${configuredSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await syncFinishedMatches();
  return NextResponse.json(result);
}
