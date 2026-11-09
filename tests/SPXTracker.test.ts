import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchSPXTracking,
  SPXTrackingError,
  type SPXTrackingErrorCode,
} from "../src/lib/SPXTracker";

const TRACK_URL =
  "https://spx.co.th/api/v2/fleet_order/tracking/search?sls_tracking_number=TH253387116642V";

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

test("fetchSPXTracking with a valid number returns normalized events", async () => {
  const fetcher = (async (input: string | URL | Request) => {
    assert.equal(String(input), TRACK_URL);
    return jsonResponse({
      retcode: 0,
      message: "Success",
      data: {
        sls_tracking_number: "TH253387116642V",
        tracking_list: [
          { status: "Order Created", message: "ผู้ส่งกำลังเตรียมพัสดุ", timestamp: 1750000000 },
          { status: "Delivered", message: "พัสดุถูกจัดส่งสำเร็จแล้ว", timestamp: 1750086400 },
        ],
      },
    });
  }) as typeof fetch;

  const result = await fetchSPXTracking("TH253387116642V", fetcher);

  assert.equal(result.trackingNo, "TH253387116642V");
  assert.equal(result.statusText, "Delivered");
  assert.equal(result.events.length, 2);
  assert.equal(result.events[0].timestamp, "2025-06-15T15:06:40.000Z");
  assert.equal(result.events[1].message, "พัสดุถูกจัดส่งสำเร็จแล้ว");
});

test("fetchSPXTracking throws NOT_FOUND when data is empty", async () => {
  const fetcher = (async () =>
    jsonResponse({ retcode: 0, message: "", data: {} })) as typeof fetch;

  await assertTrackingError(fetchSPXTracking("TH253387116642V", fetcher), "NOT_FOUND");
});

test("fetchSPXTracking rejects an empty tracking number", async () => {
  await assertTrackingError(fetchSPXTracking("   ", fetch), "INVALID_TRACKING_NUMBER");
});

test("fetchSPXTracking maps non-JSON responses to INVALID_RESPONSE", async () => {
  const fetcher = (async () =>
    new Response("<html>maintenance</html>")) as typeof fetch;

  await assertTrackingError(fetchSPXTracking("TH253387116642V", fetcher), "INVALID_RESPONSE");
});
