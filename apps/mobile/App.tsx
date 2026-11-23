import React, { useEffect, useRef, useState } from "react";
import { AppState, Keyboard, RefreshControl, SafeAreaView, ScrollView, StatusBar, StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { createBleDriver } from "./src/ble";
import { Driver, DeviceState, Telemetry, isActive, manualSettingsForTelemetry, supportsAutomation, acceptedSystolic, classifySystolic, bloodPressureMessage } from "./src/protocol";
import { colors } from "./src/theme";
import { TabBar, TabKey } from "./src/ui";
import { SignInScreen } from "./src/screens/SignInScreen";
import { HomeScreen } from "./src/screens/HomeScreen";
import { TherapyPlanScreen } from "./src/screens/TherapyPlanScreen";
import { HistoryScreen, SessionSummary } from "./src/screens/HistoryScreen";
import { SessionDetailScreen } from "./src/screens/SessionDetailScreen";
import { ProfileScreen } from "./src/screens/ProfileScreen";
import { PreSessionSheet } from "./src/screens/PreSessionSheet";
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
const API_URL = "https://fleure-378c.onrender.com";
export default function App() {
  const [email, setEmail] = useState("patient@fleure.local"),
    [password, setPassword] = useState(""),
    [token, setToken] = useState(""),
    [user, setUser] = useState<User | null>(null);
  const [connected, setConnected] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState(""),
    [pending, setPending] = useState(0),
    [history, setHistory] = useState<Session[]>([]),
    [logs, setLogs] = useState<string[]>([]),
    [ready, setReady] = useState(false);
  const [therapy, setTherapy] = useState<Telemetry | null>(null);
  const [targetMmHg, setTargetMmHg] = useState(200);
  const [durationSeconds, setDurationSeconds] = useState(120);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [bpAlert, setBpAlert] = useState("");
  const [systolic, setSystolic] = useState<number | null>(null);
  const lastTelemetry = useRef<Telemetry | null>(null);
  const commandGeneration = useRef(0);
  const driver = useRef<Driver | null>(null),
    queue = useRef<Session[]>([]),
    active = useRef<Session | null>(null),
    syncing = useRef(false),
    persisting = useRef(Promise.resolve()),
    interrupted = useRef(false);
  const [tab, setTab] = useState<TabKey>("home");
  const [homePage, setHomePage] = useState<"main" | "plan">("main");
  const [openSession, setOpenSession] = useState<SessionSummary | null>(null);
  const [preSession, setPreSession] = useState<{ automated: boolean } | null>(null);
  const [syncState, setSyncState] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [deviceName, setDeviceName] = useState("");

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
  function clearTelemetry() {
    lastTelemetry.current = null; setTherapy(null); setStarting(false); setStopping(false);
    ++commandGeneration.current;
  }
  function receiveTelemetry(t: Telemetry) {
    const previous = lastTelemetry.current;
    lastTelemetry.current = t;
    setTherapy(t);
    const estimate = acceptedSystolic(previous, t);
    if (estimate !== null) checkBloodPressure(estimate);
    if (!previous || (isActive(t) && previous.runId !== t.runId)) {
      setTargetMmHg(current => manualSettingsForTelemetry({ targetMmHg: current, durationSeconds: t.durationSeconds }, t).targetMmHg);
      setDurationSeconds(t.durationSeconds);
    }
    // Upload phase changes, not five pressure samples every second. Pressure is live display only.
    if (!previous || previous.phase !== t.phase || previous.reason !== t.reason || previous.runId !== t.runId) {
      event(isActive(t) ? "on" : "off", "device", `${t.phase}:${t.reason};target=${t.targetMmHg};duration=${t.durationSeconds};run=${t.runId}`);
    }
  }
  function checkBloodPressure(estimate: number) {
    setSystolic(estimate);
    const status = classifySystolic(estimate);
    const message = bloodPressureMessage(status, estimate);
    if (!message) return;
    setBpAlert(message);
    event("off", "device", `bp_${status};systolic=${estimate}`);
    void stopForBloodPressure();
  }
  async function stopForBloodPressure() {
    const d = driver.current;
    if (!d) return;
    const generation = ++commandGeneration.current;
    setStarting(false);
    setStopping(true);
    try {
      await d.stop();
    } catch (e) {
      if (commandGeneration.current === generation) setError(`Could not stop therapy after the blood pressure warning: ${(e as Error).message}. Press STOP or the physical button now.`);
    } finally {
      if (commandGeneration.current === generation) setStopping(false);
    }
  }
  async function toggleTherapy(automated = false) {
    const d = driver.current;
    if (!d || !connected) return;
    const stop = isActive(lastTelemetry.current) || starting;
    const generation = ++commandGeneration.current;
    setError("");
    if (!stop) { setBpAlert(""); setSystolic(null); }
    if (stop) setStopping(true); else setStarting(true);
    try {
      if (stop) await d.stop();
      else await d.start({ targetMmHg, durationSeconds }, automated);
    } catch (e) {
      if (commandGeneration.current === generation) setError((e as Error).message);
    } finally {
      if (commandGeneration.current === generation) { setStarting(false); setStopping(false); }
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
        clearTelemetry();
        event("unknown", "connection", "app_background");
        void finish();
      }
    });
    return () => sub.remove();
  }, []);
  async function api(path: string, options: RequestInit = {}, auth = token) {
    const request = () => fetch(API_URL + "/api" + path, {
      ...options,
      // The hosted API sleeps when idle and can take ~30-60 s to wake up.
      signal: AbortSignal.timeout(60000),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${auth}`,
      },
    });
    let r: Response;
    try {
      r = await request();
    } catch {
      // One retry covers a server that was still waking on the first attempt.
      setStatus("Server is waking up, trying again…");
      try {
        r = await request();
      } catch (e) {
        throw new Error(`Cannot reach the Fleure server. Check that your phone is online and try again. (${(e as Error).message})`);
      } finally {
        setStatus("");
      }
    }
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
      setHistory(await api("/sessions"));
      setHistoryLoaded(true);
      setLastSynced(new Date());
    } finally {
      syncing.current = false;
    }
  }
  async function disconnect() {
    await driver.current?.disconnect();
    driver.current = null;
    setConnected(false);
    clearTelemetry();
    event("unknown", "connection", "disconnected");
    await finish();
  }
  async function connect() {
    if (!user) return;
    interrupted.current = false;
    clearTelemetry();
    const d = createBleDriver();
    driver.current = d;
    const session: Session = {
      id: Crypto.randomUUID(),
      patient: user.id,
      device: "connecting",
      mode: "hardware",
      started: new Date().toISOString(),
      events: [],
    };
    queue.current.push(session);
    active.current = session;
    try {
      const id = await d.connect(
        (t) => { if (driver.current === d && !interrupted.current) receiveTelemetry(t); },
        () => {
          if (driver.current !== d) return;
          interrupted.current = true;
          setConnected(false);
          clearTelemetry();
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
      setDeviceName(id);
      await persist();
      setConnected(true);
      log(`Connected: ${id}`);
    } catch (e) {
      await d.disconnect();
      driver.current = null;
      clearTelemetry();
      event("unknown", "connection", "connection_failed");
      await finish();
      throw e;
    }
  }
  const therapyActive = isActive(therapy) || starting;
  const settingsLocked = therapyActive || stopping;
  const reasonLabels: Record<string, string> = {
    sensor_fault: "Sensor unavailable or invalid. Pump stopped; vent open.",
    systolic_estimation_failed: "Unable to estimate systolic pressure from the recorded signal, or it was outside the 80–240 mmHg range the device accepts. Pump stopped; vent open. Do not repeat therapy if your blood pressure may be very high or low; check the Serial Monitor for details.",
    overpressure: "300 mmHg cutoff reached. Pump stopped; vent open.",
    pressure_build_timeout: "Target range was not reached within 60 seconds. Pump stopped; vent open.",
    heartbeat_timeout: "App heartbeat lost. Pump stopped; vent open.",
    disconnected: "Bluetooth disconnected. Pump stopped; vent open.",
    physical_stop: "Stopped using the physical green button.", app_stop: "Stopped from the app.",
    completed: "The ESP32 completed the timer, stopped the pump and opened the vent.",
  };
  const canStart = connected && ready && !busy && !starting && !stopping && !!therapy && therapy.pressureMmHg !== null && therapy.pressureMmHg < 300;
  const reasonText = connected && therapy && reasonLabels[therapy.reason] ? reasonLabels[therapy.reason] : null;
  const name = user?.name || "there";

  async function signIn() {
    await action(async () => {
      const b = await api("/login", { method: "POST", body: JSON.stringify({ email: email.trim(), password }) });
      if (b.user.role !== "patient") {
        await api("/logout", { method: "POST" }, b.token);
        throw new Error("Use a patient account. Clinicians use the web dashboard.");
      }
      Keyboard.dismiss(); setUser(b.user); setToken(b.token); setPassword("");
      setTab("home"); setHomePage("main"); setOpenSession(null);
    });
  }
  async function signOut() {
    setSigningOut(true);
    try {
      await disconnect();
      await api("/logout", { method: "POST" }).catch(() => undefined);
    } finally {
      setSigningOut(false);
      setToken(""); setUser(null); setHistory([]); setHistoryLoaded(false); setStatus(""); setLogs([]); setError(""); setSyncError(""); setLastSynced(null);
    }
  }
  async function syncNow() {
    if (syncState) return;
    setSyncState(true);
    setSyncError("");
    try { await sync(); } catch (e) { setSyncError((e as Error).message); } finally { setSyncState(false); }
  }
  async function connectDevice() {
    setConnecting(true);
    setError("");
    try { await connect(); } catch (e) { setError((e as Error).message); } finally { setConnecting(false); }
  }
  useEffect(() => { if (token && user) void syncNow(); }, [token, user?.id]);

  if (!token) {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar barStyle="dark-content" />
        <SignInScreen email={email} password={password} busy={busy} ready={ready} error={error} status={status} onEmail={setEmail} onPassword={setPassword} onSubmit={() => void signIn()} />
      </SafeAreaView>
    );
  }

  let page: React.ReactNode;
  if (tab === "home") {
    page = homePage === "plan" ? (
      <TherapyPlanScreen targetMmHg={targetMmHg} durationSeconds={durationSeconds} locked={settingsLocked} onTarget={setTargetMmHg} onDuration={setDurationSeconds} onBack={() => setHomePage("main")} />
    ) : (
      <HomeScreen
        name={name}
        connected={connected}
        connecting={connecting}
        deviceName={deviceName}
        therapy={therapy}
        therapyActive={therapyActive}
        starting={starting}
        stopping={stopping}
        canStart={canStart}
        automationSupported={supportsAutomation(therapy)}
        targetMmHg={targetMmHg}
        durationSeconds={durationSeconds}
        error={error}
        bpAlert={bpAlert}
        systolic={systolic}
        reasonText={reasonText}
        onConnect={() => void connectDevice()}
        onDisconnect={() => void action(disconnect)}
        onStart={(automated) => setPreSession({ automated })}
        onStop={() => void toggleTherapy()}
        onEditPlan={() => setHomePage("plan")}
        onOpenProfile={() => setTab("profile")}
      />
    );
  } else if (tab === "history") {
    page = openSession ? (
      <SessionDetailScreen session={openSession} load={(id) => api(`/sessions/${id}/events`)} onBack={() => setOpenSession(null)} />
    ) : (
      <HistoryScreen sessions={history} loaded={historyLoaded} pending={pending} syncing={syncState} syncError={syncError} lastSynced={lastSynced} onSync={() => void syncNow()} onOpen={setOpenSession} />
    );
  } else {
    page = (
      <ProfileScreen name={name} email={email.trim()} connected={connected} deviceName={deviceName} automationSupported={supportsAutomation(therapy)} logs={logs} signingOut={signingOut} onSignOut={() => void signOut()} />
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        key={`${tab}-${homePage}-${openSession?.id ?? ""}`}
        style={styles.flex}
        contentContainerStyle={styles.page}
        refreshControl={tab === "history" && !openSession ? <RefreshControl refreshing={syncState} onRefresh={() => void syncNow()} tintColor={colors.brand} /> : undefined}
      >
        {page}
      </ScrollView>
      <TabBar
        active={tab}
        onChange={(t) => { if (t === tab) { setHomePage("main"); setOpenSession(null); } setTab(t); }}
        badges={{ history: pending, home: bpAlert ? 1 : 0 }}
      />
      <PreSessionSheet
        visible={!!preSession}
        automated={!!preSession?.automated}
        targetMmHg={targetMmHg}
        durationSeconds={durationSeconds}
        canStart={canStart}
        onCancel={() => setPreSession(null)}
        onConfirm={() => { const automated = !!preSession?.automated; setPreSession(null); void toggleTherapy(automated); }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  page: { padding: 20, paddingBottom: 32, width: "100%", maxWidth: 620, alignSelf: "center" },
});
