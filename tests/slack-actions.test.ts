import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { POST } from "../src/app/api/slack/actions/route";
import { verifySlackRequest } from "../src/lib/server/slack-signature";

const secret = "synthetic-slack-signing-secret-for-tests";
const body = new URLSearchParams({
  payload: JSON.stringify({
    type: "block_actions",
    response_url: "https://untrusted.example/never-call",
    actions: [{ type: "button", action_id: "open_nurse_queue" }],
  }),
}).toString();
function signed(
  text = body,
  timestamp = String(Math.floor(Date.now() / 1000)),
  signingSecret = secret,
) {
  const signature = `v0=${createHmac("sha256", signingSecret)
    .update(`v0:${timestamp}:${text}`)
    .digest("hex")}`;
  return new Request("https://carevine.example/api/slack/actions", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-slack-request-timestamp": timestamp,
      "x-slack-signature": signature,
    },
    body: text,
  });
}

test("signed Slack callbacks get an empty 200 without following response_url or calling providers", async () => {
  const oldSecret = process.env.SLACK_SIGNING_SECRET;
  const oldFetch = globalThis.fetch;
  process.env.SLACK_SIGNING_SECRET = secret;
  globalThis.fetch = async () => {
    assert.fail("Slack acknowledgement must not make an outbound call.");
  };
  try {
    const response = await POST(signed());
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "");
  } finally {
    globalThis.fetch = oldFetch;
    if (oldSecret === undefined) delete process.env.SLACK_SIGNING_SECRET;
    else process.env.SLACK_SIGNING_SECRET = oldSecret;
  }
});

test("missing, malformed and incorrect Slack signatures return 401 on every callback", async () => {
  const oldSecret = process.env.SLACK_SIGNING_SECRET;
  process.env.SLACK_SIGNING_SECRET = secret;
  try {
    for (const signature of [
      undefined,
      "",
      "v1=" + "0".repeat(64),
      "v0=bad",
      "v0=" + "0".repeat(64),
    ]) {
      const request = signed();
      if (signature === undefined) request.headers.delete("x-slack-signature");
      else request.headers.set("x-slack-signature", signature);
      assert.equal((await POST(request)).status, 401);
    }
    assert.equal(
      (await POST(signed(body, undefined, "wrong-secret"))).status,
      401,
    );
    assert.equal(
      (
        await POST(
          new Request("https://carevine.example/api/slack/actions", {
            method: "POST",
          }),
        )
      ).status,
      401,
    );
  } finally {
    if (oldSecret === undefined) delete process.env.SLACK_SIGNING_SECRET;
    else process.env.SLACK_SIGNING_SECRET = oldSecret;
  }
});

test("Slack timestamps reject stale, future, missing and malformed values with a five-minute boundary", async () => {
  const seconds = 1700000000;
  const now = seconds * 1000;
  for (const offset of [-301, 301])
    assert.equal(
      await verifySlackRequest(
        signed(body, String(seconds + offset)),
        secret,
        now,
      ),
      false,
    );
  for (const offset of [-300, 0, 300])
    assert.equal(
      await verifySlackRequest(
        signed(body, String(seconds + offset)),
        secret,
        now,
      ),
      true,
    );
  for (const timestamp of [
    "",
    "not-a-time",
    "1700000000.0",
    "1700000000000000",
    "-1",
  ])
    assert.equal(
      await verifySlackRequest(signed(body, timestamp), secret, now),
      false,
    );
  const missing = signed(body, String(seconds));
  missing.headers.delete("x-slack-request-timestamp");
  assert.equal(await verifySlackRequest(missing, secret, now), false);
});

test("verification binds the exact raw bytes, including form encoding, Unicode and newlines", async () => {
  for (const text of [
    body,
    "payload=%7B%22text%22%3A%22hello%20world%22%7D",
    "payload=Olá+👋\n",
  ]) {
    assert.equal(await verifySlackRequest(signed(text), secret), true);
    const original = signed(text);
    const changed = new Request(original.url, {
      method: "POST",
      headers: original.headers,
      body: text + " ",
    });
    assert.equal(await verifySlackRequest(changed, secret), false);
  }
  const original = signed("payload=hello%20world");
  assert.equal(
    await verifySlackRequest(
      new Request(original.url, {
        method: "POST",
        headers: original.headers,
        body: "payload=hello+world",
      }),
      secret,
    ),
    false,
  );
});

test("missing signing configuration fails closed with 503", async () => {
  const oldSecret = process.env.SLACK_SIGNING_SECRET;
  try {
    for (const value of [undefined, "", "   "]) {
      if (value === undefined) delete process.env.SLACK_SIGNING_SECRET;
      else process.env.SLACK_SIGNING_SECRET = value;
      assert.equal((await POST(signed())).status, 503);
    }
  } finally {
    if (oldSecret === undefined) delete process.env.SLACK_SIGNING_SECRET;
    else process.env.SLACK_SIGNING_SECRET = oldSecret;
  }
});

test("unreadable Slack request bodies are rejected", async () => {
  const consumed = signed();
  await consumed.text();
  assert.equal(await verifySlackRequest(consumed, secret), false);
});
