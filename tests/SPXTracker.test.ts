import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSPXSignedTrackingParam,
  fetchSPXTracking,
  SPXTrackingError,
  type SPXTrackingErrorCode,
} from "../src/lib/SPXTracker";

const FIXED_NOW = 1_730_000_000;
const TRACKING_NUMBER = "TH260294465354E";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function assertTrackingError(
  promise: Promise<unknown>,
  code: SPXTrackingErrorCode,
) {
  await assert.rejects(
    promise,
    (error) => error instanceof SPXTrackingError && error.code === code,
  );
}

test("buildSPXSignedTrackingParam signs with sha256 over number+seconds+salt", () => {
  const param = buildSPXSignedTrackingParam(TRACKING_NUMBER, FIXED_NOW);
  const [number, rest] = param.split("|");
  assert.equal(number, TRACKING_NUMBER);
  assert.ok(rest.startsWith(String(FIXED_NOW)));
  const digest = rest.slice(String(FIXED_NOW).length);
  assert.match(digest, /^[0-9a-f]{64}$/);
  assert.equal(digest.length, 64);
});

test("fetchSPXTracking parses a real-shaped payload and signs the request", async () => {
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    assert.ok(url.startsWith("https://spx.co.th/api/v2/fleet_order/tracking/search?sls_tracking_number="));
    const signed = decodeURIComponent(url.split("sls_tracking_number=")[1]);
    assert.equal(signed.split("|")[0], TRACKING_NUMBER);
    assert.equal(new Headers(init?.headers).get("x-language"), "th");

    return jsonResponse({
      retcode: 0,
      message: "",
      data: {
        sls_tracking_number: TRACKING_NUMBER,
        current_status: "SOC_LHTransporting",
        tracking_list: [
          {
            timestamp: 1_794_180_841,
            status: "SOC_LHTransporting",
            message: "Parcel transporting to [ACMAI-A]",
          },
          {
            timestamp: 1_794_099_981,
            status: "Created",
            message: "ออเดอร์อยู่ระหว่างการจัดเตรียม",
          },
        ],
        status_list: [],
      },
    });
  }) as typeof fetch;

  const result = await fetchSPXTracking(TRACKING_NUMBER, fetcher);

  assert.equal(result.trackingNo, TRACKING_NUMBER);
  assert.equal(result.statusText, "SOC_LHTransporting");
  // API returns newest-first; the service must normalize to oldest-first.
  assert.equal(result.events.length, 2);
  assert.equal(result.events[0].status, "Created");
  assert.equal(result.events[1].timestamp, "2026-11-08T23:34:01.000Z");
});

test("fetchSPXTracking normalizes the tracking number to uppercase", async () => {
  const fetcher = (async (input: string | URL | Request) => {
    const signed = decodeURIComponent(
      String(input).split("sls_tracking_number=")[1],
    );
    assert.ok(signed.startsWith("TH260294465354E|"));
    return jsonResponse({
      retcode: 0,
      message: "",
      data: {
        sls_tracking_number: TRACKING_NUMBER,
        current_status: "Created",
        tracking_list: [{ timestamp: 1_794_099_981, status: "Created", message: "x" }],
      },
    });
  }) as typeof fetch;

  const result = await fetchSPXTracking("th260294465354e", fetcher);
  assert.equal(result.trackingNo, TRACKING_NUMBER);
});

test("fetchSPXTracking throws NOT_FOUND when the API answers empty data", async () => {
  const fetcher = (async () =>
    jsonResponse({ retcode: 0, message: "", data: {} })) as typeof fetch;

  await assertTrackingError(
    fetchSPXTracking(TRACKING_NUMBER, fetcher),
    "NOT_FOUND",
  );
});

test("fetchSPXTracking rejects an empty tracking number", async () => {
  await assertTrackingError(fetchSPXTracking("   ", fetch), "INVALID_TRACKING_NUMBER");
});

test("fetchSPXTracking maps non-JSON responses to INVALID_RESPONSE", async () => {
  const fetcher = (async () =>
    new Response("<html>maintenance</html>")) as typeof fetch;

  await assertTrackingError(
    fetchSPXTracking(TRACKING_NUMBER, fetcher),
    "INVALID_RESPONSE",
  );
});
