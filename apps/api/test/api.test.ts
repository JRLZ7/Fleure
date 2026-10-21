import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createApp } from "../src/app.js";
test("roles, assignments, idempotent uploads, source validation and logout", async () => {
  const { app, db } = createApp(":memory:", "test-password-123");
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}/api`;
  async function request(
    path: string,
    token = "",
    method = "GET",
    body?: unknown,
  ) {
    return fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }
  try {
    const login = async (email: string) =>
      (
        await (
          await request("/login", "", "POST", {
            email,
            password: "test-password-123",
          })
        ).json()
      ).token as string;
    assert.equal((await request("/sessions")).status, 401);
    const patient = await login("patient@fleure.local"),
      clinician = await login("clinician@fleure.local"),
      other = await login("other@fleure.local");
    assert.equal((await request("/patients", patient)).status, 403);
    assert.equal(
      (await (await request("/patients", clinician)).json()).length,
      1,
    );
    assert.equal(
      (await request("/sessions?patient=patient-other", clinician)).status,
      403,
    );
    const id = randomUUID(),
      session = {
        id,
        device: "sim",
        mode: "simulator",
        started: new Date().toISOString(),
      };
    assert.equal(
      (await request("/sessions", clinician, "POST", session)).status,
      403,
    );
    assert.equal(
      (await request("/sessions", patient, "POST", session)).status,
      201,
    );
    assert.equal(
      (await request("/sessions", patient, "POST", session)).status,
      201,
    );
    assert.equal(
      (await request("/sessions", other, "POST", session)).status,
      409,
    );
    const event = {
      id: randomUUID(),
      state: "on",
      source: "simulator",
      reason: "test",
      recorded: new Date().toISOString(),
    };
    for (let i = 0; i < 2; i++)
      assert.equal(
        (await request(`/sessions/${id}/events`, patient, "POST", [event]))
          .status,
        200,
      );
    assert.equal(
      (await (await request(`/sessions/${id}/events`, clinician)).json())
        .length,
      1,
    );
    assert.equal((await request(`/sessions/${id}/events`, other)).status, 404);
    assert.equal(
      (
        await request(`/sessions/${id}/events`, patient, "POST", [
          { ...event, state: "off" },
        ])
      ).status,
      409,
    );
    assert.equal(
      (
        await request(`/sessions/${id}/events`, patient, "POST", [
          { ...event, id: randomUUID(), source: "device" },
        ])
      ).status,
      400,
    );
    assert.equal(
      (
        await request(`/sessions/${id}`, patient, "PATCH", {
          ended: new Date().toISOString(),
        })
      ).status,
      204,
    );
    assert.equal((await request("/logout", patient, "POST")).status, 204);
    assert.equal((await request("/sessions", patient)).status, 401);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve())),
    );
    db.close();
  }
});
