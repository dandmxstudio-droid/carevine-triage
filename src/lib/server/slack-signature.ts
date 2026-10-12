import "server-only";

// Verify the exact raw bytes before parsing anything. Web Crypto keeps this
// compatible with the edge runtime and performs the HMAC comparison itself.
export async function verifySlackRequest(
  request: Request,
  secret: string,
  now = Date.now(),
): Promise<boolean> {
  const timestamp = request.headers.get("x-slack-request-timestamp") || "";
  const signature = request.headers.get("x-slack-signature") || "";
  if (
    !secret ||
    !/^\d{1,12}$/.test(timestamp) ||
    !/^v0=[0-9a-f]{64}$/.test(signature) ||
    Math.abs(now / 1000 - Number(timestamp)) > 300
  )
    return false;
  try {
    const body = await request.arrayBuffer();
    const prefix = new TextEncoder().encode(`v0:${timestamp}:`);
    const data = new Uint8Array(prefix.length + body.byteLength);
    data.set(prefix);
    data.set(new Uint8Array(body), prefix.length);
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const digest = Uint8Array.from(signature.slice(3).match(/../g)!, (byte) =>
      parseInt(byte, 16),
    );
    return await crypto.subtle.verify("HMAC", key, digest, data);
  } catch {
    return false;
  }
}
