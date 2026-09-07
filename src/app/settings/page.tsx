import { SettingsClient } from "@/components/SettingsClient";
import { maskedSettings, type MaskedSetting } from "@/lib/settings/store";

export const dynamic = "force-dynamic";

/**
 * Server-rendered so the form arrives already filled in. On a phone connection
 * a spinner on the settings screen is the difference between "saved" and
 * "gave up".
 */
export default async function SettingsPage() {
  let settings: MaskedSetting[] = [];
  let loadError: string | null = null;

  try {
    settings = await maskedSettings();
  } catch (caught) {
    loadError = caught instanceof Error ? caught.message : String(caught);
  }

  return (
    <div className="app-shell">
      <SettingsClient initialSettings={settings} loadError={loadError} />
    </div>
  );
}
