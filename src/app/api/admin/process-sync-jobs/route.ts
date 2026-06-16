import { NextRequest, NextResponse } from "next/server";

import { requireAdminUser } from "@/lib/admin/permissions";
import { processAdminSyncJobs } from "@/lib/admin/syncJobs";

const isCronAuthorized = (request: NextRequest) => {
  const configuredSecret = process.env.CRON_SECRET;
  if (!configuredSecret) return false;
  return request.headers.get("authorization") === `Bearer ${configuredSecret}`;
};

export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    try {
      await requireAdminUser("/admin/matches");
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const body = await request.json().catch(() => ({}));
  const result = await processAdminSyncJobs(typeof body.limit === "number" ? body.limit : 2);
  return NextResponse.json(result);
}
