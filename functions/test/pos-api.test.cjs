const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { app } = require("../lib/http.js");

// Checkout uses the Firestore client repository, covered by web/tests/operations.test.ts.
test("HTTP API exposes health but does not advertise an unimplemented POS checkout endpoint", async (context) => {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const base = `http://127.0.0.1:${server.address().port}`;
  const health = await fetch(`${base}/api/health`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).ok, true);
  const checkout = await fetch(`${base}/api/pos/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(checkout.status, 404);
});
