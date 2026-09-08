import { PublishQueue } from "@/components/PublishQueue";
import { readQueue, type QueueData } from "@/lib/schedule/queue";

export const dynamic = "force-dynamic";

const EMPTY: QueueData = {
  ready: [],
  waiting: [],
  inFlight: [],
  postingTimes: [],
  timezone: "Asia/Kolkata",
  videosPerDay: 0,
  quota: null,
};

export default async function QueuePage() {
  let data: QueueData = EMPTY;
  let loadError: string | null = null;

  try {
    data = await readQueue();
  } catch (error) {
    loadError = error instanceof Error ? error.message : String(error);
  }

  return (
    <div className="app-shell">
      <PublishQueue initial={data} loadError={loadError} />
    </div>
  );
}
