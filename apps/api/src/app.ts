import express from "express";
import cors from "cors";
import { DatabaseSync } from "node:sqlite";
import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  randomUUID,
} from "node:crypto";
import { z } from "zod";

type User = {
  id: string;
  email: string;
  role: string;
  name: string;
  password: string;
};
export function createApp(path = ":memory:", password?: string) {
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE,role TEXT,name TEXT,password TEXT);
    CREATE TABLE IF NOT EXISTS assignments(clinician TEXT,patient TEXT,PRIMARY KEY(clinician,patient));
    CREATE TABLE IF NOT EXISTS tokens(token TEXT PRIMARY KEY,user TEXT,expires INTEGER);
    CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,patient TEXT,device TEXT,mode TEXT,started TEXT,ended TEXT);
    CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,session TEXT REFERENCES sessions(id),state TEXT,source TEXT,reason TEXT,recorded TEXT,received TEXT);`);
  if (!db.prepare("SELECT id FROM users LIMIT 1").get()) {
    if (!password || password.length < 12)
      throw new Error(
        "Set DEMO_PASSWORD to at least 12 characters before first startup.",
      );
    for (const [id, email, role, name] of [
      ["patient-demo", "patient@fleure.local", "patient", "Demo Patient"],
      [
        "clinician-demo",
        "clinician@fleure.local",
        "clinician",
        "Demo Clinician",
      ],
      ["patient-other", "other@fleure.local", "patient", "Unassigned Patient"],
    ]) {
      const salt = randomBytes(16).toString("hex");
      db.prepare("INSERT INTO users VALUES(?,?,?,?,?)").run(
        id,
        email,
        role,
        name,
        `${salt}:${scryptSync(password, salt, 64).toString("hex")}`,
      );
    }
    db.prepare("INSERT INTO assignments VALUES(?,?)").run(
      "clinician-demo",
      "patient-demo",
    );
  }
  const app = express();
  app.use(
    cors({
      origin: (
        process.env.CORS_ORIGINS ||
        "http://localhost:5173,http://localhost:8081"
      ).split(","),
    }),
  );
  app.use(express.json({ limit: "64kb" }));
  const attempts = new Map<string, { count: number; until: number }>();
  app.get("/api/health", (_, res) => res.json({ ok: true }));
  app.post("/api/login", (req, res) => {
    const ip = req.ip || "unknown",
      now = Date.now();
    let limit = attempts.get(ip);
    if (!limit || limit.until < now) {
      limit = { count: 0, until: now + 60000 };
      attempts.set(ip, limit);
    }
    if (++limit.count > 15) {
      res
        .status(429)
        .json({ error: "Too many login attempts. Try again in one minute." });
      return;
    }
    const body = z
      .object({ email: z.string().email(), password: z.string().max(256) })
      .safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Email and password required" });
      return;
    }
    const user = db
      .prepare("SELECT * FROM users WHERE email=?")
      .get(body.data.email) as User | undefined;
    const [salt, hash] = (user?.password || "unused:" + "00".repeat(64)).split(
      ":",
    );
    const valid = timingSafeEqual(
      Buffer.from(hash, "hex"),
      scryptSync(body.data.password, salt, 64),
    );
    if (!user || !valid) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    const token = randomBytes(32).toString("hex");
    db.prepare("DELETE FROM tokens WHERE expires<?").run(now);
    db.prepare("INSERT INTO tokens VALUES(?,?,?)").run(
      token,
      user.id,
      now + 8 * 60 * 60 * 1000,
    );
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
      },
    });
  });
  app.use("/api", (req, res, next) => {
    const token = req.headers.authorization?.replace(/^Bearer /, "") || "";
    const user = db
      .prepare(
        "SELECT users.* FROM users JOIN tokens ON users.id=tokens.user WHERE token=? AND expires>?",
      )
      .get(token, Date.now()) as User | undefined;
    if (!user) {
      res.status(401).json({ error: "Sign in required" });
      return;
    }
    res.locals.user = user;
    next();
  });
  app.post("/api/logout", (req, res) => {
    db.prepare("DELETE FROM tokens WHERE token=?").run(
      req.headers.authorization?.slice(7) || "",
    );
    res.sendStatus(204);
  });
  const canRead = (user: User, patient: string) =>
    user.id === patient ||
    (user.role === "clinician" &&
      !!db
        .prepare("SELECT 1 FROM assignments WHERE clinician=? AND patient=?")
        .get(user.id, patient));
  app.get("/api/patients", (_, res) => {
    const user = res.locals.user as User;
    if (user.role !== "clinician") {
      res.status(403).json({ error: "Clinician access required" });
      return;
    }
    res.json(
      db
        .prepare(
          "SELECT id,name,email FROM users JOIN assignments ON users.id=assignments.patient WHERE clinician=?",
        )
        .all(user.id),
    );
  });
  app.get("/api/sessions", (req, res) => {
    const user = res.locals.user as User,
      patient = String(req.query.patient || user.id);
    if (!canRead(user, patient)) {
      res.status(403).json({ error: "Patient access denied" });
      return;
    }
    res.json(
      db
        .prepare(
          `SELECT sessions.*, (SELECT MAX(received) FROM events WHERE session=sessions.id) AS lastReceived FROM sessions WHERE patient=? ORDER BY started DESC`,
        )
        .all(patient),
    );
  });
  app.post("/api/sessions", (req, res) => {
    const user = res.locals.user as User;
    if (user.role !== "patient") {
      res.status(403).json({ error: "Patient access required" });
      return;
    }
    const body = z
      .object({
        id: z.uuid(),
        device: z.string().min(1).max(128),
        mode: z.enum(["simulator", "hardware"]),
        started: z.iso.datetime(),
      })
      .safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid session" });
      return;
    }
    const b = body.data,
      existing = db.prepare("SELECT * FROM sessions WHERE id=?").get(b.id);
    if (existing) {
      if (
        existing.patient !== user.id ||
        existing.device !== b.device ||
        existing.mode !== b.mode ||
        existing.started !== b.started
      ) {
        res.status(409).json({ error: "Session ID conflict" });
        return;
      }
    } else
      db.prepare("INSERT INTO sessions VALUES(?,?,?,?,?,NULL)").run(
        b.id,
        user.id,
        b.device,
        b.mode,
        b.started,
      );
    res.status(201).json({ id: b.id });
  });
  app.get("/api/sessions/:id/events", (req, res) => {
    const session = db
      .prepare("SELECT * FROM sessions WHERE id=?")
      .get(String(req.params.id));
    if (!session || !canRead(res.locals.user, String(session.patient))) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    res.json(
      db
        .prepare(
          "SELECT * FROM events WHERE session=? ORDER BY recorded,received",
        )
        .all(String(req.params.id)),
    );
  });
  app.post("/api/sessions/:id/events", (req, res) => {
    const session = db
      .prepare("SELECT * FROM sessions WHERE id=?")
      .get(String(req.params.id));
    if (
      !session ||
      session.patient !== res.locals.user.id ||
      res.locals.user.role !== "patient"
    ) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    const body = z
      .array(
        z.object({
          id: z.uuid(),
          state: z.enum(["on", "off", "unknown"]),
          source: z.enum(["device", "simulator", "connection"]),
          reason: z.string().max(100),
          recorded: z.iso.datetime(),
        }),
      )
      .min(1)
      .max(100)
      .safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid events" });
      return;
    }
    if (
      body.data.some((e) =>
        session.mode === "hardware"
          ? e.source === "simulator"
          : e.source === "device",
      )
    ) {
      res
        .status(400)
        .json({ error: "Event source does not match session mode" });
      return;
    }
    db.exec("BEGIN");
    try {
      for (const e of body.data) {
        const old = db.prepare("SELECT * FROM events WHERE id=?").get(e.id);
        if (
          old &&
          (old.session !== req.params.id ||
            old.state !== e.state ||
            old.source !== e.source ||
            old.reason !== e.reason ||
            old.recorded !== e.recorded)
        )
          throw new Error("Event ID conflict");
        db.prepare("INSERT OR IGNORE INTO events VALUES(?,?,?,?,?,?,?)").run(
          e.id,
          String(req.params.id),
          e.state,
          e.source,
          e.reason,
          e.recorded,
          new Date().toISOString(),
        );
      }
      db.exec("COMMIT");
      res.json({ accepted: body.data.length });
    } catch {
      db.exec("ROLLBACK");
      res.status(409).json({ error: "Event ID conflict" });
    }
  });
  app.patch("/api/sessions/:id", (req, res) => {
    const session = db
      .prepare("SELECT * FROM sessions WHERE id=?")
      .get(String(req.params.id));
    if (!session || session.patient !== res.locals.user.id) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    const body = z.object({ ended: z.iso.datetime() }).safeParse(req.body);
    if (!body.success || body.data.ended < String(session.started)) {
      res.status(400).json({ error: "Invalid end time" });
      return;
    }
    db.prepare("UPDATE sessions SET ended=COALESCE(ended,?) WHERE id=?").run(
      body.data.ended,
      String(req.params.id),
    );
    res.sendStatus(204);
  });
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    },
  );
  return { app, db };
}
