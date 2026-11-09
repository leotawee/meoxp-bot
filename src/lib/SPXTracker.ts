// Reverse-engineered from the SPX Express (Thailand) tracking page —
// GET https://spx.co.th/api/v2/fleet_order/tracking/search?sls_tracking_number=...
// No auth token needed. Unofficial: may change without notice.
const TRACK_API_URL = "https://spx.co.th/api/v2/fleet_order/tracking/search";
const REQUEST_TIMEOUT_MS = 10_000;

export type SPXTrackingErrorCode =
  | "INVALID_TRACKING_NUMBER"
  | "RATE_LIMITED"
  | "NOT_FOUND"
  | "TIMEOUT"
  | "UPSTREAM_FAILURE"
  | "INVALID_RESPONSE";

export class SPXTrackingError extends Error {
  constructor(public readonly code: SPXTrackingErrorCode) {
    super(code);
    this.name = "SPXTrackingError";
  }
}

export interface SPXTrackingEvent {
  status: string | null;
  message: string | null;
  timestamp: string | null;
}

export interface SPXTrackingResult {
  trackingNo: string;
  statusText: string | null;
  events: SPXTrackingEvent[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asIsoTimestamp(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return new Date(value * 1_000).toISOString();
  }
  const text = asText(value);
  if (!text) return null;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function parseTrackingResponse(payload: unknown): SPXTrackingResult {
  if (!isRecord(payload) || payload.retcode !== 0 || !isRecord(payload.data)) {
    throw new SPXTrackingError("INVALID_RESPONSE");
  }

  const list = payload.data.tracking_list;
  if (!Array.isArray(list) || list.length === 0) {
    throw new SPXTrackingError("NOT_FOUND");
  }

  const events = list.filter(isRecord).map((item) => ({
    status: asText(item.status),
    message: asText(item.message),
    timestamp: asIsoTimestamp(item.timestamp),
  }));

  if (events.length === 0) {
    throw new SPXTrackingError("INVALID_RESPONSE");
  }

  const latest = events.at(-1)!;
  return {
    trackingNo: asText(payload.data.sls_tracking_number) ?? "",
    statusText: latest.status,
    events,
  };
}

export async function fetchSPXTracking(
  trackingNo: string,
  fetcher: typeof fetch = fetch,
): Promise<SPXTrackingResult> {
  const trimmed = trackingNo.trim();
  if (!trimmed) {
    throw new SPXTrackingError("INVALID_TRACKING_NUMBER");
  }

  let response: Response;
  try {
    response = await fetcher(
      `${TRACK_API_URL}?sls_tracking_number=${encodeURIComponent(trimmed)}`,
      {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );
  } catch (error) {
    const name = isRecord(error) ? asText(error.name) : null;
    throw new SPXTrackingError(
      name === "AbortError" || name === "TimeoutError"
        ? "TIMEOUT"
        : "UPSTREAM_FAILURE",
    );
  }

  if (response.status === 429) {
    throw new SPXTrackingError("RATE_LIMITED");
  }
  if (!response.ok) {
    throw new SPXTrackingError("UPSTREAM_FAILURE");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new SPXTrackingError("INVALID_RESPONSE");
  }

  return parseTrackingResponse(payload);
}
