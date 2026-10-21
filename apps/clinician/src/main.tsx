import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
type Patient = { id: string; name: string; email: string };
type Session = {
  id: string;
  device: string;
  mode: string;
  started: string;
  ended: string | null;
  lastReceived: string | null;
};
type Event = {
  id: string;
  state: string;
  source: string;
  reason: string;
  recorded: string;
  received: string;
};
function App() {
  const [token, setToken] = useState(""),
    [email, setEmail] = useState("clinician@fleure.local"),
    [password, setPassword] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]),
    [patient, setPatient] = useState(""),
    [sessions, setSessions] = useState<Session[]>([]),
    [selected, setSelected] = useState(""),
    [events, setEvents] = useState<Event[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function api(path: string, options: RequestInit = {}, auth = token) {
    const r = await fetch("/api" + path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${auth}`,
      },
    });
    if (!r.ok) {
      const b = await r.json();
      throw new Error(b.error || "Request failed");
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
  async function refresh(id = patient) {
    if (!id) return;
    setSessions(await api(`/sessions?patient=${encodeURIComponent(id)}`));
    if (selected) setEvents(await api(`/sessions/${selected}/events`));
  }
  return (
    <main>
      <h1>Fleure · Clinician demo</h1>
      <p>LED prototype · Uploaded observations, not a live device connection</p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!token ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void action(async () => {
              const b = await api("/login", {
                method: "POST",
                body: JSON.stringify({ email, password }),
              });
              if (b.user.role !== "clinician") {
                await api("/logout", { method: "POST" }, b.token);
                throw new Error("Use a clinician account");
              }
              const list = await api("/patients", {}, b.token);
              setToken(b.token);
              setPatients(list);
              setPassword("");
            });
          }}
        >
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button disabled={busy}>Sign in</button>
        </form>
      ) : (
        <>
          <button
            disabled={busy}
            onClick={() =>
              void action(async () => {
                await api("/logout", { method: "POST" });
                setToken("");
                setPatient("");
                setSelected("");
                setEvents([]);
                setSessions([]);
              })
            }
          >
            Sign out
          </button>
          <section>
            <label>
              Assigned patient
              <select
                disabled={busy}
                value={patient}
                onChange={(e) => {
                  const id = e.target.value;
                  setPatient(id);
                  setSelected("");
                  setEvents([]);
                  setSessions([]);
                  if (id)
                    void action(async () => {
                      setSessions(
                        await api(
                          `/sessions?patient=${encodeURIComponent(id)}`,
                        ),
                      );
                    });
                }}
              >
                <option value="">Choose a patient</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.email})
                  </option>
                ))}
              </select>
            </label>
            <button
              disabled={busy || !patient}
              onClick={() => void action(() => refresh())}
            >
              Refresh uploaded data
            </button>
          </section>
          <h2>Sessions</h2>
          {patient && !sessions.length && <p>No uploaded sessions.</p>}
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Started</th>
                  <th>Mode</th>
                  <th>Device</th>
                  <th>Ended</th>
                  <th>Last received</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <td>{new Date(s.started).toLocaleString()}</td>
                    <td>
                      <strong>{s.mode}</strong>
                    </td>
                    <td>{s.device}</td>
                    <td>
                      {s.ended
                        ? new Date(s.ended).toLocaleString()
                        : "No end uploaded"}
                    </td>
                    <td>
                      {s.lastReceived
                        ? new Date(s.lastReceived).toLocaleString()
                        : "No events"}
                    </td>
                    <td>
                      <button
                        disabled={busy}
                        onClick={() =>
                          void action(async () => {
                            setEvents(await api(`/sessions/${s.id}/events`));
                            setSelected(s.id);
                          })
                        }
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {selected && (
            <>
              <h2>Session events</h2>
              <p>
                Patient-phone reported data. “Unknown” means device state was
                not confirmed.
              </p>
              <div className="scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Recorded by phone</th>
                      <th>Received by server</th>
                      <th>State</th>
                      <th>Source</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((e) => (
                      <tr key={e.id}>
                        <td>{new Date(e.recorded).toLocaleString()}</td>
                        <td>{new Date(e.received).toLocaleString()}</td>
                        <td>{e.state}</td>
                        <td>{e.source}</td>
                        <td>{e.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
      {busy && <p role="status">Loading…</p>}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
