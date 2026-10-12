import { appConfig } from "@/lib/server/config";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(appConfig(), { headers: { "cache-control": "no-store" } });
}
