import { NextResponse } from "next/server";

import { processAdminSyncJobs, queueEligibleFinishedBatch } from "@/lib/admin/syncJobs";

export async function POST(request: Request) {
  const configuredSecret = process.env.CRON_SECRET;

  if (!configuredSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured; use the admin queue action instead." },
      { status: 501 },
    );
  }

  const authHeader = request.headers.get("authorization") ?? "";
  if (authHeader !== `Bearer ${configuredSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const queued = await queueEligibleFinishedBatch(null, 3);
  const processed = await processAdminSyncJobs(1);
  return NextResponse.json({ queued, processed });
}
