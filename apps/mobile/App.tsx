import React, { useEffect, useRef, useState } from "react";
import {
  AppState,
  ActivityIndicator,
  Keyboard,
  KeyboardEvent,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { createBleDriver } from "./src/ble";
import { Driver, DeviceState, Telemetry, isActive, PRESSURES, DURATIONS, formatTime, PHASE_LABELS, manualSettingsForTelemetry, supportsAutomation } from "./src/protocol";
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
  const lastTelemetry = useRef<Telemetry | null>(null);
  const commandGeneration = useRef(0);
  const driver = useRef<Driver | null>(null),
    queue = useRef<Session[]>([]),
    active = useRef<Session | null>(null),
    syncing = useRef(false),
    persisting = useRef(Promise.resolve()),
    interrupted = useRef(false);
  const scrollView = useRef<React.ElementRef<typeof ScrollView> | null>(null);
  const emailInput = useRef<React.ElementRef<typeof TextInput> | null>(null);
  const passwordInput = useRef<React.ElementRef<typeof TextInput> | null>(null);
  const serverInput = useRef<React.ElementRef<typeof TextInput> | null>(null);
  const focusedInput = useRef<React.ElementRef<typeof TextInput> | null>(null);
  const scrollOffset = useRef(0);
  const keyboardTop = useRef<number | null>(null);
  const [keyboardSpace, setKeyboardSpace] = useState(0);

  function revealFocusedInput() {
    const input = focusedInput.current;
    const scroll = scrollView.current;
    if (!input || !scroll || keyboardTop.current === null) return;
    scroll.measureInWindow((_x, top, _width, height) => {
      input.measureInWindow((_inputX, inputTop, _inputWidth, inputHeight) => {
        if (focusedInput.current !== input || keyboardTop.current === null) return;
        const visibleBottom = Math.min(top + height, keyboardTop.current) - 24;
        const delta = inputTop + inputHeight > visibleBottom
          ? inputTop + inputHeight - visibleBottom
          : inputTop < top + 16 ? inputTop - top - 16 : 0;
        if (delta !== 0) {
          scroll.scrollTo({ y: Math.max(0, scrollOffset.current + delta), animated: false });
        }
      });
    });
  }

  function focusField(input: React.ElementRef<typeof TextInput> | null) {
    focusedInput.current = input;
    requestAnimationFrame(revealFocusedInput);
  }

  useEffect(() => {
    const show = (e: KeyboardEvent) => {
      keyboardTop.current = e.endCoordinates.screenY;
      // Extra content space makes even the final field reachable by scrolling.
      setKeyboardSpace(e.endCoordinates.height);
      requestAnimationFrame(revealFocusedInput);
    };
    const hide = () => {
      keyboardTop.current = null;
      setKeyboardSpace(0);
    };
    const subscriptions = [
      Keyboard.addListener("keyboardWillChangeFrame", show),
      Keyboard.addListener("keyboardDidShow", show),
      Keyboard.addListener("keyboardWillHide", hide),
      Keyboard.addListener("keyboardDidHide", hide),
    ];
    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, []);

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
    if (!previous || (isActive(t) && previous.runId !== t.runId)) {
      setTargetMmHg(current => manualSettingsForTelemetry({ targetMmHg: current, durationSeconds: t.durationSeconds }, t).targetMmHg);
      setDurationSeconds(t.durationSeconds);
    }
    // Upload phase changes, not five pressure samples every second. Pressure is live display only.
    if (!previous || previous.phase !== t.phase || previous.reason !== t.reason || previous.runId !== t.runId) {
      event(isActive(t) ? "on" : "off", "device", `${t.phase}:${t.reason};target=${t.targetMmHg};duration=${t.durationSeconds};run=${t.runId}`);
    }
  }
  async function toggleTherapy(automated = false) {
    const d = driver.current;
    if (!d || !connected) return;
    const stop = isActive(lastTelemetry.current) || starting;
    const generation = ++commandGeneration.current;
    setError("");
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
    systolic_estimation_failed: "Unable to estimate systolic pressure from the recorded signal. Pump stopped; vent open. Check the Serial Monitor for details.",
    overpressure: "300 mmHg cutoff reached. Pump stopped; vent open.",
    pressure_build_timeout: "Target range was not reached within 60 seconds. Pump stopped; vent open.",
    heartbeat_timeout: "App heartbeat lost. Pump stopped; vent open.",
    disconnected: "Bluetooth disconnected. Pump stopped; vent open.",
    physical_stop: "Stopped using the physical STOP button.", app_stop: "Stopped from the app.",
    completed: "The ESP32 completed the timer, stopped the pump and opened the vent.",
  };
  const deviceLabel = !connected ? "Not connected" : therapy ? PHASE_LABELS[therapy.phase] : "Reading device…";
  const countdown = therapy && (isActive(therapy) || therapy.timerStarted) ? therapy.remainingSeconds : durationSeconds;
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView
        ref={scrollView}
        style={styles.keyboardArea}
        contentContainerStyle={[styles.page, { paddingBottom: 36 + keyboardSpace }]}
        onScroll={(e) => { scrollOffset.current = e.nativeEvent.contentOffset.y; }}
        scrollEventThrottle={16}
        onContentSizeChange={() => requestAnimationFrame(revealFocusedInput)}
        onLayout={() => requestAnimationFrame(revealFocusedInput)}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="none"
      >
        <View style={styles.header}>
          <View style={styles.brandMark}><Text style={styles.brandLetter}>f</Text></View>
          <View style={styles.grow}>
            <Text style={styles.brand}>fleure</Text>
            <Text style={styles.eyebrow}>YOUR DEVICE COMPANION</Text>
          </View>
          <View style={styles.badge}><Text style={styles.badgeText}>PATIENT</Text></View>
        </View>

        <View style={styles.intro}>
          <Text style={styles.title}>{token ? `Hello, ${user?.name || "there"}.` : "Welcome back."}</Text>
          <Text style={styles.subtitle}>{token ? "Your device, a little closer." : "Sign in to connect to your Fleure device."}</Text>
        </View>
        {!!error && <View style={styles.errorBox}><Text accessibilityRole="alert" style={styles.error}>{error}</Text></View>}
        {!ready && <View style={styles.inline}><ActivityIndicator color="#17685D" /><Text style={styles.body}>Loading saved events…</Text></View>}

        {!token ? (
          <View style={styles.card}>
            <Text style={styles.heading}>Your account</Text>
            <Text style={styles.body}>Use the patient account provided for this prototype.</Text>
            <Text style={styles.label}>EMAIL ADDRESS</Text>
            <TextInput ref={emailInput} onFocus={() => focusField(emailInput.current)} returnKeyType="next" onSubmitEditing={() => passwordInput.current?.focus()} blurOnSubmit={false} accessibilityLabel="Email address" style={styles.input} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="username" value={email} onChangeText={setEmail} placeholder="patient@fleure.local" placeholderTextColor="#64766E" />
            <Text style={styles.label}>PASSWORD</Text>
            <TextInput ref={passwordInput} onFocus={() => focusField(passwordInput.current)} returnKeyType="next" onSubmitEditing={() => serverInput.current?.focus()} blurOnSubmit={false} accessibilityLabel="Password" style={styles.input} secureTextEntry autoCapitalize="none" autoCorrect={false} textContentType="password" value={password} onChangeText={setPassword} placeholder="Enter your password" placeholderTextColor="#64766E" />
            <Text style={styles.label}>SERVER ADDRESS</Text>
            <TextInput ref={serverInput} onFocus={() => focusField(serverInput.current)} returnKeyType="done" onSubmitEditing={() => Keyboard.dismiss()} accessibilityLabel="API server address" style={styles.input} autoCapitalize="none" autoCorrect={false} keyboardType="url" value={url} onChangeText={setUrl} placeholder="http://192.168.1.10:3001" placeholderTextColor="#64766E" />
            <Text style={styles.caption}>On a phone, use your computer’s local network address.</Text>
            <ActionButton title={busy ? "Signing in…" : "Sign in"} disabled={busy || !ready} onPress={() => void action(async () => {
              const b = await api("/login", { method: "POST", body: JSON.stringify({ email: email.trim(), password }) });
              if (b.user.role !== "patient") {
                await api("/logout", { method: "POST" }, b.token);
                throw new Error("Use a patient account. Clinicians use the web dashboard.");
              }
              Keyboard.dismiss(); setUser(b.user); setToken(b.token); setPassword("");
            })} />
          </View>
        ) : (
          <>
            <View style={styles.deviceCard}>
              <View style={styles.spread}>
                <Text style={styles.lightEyebrow}>FLEURE DEVICE</Text>
                <View style={styles.connectionBadge}>
                  <View style={[styles.dot, { backgroundColor: connected ? "#BDE9CF" : "#D4DEDA" }]} />
                  <Text style={styles.connectionText}>{connected ? "Connected" : "Offline"}</Text>
                </View>
              </View>
              <View style={styles.stateArea}>
                <Text style={styles.lightEyebrow}>CURRENT PRESSURE</Text>
                <View style={styles.pressureLine}>
                  <Text accessibilityLiveRegion="none" style={styles.pressureValue}>{connected && therapy?.pressureMmHg != null ? therapy.pressureMmHg.toFixed(1) : "—"}</Text>
                  <Text style={styles.pressureUnit}>mmHg</Text>
                </View>
                <Text accessibilityLiveRegion="polite" style={styles.deviceState}>{deviceLabel}</Text>
                <Text style={styles.deviceHint}>{!connected ? "Keep your ESP32 nearby and Bluetooth enabled." : `Target ${therapyActive && therapy ? therapy.targetMmHg : targetMmHg} mmHg · reported by your device`}</Text>
              </View>
              <View style={styles.timerPanel}>
                <Text style={styles.lightEyebrow}>TIME REMAINING</Text>
                <Text style={styles.timerValue}>{formatTime(countdown)}</Text>
                <Text style={styles.deviceHint}>{therapy?.phase === "pressurizing" ? "Waiting for pressure to enter the ±5 mmHg range" : therapy?.phase === "running" ? "Countdown runs on your ESP32" : therapy?.phase === "completed" ? "Completed · pump off · vent open" : "Timer begins when target range is first reached"}</Text>
              </View>
              {connected && therapy && reasonLabels[therapy.reason] && <Text accessibilityRole={therapy.phase === "fault" ? "alert" : undefined} style={styles.deviceHint}>{reasonLabels[therapy.reason]}</Text>}
              <ActionButton
                title={stopping ? "Stopping…" : therapyActive ? "STOP" : "Start"}
                variant={therapyActive ? "stop" : "light"}
                disabled={!connected || !ready || stopping || (!therapyActive && (busy || !therapy || therapy.pressureMmHg === null || therapy.pressureMmHg >= 300))}
                onPress={() => void toggleTherapy()}
              />
              {!therapyActive && supportsAutomation(therapy) && <ActionButton
                title="Automated RIPC therapy"
                variant="primary"
                disabled={!connected || !ready || stopping || busy || !therapy || therapy.pressureMmHg === null || therapy.pressureMmHg >= 300}
                onPress={() => void toggleTherapy(true)}
              />}
              <ActionButton title={busy && !connected ? "Please wait…" : connected ? "Disconnect device" : "Connect device"} variant="device" disabled={busy || !ready || starting || stopping} onPress={() => void action(connected ? disconnect : connect)} />
            </View>

            <View style={styles.note}><Text style={styles.noteText}>Bench prototype · Keep the app in the foreground while connected.</Text></View>

            <View style={styles.card}>
              <Text style={styles.heading}>Therapy settings</Text>
              <Text style={styles.body}>{settingsLocked ? "Settings are locked during a session." : "Choose the pressure and duration for your next session."}</Text>
              <Text style={styles.label}>TARGET PRESSURE · mmHg</Text>
              <View style={styles.optionGrid}>
                {PRESSURES.map(value => <Pressable key={value} accessibilityRole="button" accessibilityLabel={`${value} millimeters of mercury`} accessibilityState={{ selected: value === targetMmHg, disabled: settingsLocked }} disabled={settingsLocked} onPress={() => setTargetMmHg(value)} style={[styles.option, value === targetMmHg && styles.optionSelected, settingsLocked && styles.optionDisabled]}><Text style={[styles.optionText, value === targetMmHg && styles.optionTextSelected]}>{value}</Text></Pressable>)}
              </View>
              <Text style={styles.caption}>The countdown begins on first reaching ±5 mmHg of the target. It continues if pressure later leaves that range.</Text>
              <Text style={styles.label}>DURATION · MINUTES : SECONDS</Text>
              <View style={styles.optionGrid}>
                {DURATIONS.map(value => <Pressable key={value} accessibilityRole="button" accessibilityLabel={`Duration ${formatTime(value)}`} accessibilityState={{ selected: value === durationSeconds, disabled: settingsLocked }} disabled={settingsLocked} onPress={() => setDurationSeconds(value)} style={[styles.option, value === durationSeconds && styles.optionSelected, settingsLocked && styles.optionDisabled]}><Text style={[styles.optionText, value === durationSeconds && styles.optionTextSelected]}>{formatTime(value)}</Text></Pressable>)}
              </View>
              <Text style={styles.caption}>Device shuts down and vents at 300 mmHg or on a sensor fault.</Text>
            </View>

            <View style={styles.card}>
              <View style={styles.spread}>
                <View style={styles.grow}><Text style={styles.heading}>Session uploads</Text><Text style={styles.body}>Saved on this phone until uploaded.</Text></View>
                <View style={styles.countBadge}><Text style={styles.count}>{pending}</Text><Text style={styles.caption}>events</Text></View>
              </View>
              {!!status && <Text accessibilityLiveRegion="polite" style={styles.success}>{status}</Text>}
              <ActionButton title="Sync & refresh history" variant="secondary" disabled={busy} onPress={() => void action(sync)} />
              <Text style={styles.label}>RECENT SESSIONS</Text>
              {!history.length ? <Text style={styles.caption}>Sync to load your session history.</Text> : history.map((s) => (
                <View key={s.id} style={styles.historyRow}>
                  <View style={styles.grow}><Text style={styles.historyTitle}>{new Date(s.started).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · {new Date(s.started).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</Text><Text style={styles.caption}>{s.device}</Text></View>
                  <Text style={styles.historyStatus}>{s.ended ? "Ended" : "No end uploaded"}</Text>
                </View>
              ))}
            </View>

            <View style={styles.card}>
              <View style={styles.spread}><Text style={styles.heading}>Activity</Text><Text style={styles.caption}>This visit</Text></View>
              {!logs.length ? <Text style={styles.body}>Device and connection events will appear here.</Text> : logs.slice(0, 10).map((line, i) => (
                <View key={i} style={styles.activityRow}><View style={styles.activityDot} /><Text style={styles.log}>{line}</Text></View>
              ))}
            </View>
            <ActionButton title="Sign out" variant="secondary" disabled={busy} onPress={() => void action(async () => {
              await disconnect(); await api("/logout", { method: "POST" }); setToken(""); setUser(null); setHistory([]); setStatus(""); setLogs([]);
            })} />
          </>
        )}
        {busy && <View accessibilityLiveRegion="polite" style={styles.inline}><ActivityIndicator color="#17685D" /><Text style={styles.caption}>Working…</Text></View>}
        <Text style={styles.footer}>FLEURE · BLUETOOTH DEVICE PROTOTYPE</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

type ActionButtonProps = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "light" | "stop" | "device";
};
function ActionButton({ title, onPress, disabled = false, variant = "primary" }: ActionButtonProps) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, variant === "secondary" ? styles.buttonSecondary : variant === "light" ? styles.buttonLight : variant === "stop" ? styles.buttonStop : variant === "device" ? styles.buttonDevice : styles.buttonPrimary, disabled && styles.buttonDisabled, pressed && !disabled && styles.buttonPressed]}>
    <Text style={[styles.buttonText, (variant === "secondary" || variant === "light") && styles.buttonTextDark, variant === "stop" && styles.buttonTextStop]}>{title}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  keyboardArea: { flex: 1 },
  pressureLine: { flexDirection: "row", alignItems: "baseline", gap: 8, flexWrap: "wrap", justifyContent: "center" },
  pressureValue: { color: "#F2F4D1", fontSize: 56, fontWeight: "600", letterSpacing: -2, fontVariant: ["tabular-nums"] },
  pressureUnit: { color: "#D3E3DA", fontSize: 17 },
  timerPanel: { backgroundColor: "#22685B", borderRadius: 18, padding: 16, alignItems: "center", gap: 7 },
  timerValue: { color: "#FFFFFF", fontSize: 42, fontWeight: "600", fontVariant: ["tabular-nums"] },
  optionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  option: { minWidth: 62, minHeight: 46, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "#F0F3EB", borderWidth: 1, borderColor: "#D6E0D3" },
  optionSelected: { backgroundColor: "#17685D", borderColor: "#17685D" },
  optionDisabled: { opacity: 0.65 },
  optionText: { fontSize: 15, fontWeight: "600", color: "#193F36", fontVariant: ["tabular-nums"] },
  optionTextSelected: { color: "#FFFFFF" },
  buttonDevice: { backgroundColor: "#2E6B60", borderWidth: 1, borderColor: "#548478" },
  screen: { flex: 1, backgroundColor: "#F5F5EF" },
  page: { padding: 22, paddingBottom: 36, gap: 18, width: "100%", maxWidth: 620, alignSelf: "center" },
  grow: { flex: 1, minWidth: 0 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 12 },
  brandMark: { width: 44, height: 44, borderRadius: 16, backgroundColor: "#17685D", alignItems: "center", justifyContent: "center" },
  brandLetter: { color: "#F3F4D7", fontSize: 34, fontWeight: "600", fontStyle: "italic", marginTop: -5 },
  brand: { color: "#193F36", fontSize: 27, fontWeight: "700", letterSpacing: -1 },
  eyebrow: { color: "#5E746B", fontSize: 9, fontWeight: "700", letterSpacing: 1.3, marginTop: 2 },
  badge: { backgroundColor: "#E5ECE3", paddingHorizontal: 10, paddingVertical: 7, borderRadius: 20 },
  badgeText: { color: "#355C4E", fontSize: 10, fontWeight: "700", letterSpacing: 1 },
  intro: { marginTop: 14, gap: 6 },
  title: { fontSize: 30, lineHeight: 37, fontWeight: "700", color: "#193F36", letterSpacing: -0.9 },
  subtitle: { color: "#5E746B", fontSize: 15, lineHeight: 23 },
  card: { backgroundColor: "#FFFFFF", borderRadius: 24, padding: 21, gap: 14, borderWidth: 1, borderColor: "#E2E8DE" },
  heading: { fontSize: 19, fontWeight: "700", color: "#193F36" },
  body: { color: "#5B7167", fontSize: 14, lineHeight: 21 },
  label: { color: "#5B7167", fontSize: 10, fontWeight: "700", letterSpacing: 1.2, marginTop: 5 },
  input: { backgroundColor: "#F7F9F5", color: "#193F36", borderWidth: 1, borderColor: "#D4DED2", paddingHorizontal: 15, paddingVertical: 14, borderRadius: 13, fontSize: 16, minHeight: 50 },
  caption: { color: "#5E746B", fontSize: 12, lineHeight: 18 },
  deviceCard: { padding: 22, borderRadius: 28, backgroundColor: "#15594F", gap: 14 },
  spread: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" },
  lightEyebrow: { color: "#D8E7DC", fontSize: 10, fontWeight: "700", letterSpacing: 1.8 },
  connectionBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 7, paddingHorizontal: 10, borderRadius: 20, backgroundColor: "#2E6B60" },
  dot: { width: 6, height: 6, borderRadius: 3 },
  connectionText: { color: "#F5FAF5", fontSize: 11, fontWeight: "600" },
  stateArea: { alignItems: "center", paddingVertical: 12, gap: 9 },
  stateRing: { width: 124, height: 124, borderRadius: 62, borderWidth: 1, borderColor: "#548478", alignItems: "center", justifyContent: "center", marginBottom: 9 },
  stateRingOn: { borderColor: "#C9E39D" },
  stateCore: { width: 98, height: 98, borderRadius: 49, backgroundColor: "#2E6B60", alignItems: "center", justifyContent: "center" },
  stateCoreOn: { backgroundColor: "#3B7862" },
  stateSymbol: { color: "#ECF2C6", fontSize: 27, fontWeight: "600", letterSpacing: 2 },
  deviceState: { color: "#FFFFFF", fontSize: 26, fontWeight: "600", textAlign: "center", letterSpacing: -0.5 },
  deviceHint: { color: "#D3E3DA", fontSize: 13, lineHeight: 20, textAlign: "center" },
  controlRow: { flexDirection: "row", gap: 10 },
  button: { minHeight: 50, borderRadius: 15, paddingVertical: 14, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
  buttonPrimary: { backgroundColor: "#17685D" },
  buttonSecondary: { backgroundColor: "#E9EFE6", borderWidth: 1, borderColor: "#D6E0D3" },
  buttonLight: { backgroundColor: "#EEF1CC" },
  buttonStop: { backgroundColor: "#F6E4DC" },
  buttonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700", textAlign: "center" },
  buttonTextDark: { color: "#193F36" },
  buttonTextStop: { color: "#7C3025" },
  buttonDisabled: { opacity: 0.45 },
  buttonPressed: { opacity: 0.8 },
  note: { paddingHorizontal: 7 },
  noteText: { color: "#5E746B", fontSize: 12, lineHeight: 18, textAlign: "center" },
  countBadge: { backgroundColor: "#F0F3E6", borderRadius: 16, paddingVertical: 8, paddingHorizontal: 16, alignItems: "center" },
  count: { fontSize: 25, fontWeight: "700", color: "#193F36" },
  success: { color: "#17685D", fontSize: 13, lineHeight: 20 },
  historyRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 13, borderTopWidth: 1, borderTopColor: "#E9EEE5" },
  historyTitle: { color: "#193F36", fontWeight: "600", fontSize: 13, marginBottom: 3 },
  historyStatus: { color: "#5E746B", fontSize: 11, maxWidth: 90 },
  activityRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  activityDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#7C9F8E", marginTop: 6 },
  log: { flex: 1, color: "#5E746B", fontSize: 12, lineHeight: 19 },
  errorBox: { backgroundColor: "#FAEAE4", padding: 15, borderRadius: 16, borderWidth: 1, borderColor: "#EBC8BC" },
  error: { color: "#8A3227", fontSize: 14, lineHeight: 21 },
  inline: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 9 },
  footer: { color: "#5E746B", fontSize: 9, fontWeight: "600", letterSpacing: 1.4, textAlign: "center", marginTop: 8 },
});
