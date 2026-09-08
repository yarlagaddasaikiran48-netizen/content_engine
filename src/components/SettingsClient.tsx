"use client";

import { useEffect, useMemo, useState } from "react";
import type { MaskedSetting } from "@/lib/settings/store";
import { readJson } from "@/lib/http";

const GROUPS = [
  { id: "connections", title: "Connections", blurb: "Keys, and the YouTube account." },
  { id: "publishing", title: "Publishing", blurb: "When videos go out, and how many." },
  { id: "writing", title: "Writing", blurb: "Length, voice, and how many scripts a day." },
  { id: "advanced", title: "Advanced", blurb: "Rarely needs changing." },
] as const;

type ProbeTarget = "gemini" | "youtube" | "github";
type Probe = { healthy: boolean; detail: string } | "running";

/** "set 3 days ago" — enough to recognise a stale credential, never the value. */
function setAgo(updatedAt: string | null): string {
  if (!updatedAt) return "set";
  const days = Math.floor((Date.now() - new Date(updatedAt).getTime()) / 86_400_000);
  if (days <= 0) return "set today";
  if (days === 1) return "set yesterday";
  return `set ${days} days ago`;
}

export function SettingsClient({
  initialSettings,
  loadError,
}: {
  initialSettings: MaskedSetting[];
  loadError: string | null;
}) {
  const [settings, setSettings] = useState(initialSettings);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [probes, setProbes] = useState<Partial<Record<ProbeTarget, Probe>>>({});
  const [callbackUrl, setCallbackUrl] = useState("");

  // window is unavailable during SSR, so the redirect URI is filled in after mount.
  useEffect(() => {
    setCallbackUrl(`${window.location.origin}/api/youtube/callback`);

    // The OAuth callback redirects back here with its outcome in the query.
    const params = new URLSearchParams(window.location.search);
    const result = params.get("youtube");
    if (result === "connected") {
      setStatus({ tone: "ok", text: "YouTube connected." });
    } else if (result === "error") {
      setStatus({ tone: "bad", text: params.get("detail") ?? "YouTube connection failed." });
    }
    if (result) window.history.replaceState({}, "", window.location.pathname);
  }, []);

  const dirtyCount = Object.keys(edits).length;
  const byGroup = useMemo(
    () => GROUPS.map((g) => ({ ...g, items: settings.filter((s) => s.group === g.id) })),
    [settings],
  );

  function edit(key: string, value: string) {
    setEdits((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ updates: edits }),
      });
      const body = await readJson(response);
      if (!response.ok || !body.ok) throw new Error(body.error ?? "Save failed.");

      // Re-read rather than patching local state: the server is the authority
      // on what is actually stored, including which secrets are now set.
      const refreshed = await fetch("/api/settings", { cache: "no-store" });
      const next = await refreshed.json();
      if (next.ok) setSettings(next.settings);

      setEdits({});
      setStatus({ tone: "ok", text: `Saved ${body.saved} setting${body.saved === 1 ? "" : "s"}.` });
    } catch (error) {
      setStatus({ tone: "bad", text: error instanceof Error ? error.message : String(error) });
    } finally {
      setSaving(false);
    }
  }

  async function test(target: ProbeTarget) {
    setProbes((p) => ({ ...p, [target]: "running" }));
    try {
      const response = await fetch("/api/settings/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ target }),
      });
      const body = await readJson(response);
      setProbes((p) => ({
        ...p,
        [target]: {
          healthy: Boolean(body.healthy),
          detail: body.detail ?? body.error ?? "No detail returned.",
        },
      }));
    } catch (error) {
      setProbes((p) => ({
        ...p,
        [target]: { healthy: false, detail: error instanceof Error ? error.message : String(error) },
      }));
    }
  }

  if (loadError) {
    return (
      <div className="card mt-6 p-5">
        <h1 className="text-lg font-extrabold">Settings unavailable</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
          The settings table could not be read:
        </p>
        <pre
          className="wrap-anywhere mt-3 rounded-lg p-3 text-xs whitespace-pre-wrap"
          style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
        >
          {loadError}
        </pre>
        <p className="mt-3 text-sm" style={{ color: "var(--text-muted)" }}>
          Fill in the two Supabase values in <code>.env.local</code>, then run{" "}
          <code>supabase/migrations/001_settings_and_scheduling.sql</code> in the Supabase SQL
          editor.
        </p>
      </div>
    );
  }

  return (
    <div className="pt-6">
      <h1 className="text-xl font-extrabold">Settings</h1>
      <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
        Saved here, encrypted, and used everywhere. Nothing needs a redeploy.
      </p>

      {byGroup.map((group) => (
        <section key={group.id} className="card mt-4 p-4">
          <h2 className="text-base font-bold">{group.title}</h2>
          <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
            {group.blurb}
          </p>

          {group.id === "connections" && (
            <div className="mt-3 flex flex-col gap-2">
              <a className="btn btn-primary px-4 py-2" href="/api/youtube/connect">
                Connect YouTube
              </a>
              <p className="wrap-anywhere text-xs" style={{ color: "var(--text-muted)" }}>
                First add <code>{callbackUrl || "…/api/youtube/callback"}</code> as an authorised
                redirect URI in Google Cloud Console. It is the one step that cannot be done here.
              </p>

              <div className="mt-1 flex flex-wrap gap-2">
                {(["gemini", "youtube", "github"] as const).map((target) => (
                  <button
                    key={target}
                    type="button"
                    className="btn btn-ghost px-3 py-2"
                    onClick={() => test(target)}
                    disabled={probes[target] === "running"}
                  >
                    {probes[target] === "running" ? `Testing ${target}…` : `Test ${target}`}
                  </button>
                ))}
              </div>

              {(Object.entries(probes) as Array<[ProbeTarget, Probe]>).map(([target, probe]) =>
                probe === "running" ? null : (
                  <p
                    key={target}
                    className="wrap-anywhere text-xs"
                    style={{ color: probe.healthy ? "var(--success)" : "var(--danger)" }}
                  >
                    <strong>{target}:</strong> {probe.detail}
                  </p>
                ),
              )}
            </div>
          )}

          <div className="mt-4 flex flex-col gap-3">
            {group.items.map((item) => {
              // A secret's field starts blank: blank means "leave it alone",
              // so opening Settings and saving cannot wipe stored credentials.
              const value = edits[item.key] ?? (item.secret ? "" : (item.value ?? ""));

              return (
                <label key={item.key} className="flex flex-col gap-1">
                  <span className="text-sm font-semibold">
                    {item.label}
                    {item.secret && item.isSet && (
                      <span
                        className="ml-2 text-xs font-normal"
                        style={{ color: "var(--success)" }}
                      >
                        •••• {setAgo(item.updatedAt)}
                      </span>
                    )}
                  </span>

                  {item.kind === "boolean" ? (
                    <select
                      className="input"
                      value={value === "" ? "true" : value}
                      onChange={(e) => edit(item.key, e.target.value)}
                    >
                      <option value="true">On</option>
                      <option value="false">Off</option>
                    </select>
                  ) : item.kind === "select" ? (
                    <select
                      className="input"
                      value={value}
                      onChange={(e) => edit(item.key, e.target.value)}
                    >
                      {(item.options ?? []).map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className="input"
                      type={item.secret ? "password" : item.kind === "number" ? "number" : "text"}
                      inputMode={item.kind === "number" ? "decimal" : undefined}
                      min={item.min}
                      max={item.max}
                      step="any"
                      value={value}
                      placeholder={
                        item.secret && item.isSet
                          ? "•••••••• — leave blank to keep"
                          : item.kind === "times"
                            ? '["00:00","04:00"]'
                            : ""
                      }
                      autoComplete="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      onChange={(e) => edit(item.key, e.target.value)}
                    />
                  )}

                  {item.help && (
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {item.help}
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </section>
      ))}

      <div className="sticky-bar flex items-center gap-3">
        <button
          type="button"
          className="btn btn-primary flex-1 py-2.5"
          disabled={dirtyCount === 0 || saving}
          onClick={save}
        >
          {saving
            ? "Saving…"
            : dirtyCount === 0
              ? "No changes"
              : `Save ${dirtyCount} change${dirtyCount === 1 ? "" : "s"}`}
        </button>
        {status && (
          <span
            className="text-xs"
            style={{ color: status.tone === "ok" ? "var(--success)" : "var(--danger)" }}
          >
            {status.text}
          </span>
        )}
      </div>
    </div>
  );
}
