import { NextResponse } from "next/server";

/** Consistent JSON envelopes so the dashboard can rely on one shape. */
export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, ...data }, { status });
}

export function fail(message: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}

/** Turn any thrown value into a readable message. */
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
