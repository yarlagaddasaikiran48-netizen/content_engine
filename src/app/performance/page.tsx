import { PerformanceClient, type PerformanceData } from "@/components/PerformanceClient";
import { GET } from "@/app/api/performance/route";

export const dynamic = "force-dynamic";

/**
 * Rendered on the server so the page has numbers on it the moment it opens.
 *
 * The route handler is called directly rather than fetched over HTTP: this
 * runs inside the same serverless function, so an internal fetch would be a
 * round trip to ourselves through Vercel's edge — slower, and one more thing
 * to fail while the operator is standing on a train.
 */
export default async function PerformancePage() {
  let initial: PerformanceData | null = null;
  let loadError: string | null = null;

  try {
    const body = await (await GET()).json();
    if (body.ok) initial = body as PerformanceData;
    else loadError = body.error ?? "Could not load performance.";
  } catch (error) {
    loadError = error instanceof Error ? error.message : String(error);
  }

  return (
    <div className="app-shell">
      <PerformanceClient initial={initial} loadError={loadError} />
    </div>
  );
}
