import React, { useEffect, useRef, useState } from "react";
import {
  AppState,
  Button,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { createBleDriver } from "./src/ble";
import { createSimulator } from "./src/simulator";
import { Driver, DeviceState } from "./src/protocol";
type Event = {
  id: string;
  state: DeviceState;
  source: "device" | "simulator" | "connection";
  reason: string;
  recorded: string;
};
type Session = {
  id: string;
  patient: string;
  device: string;
  mode: "simulator" | "hardware";
  started: string;
  ended?: string;
  events: Event[];
};
type User = { id: string; name: string; role: string };
const KEY = "fleure-pending-v1";
export default function App() {
  const [url, setUrl] = useState("http://localhost:3001"),
    [email, setEmail] = useState("patient@fleure.local"),
    [password, setPassword] = useState(""),
    [token, setToken] = useState(""),
    [user, setUser] = useState<User | null>(null);
  const [mode, setMode] = useState<"simulator" | "hardware">("simulator"),
    [connected, setConnected] = useState(false),
    [state, setState] = useState<DeviceState>("unknown"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState(""),
    [pending, setPending] = useState(0),
    [history, setHistory] = useState<Session[]>([]),
    [logs, setLogs] = useState<string[]>([]),
    [ready, setReady] = useState(false);
  const driver = useRef<Driver | null>(null),
    queue = useRef<Session[]>([]),
    active = useRef<Session | null>(null),
    syncing = useRef(false),
    persisting = useRef(Promise.resolve()),
    interrupted = useRef(false);
  function log(text: string) {
    setLogs((old) =>
      [`${new Date().toLocaleTimeString()} ${text}`, ...old].slice(0, 30),
    );
  }
  function persist() {
    const snapshot = JSON.stringify(queue.current);
    setPending(queue.current.reduce((n, s) => n + s.events.length, 0));
    persisting.current = persisting.current.then(() =>
      AsyncStorage.setItem(KEY, snapshot),
    );
    persisting.current.catch(() =>
      setError("Could not save pending events on this phone."),
    );
    return persisting.current;
  }
  function event(s: DeviceState, source: Event["source"], reason: string) {
    setState(s);
    log(`${source}: ${s} (${reason})`);
    if (active.current) {
      active.current.events.push({
        id: Crypto.randomUUID(),
        state: s,
        source,
        reason,
        recorded: new Date().toISOString(),
      });
      void persist();
    }
  }
  async function finish() {
    if (active.current) {
      active.current.ended = new Date().toISOString();
      active.current = null;
      await persist();
    }
  }
  useEffect(() => {
    void AsyncStorage.getItem(KEY)
      .then((raw) => {
        queue.current = raw ? JSON.parse(raw) : [];
        for (const s of queue.current)
          if (!s.ended) {
            const now = new Date().toISOString();
            s.events.push({
              id: Crypto.randomUUID(),
              state: "unknown",
              source: "connection",
              reason: "app_restart",
              recorded: now,
            });
            s.ended = now;
          }
        setPending(queue.current.reduce((n, s) => n + s.events.length, 0));
        setReady(true);
      })
      .catch(() =>
        setError("Cannot load saved events. Reload the app before starting."),
      );
    return () => {
      void driver.current?.disconnect();
    };
  }, []);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next !== "active") {
        interrupted.current = true;
        void driver.current?.disconnect();
        driver.current = null;
        setConnected(false);
        event("unknown", "connection", "app_background");
        void finish();
      }
    });
    return () => sub.remove();
  }, []);
  async function api(path: string, options: RequestInit = {}, auth = token) {
    const r = await fetch(url.replace(/\/$/, "") + "/api" + path, {
      ...options,
      signal: AbortSignal.timeout(10000),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${auth}`,
      },
    });
    if (!r.ok) {
      const b = await r.json();
      throw new Error(b.error || `HTTP ${r.status}`);
    }
    return r.status === 204 ? null : r.json();
  }
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function sync() {
    if (syncing.current || !user) return;
    syncing.current = true;
    try {
      for (const session of [...queue.current].filter(
        (s) => s.patient === user.id,
      )) {
        await api("/sessions", {
          method: "POST",
          body: JSON.stringify({
            id: session.id,
            device: session.device,
            mode: session.mode,
            started: session.started,
          }),
        });
        while (session.events.length) {
          const batch = session.events.slice(0, 100);
          await api(`/sessions/${session.id}/events`, {
            method: "POST",
            body: JSON.stringify(batch),
          });
          session.events.splice(0, batch.length);
          await persist();
        }
        if (session.ended) {
          await api(`/sessions/${session.id}`, {
            method: "PATCH",
            body: JSON.stringify({ ended: session.ended }),
          });
          queue.current = queue.current.filter((s) => s !== session);
          await persist();
        }
      }
      setStatus(
        "Uploads complete. Active sessions upload again when you press Sync.",
      );
      setHistory(await api("/sessions"));
    } finally {
      syncing.current = false;
    }
  }
  async function disconnect() {
    await driver.current?.disconnect();
    driver.current = null;
    setConnected(false);
    event("unknown", "connection", "disconnected");
    await finish();
  }
  async function connect() {
    if (!user) return;
    interrupted.current = false;
    const d = mode === "simulator" ? createSimulator() : createBleDriver();
    driver.current = d;
    const session: Session = {
      id: Crypto.randomUUID(),
      patient: user.id,
      device: "connecting",
      mode,
      started: new Date().toISOString(),
      events: [],
    };
    queue.current.push(session);
    active.current = session;
    try {
      const id = await d.connect(
        (s) =>
          event(
            s,
            mode === "simulator" ? "simulator" : "device",
            "state_report",
          ),
        () => {
          interrupted.current = true;
          setConnected(false);
          event("unknown", "connection", "link_lost");
          void finish();
          driver.current = null;
          void d.disconnect();
        },
      );
      if (interrupted.current)
        throw new Error(
          "Connection interrupted; reconnect from the foreground.",
        );
      session.device = id;
      await persist();
      setConnected(true);
      log(`Connected: ${id}`);
    } catch (e) {
      await d.disconnect();
      driver.current = null;
      event("unknown", "connection", "connection_failed");
      await finish();
      throw e;
    }
  }
  return (
    <ScrollView
      contentContainerStyle={styles.page}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Fleure · Patient demo</Text>
      <Text>LED prototype only. Keep the app in the foreground.</Text>
      {!!error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
      {!ready && <Text>Loading saved events…</Text>}
      {!token ? (
        <View style={styles.card}>
          <Text>API address (use your computer’s LAN IP on a phone)</Text>
          <TextInput
            style={styles.input}
            autoCapitalize="none"
            value={url}
            onChangeText={setUrl}
          />
          <Text>Email</Text>
          <TextInput
            style={styles.input}
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
          />
          <Text>Password</Text>
          <TextInput
            style={styles.input}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
          <Button
            title="Sign in"
            disabled={busy || !ready}
            onPress={() =>
              void action(async () => {
                const b = await api("/login", {
                  method: "POST",
                  body: JSON.stringify({ email, password }),
                });
                if (b.user.role !== "patient") {
                  await api("/logout", { method: "POST" }, b.token);
                  throw new Error(
                    "Use a patient account. Clinicians use the web dashboard.",
                  );
                }
                setUser(b.user);
                setToken(b.token);
                setPassword("");
              })
            }
          />
        </View>
      ) : (
        <>
          <Text style={styles.heading}>{user?.name}</Text>
          <Text>API: {url}</Text>
          <View style={styles.card}>
            <Text style={styles.heading}>
              Device mode: {mode.toUpperCase()}
            </Text>
            <Button
              title={
                mode === "simulator"
                  ? "Switch to real ESP32 BLE"
                  : "Switch to simulator"
              }
              disabled={busy || connected}
              onPress={() => {
                setMode(mode === "simulator" ? "hardware" : "simulator");
                setState("unknown");
              }}
            />
            <Text>Connection: {connected ? "Connected" : "Disconnected"}</Text>
            <Text style={styles.state}>State: {state.toUpperCase()}</Text>
            <Text>
              {mode === "simulator"
                ? "Simulated LEDs — no hardware commands"
                : "Actual ESP32 state reported over BLE"}
            </Text>
            <Button
              title={connected ? "Disconnect" : "Connect"}
              disabled={busy}
              onPress={() => void action(connected ? disconnect : connect)}
            />
            <View style={styles.row}>
              <Button
                title="START"
                disabled={busy || !connected || state === "unknown"}
                onPress={() =>
                  void action(async () => {
                    await driver.current!.command(true);
                  })
                }
              />
              <Button
                title="STOP"
                disabled={!connected}
                onPress={() =>
                  void action(async () => {
                    await driver.current!.command(false);
                  })
                }
              />
            </View>
          </View>
          <View style={styles.card}>
            <Text style={styles.heading}>Session uploads</Text>
            <Text>{pending} pending events on this phone</Text>
            <Text>{status}</Text>
            <Button
              title="Sync uploads / refresh history"
              disabled={busy}
              onPress={() => void action(sync)}
            />
            {history.map((s) => (
              <Text key={s.id}>
                {new Date(s.started).toLocaleString()} · {s.mode} ·{" "}
                {s.ended ? "ended" : "no end uploaded"}
              </Text>
            ))}
          </View>
          <Button
            title="Sign out"
            disabled={busy}
            onPress={() =>
              void action(async () => {
                await disconnect();
                await api("/logout", { method: "POST" });
                setToken("");
                setUser(null);
                setHistory([]);
                setStatus("");
              })
            }
          />
        </>
      )}
      <Text style={styles.heading}>Recent events</Text>
      {logs.map((l, i) => (
        <Text key={i} style={styles.log}>
          {l}
        </Text>
      ))}
      {busy && <Text>Working…</Text>}
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  page: {
    padding: 24,
    paddingTop: 60,
    gap: 12,
    maxWidth: 700,
    width: "100%",
    alignSelf: "center",
  },
  title: { fontSize: 26, fontWeight: "700" },
  heading: { fontSize: 18, fontWeight: "600", marginTop: 12 },
  card: {
    padding: 16,
    borderWidth: 1,
    borderColor: "#bccbc5",
    borderRadius: 8,
    gap: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: "#9baea8",
    padding: 12,
    borderRadius: 4,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingVertical: 16,
  },
  state: { fontSize: 28, fontWeight: "700" },
  error: { color: "#a32020", padding: 12, backgroundColor: "#ffeaea" },
  log: { fontSize: 12 },
});
