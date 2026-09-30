"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type Plan = { id?: string; name: string; description: string; difficulty: string; duration_weeks: number };
type Exercise = { id?: string; name: string; muscle_group: string; equipment: string; instructions?: string | null };
type PlanExercise = { id: string; day_number: number; sets: number; reps: number; rest_seconds: number; notes?: string | null; exercise: Exercise };
type SetLog = { set_number: number; weight_kg: string; reps: string; completed: boolean };
type User = { id: string; email?: string | null };

const demoPlans: Plan[] = [
  { name: "Full Body Starter", description: "Three full-body sessions designed for beginners.", difficulty: "beginner", duration_weeks: 4 },
  { name: "Push Pull Legs", description: "A classic split covering all major muscle groups.", difficulty: "intermediate", duration_weeks: 8 },
  { name: "Strength Builder", description: "Progressive compound-focused training plan.", difficulty: "advanced", duration_weeks: 8 },
];
const demoExercises: Exercise[] = [
  { name: "Barbell Bench Press", muscle_group: "Chest", equipment: "Barbell", instructions: "Lower the bar with control to mid chest, then press up." },
  { name: "Incline Dumbbell Press", muscle_group: "Chest", equipment: "Dumbbells" },
  { name: "Cable Fly", muscle_group: "Chest", equipment: "Cable" },
  { name: "Lat Pulldown", muscle_group: "Back", equipment: "Cable" },
  { name: "Seated Cable Row", muscle_group: "Back", equipment: "Cable" },
  { name: "Barbell Squat", muscle_group: "Legs", equipment: "Barbell" },
  { name: "Leg Press", muscle_group: "Legs", equipment: "Machine" },
  { name: "Romanian Deadlift", muscle_group: "Hamstrings", equipment: "Barbell" },
  { name: "Dumbbell Shoulder Press", muscle_group: "Shoulders", equipment: "Dumbbells" },
  { name: "Lateral Raise", muscle_group: "Shoulders", equipment: "Dumbbells" },
  { name: "Barbell Curl", muscle_group: "Biceps", equipment: "Barbell" },
  { name: "Triceps Pushdown", muscle_group: "Triceps", equipment: "Cable" },
  { name: "Plank", muscle_group: "Core", equipment: "Bodyweight" },
];

function makeLogs(items: PlanExercise[]) {
  return Object.fromEntries(items.map(x => [x.exercise.id || x.exercise.name, Array.from({ length: x.sets || 3 }, (_, i) => ({ set_number: i + 1, weight_kg: "", reps: String(x.reps || 10), completed: false }))]));
}
function formatTime(seconds: number) { return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`; }

export default function Home() {
  const [tab, setTab] = useState("home");
  const [plans, setPlans] = useState<Plan[]>(demoPlans);
  const [exercises, setExercises] = useState<Exercise[]>(demoExercises);
  const [user, setUser] = useState<User | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);
  const [search, setSearch] = useState("");
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [planExercises, setPlanExercises] = useState<PlanExercise[]>([]);
  const [selectedDay, setSelectedDay] = useState(1);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [activeExercises, setActiveExercises] = useState<PlanExercise[]>([]);
  const [activePlan, setActivePlan] = useState<Plan | null>(null);
  const [activeDay, setActiveDay] = useState(1);
  const [currentExercise, setCurrentExercise] = useState(0);
  const [logs, setLogs] = useState<Record<string, SetLog[]>>({});
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [saving, setSaving] = useState(false);
  const [progressWeight, setProgressWeight] = useState("");
  const [progressMessage, setProgressMessage] = useState("");
  const [history, setHistory] = useState<any[]>([]);
  const [toast, setToast] = useState("");
  const [installPrompt, setInstallPrompt] = useState<any>(null);

  useEffect(() => {
    const handler = (event: Event) => { event.preventDefault(); setInstallPrompt(event); };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  async function installApp() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    setInstallPrompt(null);
  }

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => setUser(data.user ? { id: data.user.id, email: data.user.email } : null));
    supabase.from("workout_plans").select("*").order("created_at").then(({ data }) => { if (data?.length) setPlans(data); });
    supabase.from("exercises").select("*").order("name").then(({ data }) => { if (data?.length) setExercises(data); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ? { id: session.user.id, email: session.user.email } : null));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !supabase) { setHistory([]); return; }
    supabase.from("workout_sessions").select("id,started_at,completed_at,plan:workout_plans(name)").eq("user_id", user.id).order("started_at", { ascending: false }).limit(10).then(({ data }) => setHistory(data || []));
  }, [user]);

  useEffect(() => {
    if (!startedAt) return;
    const tick = () => setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    tick(); const timer = window.setInterval(tick, 1000); return () => window.clearInterval(timer);
  }, [startedAt]);

  const filteredExercises = useMemo(() => exercises.filter(e => `${e.name} ${e.muscle_group} ${e.equipment}`.toLowerCase().includes(search.toLowerCase())), [exercises, search]);
  const current = activeExercises[currentExercise];
  const currentLogs = current ? logs[current.exercise.id || current.exercise.name] || [] : [];
  const completedSets = Object.values(logs).flat().filter(x => x.completed).length;
  const totalSets = Object.values(logs).flat().length;

  async function signIn() {
    if (!supabase || !email) return;
    setAuthMessage("Check your email for the magic link.");
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined } });
    if (error) setAuthMessage(error.message);
  }
  async function signOut() { if (supabase) await supabase.auth.signOut(); setUser(null); }

  async function openPlan(plan: Plan) {
    setSelectedPlan(plan); setSelectedDay(1); setLoadingPlan(true);
    if (supabase && plan.id) {
      const { data, error } = await supabase.from("workout_plan_exercises").select("id,day_number,sets,reps,rest_seconds,notes,exercise:exercises(id,name,muscle_group,equipment,instructions)").eq("plan_id", plan.id).order("day_number").order("id");
      setPlanExercises(error ? [] : ((data || []) as unknown as PlanExercise[]));
    } else {
      setPlanExercises(demoExercises.slice(0, 6).map((exercise, i) => ({ id: String(i), day_number: i < 3 ? 1 : 2, sets: 3, reps: 10, rest_seconds: 90, exercise })));
    }
    setLoadingPlan(false);
  }

  function startPlanWorkout() {
    const dayItems = planExercises.filter(x => x.day_number === selectedDay);
    if (!dayItems.length) { setToast("No exercises found for this day"); return; }
    setActiveExercises(dayItems); setActivePlan(selectedPlan); setActiveDay(selectedDay); setLogs(makeLogs(dayItems)); setCurrentExercise(0); setStartedAt(Date.now()); setElapsed(0); setSelectedPlan(null); setTab("workout"); setToast("Workout started");
  }

  function startDefaultWorkout() {
    const fallback = planExercises.length ? planExercises.filter(x => x.day_number === selectedDay) : [];
    if (fallback.length) { setActiveExercises(fallback); setActivePlan(selectedPlan); setActiveDay(selectedDay); setLogs(makeLogs(fallback)); }
    else {
      const items = exercises.slice(0, 5).map((exercise, i) => ({ id: String(i), day_number: 1, sets: 3, reps: 10, rest_seconds: 90, exercise }));
      setActiveExercises(items); setActivePlan(null); setActiveDay(1); setLogs(makeLogs(items));
    }
    setCurrentExercise(0); setStartedAt(Date.now()); setElapsed(0); setTab("workout");
  }

  function updateSet(exerciseKey: string, index: number, field: "weight_kg" | "reps", value: string) {
    setLogs(prev => ({ ...prev, [exerciseKey]: (prev[exerciseKey] || []).map((s, i) => i === index ? { ...s, [field]: value } : s) }));
  }
  function toggleSet(exerciseKey: string, index: number) {
    setLogs(prev => ({ ...prev, [exerciseKey]: (prev[exerciseKey] || []).map((s, i) => i === index ? { ...s, completed: !s.completed } : s) }));
  }

  async function finishWorkout() {
    if (!activeExercises.length) return;
    if (!supabase || !user) { setToast("Workout completed in demo mode"); setStartedAt(null); setTab("home"); return; }
    setSaving(true);
    const { data: session, error } = await supabase.from("workout_sessions").insert({ user_id: user.id, plan_id: activePlan?.id || null, started_at: new Date(startedAt ?? Date.now()).toISOString(), completed_at: new Date().toISOString() }).select("id").single();
    if (error || !session) { setToast(error?.message || "Could not save workout"); setSaving(false); return; }
    const rows = activeExercises.flatMap(item => (logs[item.exercise.id || item.exercise.name] || []).filter(s => s.completed && s.reps).map(s => ({ session_id: session.id, exercise_id: item.exercise.id, set_number: s.set_number, reps: Number(s.reps), weight_kg: s.weight_kg ? Number(s.weight_kg) : null, completed: true })));
    if (rows.length) { const { error: setsError } = await supabase.from("workout_sets").insert(rows); if (setsError) setToast(setsError.message); }
    setSaving(false); setStartedAt(null); setActiveExercises([]); setLogs({}); setCurrentExercise(0); setToast("Workout saved ✓"); setTab("home");
    const { data } = await supabase.from("workout_sessions").select("id,started_at,completed_at,plan:workout_plans(name)").eq("user_id", user.id).order("started_at", { ascending: false }).limit(10); setHistory(data || []);
  }

  async function saveProgress() {
    if (!supabase || !user || !progressWeight) { setProgressMessage(user ? "Enter your weight first." : "Log in first to save progress."); return; }
    const { error } = await supabase.from("progress_entries").insert({ user_id: user.id, weight_kg: Number(progressWeight), recorded_at: new Date().toISOString() });
    setProgressMessage(error ? error.message : "Weight saved successfully."); if (!error) setProgressWeight("");
  }

  return <main className="app-shell">
    <header className="topbar"><div><div className="brand">GYM<span>APP</span></div><div className="sub">Train. Track. Progress.</div></div><div className="top-actions">{installPrompt && <button className="install-btn" onClick={installApp}>Install</button>}{user ? <button className="avatar" onClick={signOut}>✓</button> : <button className="login-btn" onClick={() => setAuthOpen(true)}>Log in</button>}</div></header>

    {tab === "home" && <section className="content">
      <div className="hero-card"><div><span className="kicker">TODAY&apos;S WORKOUT</span><h1>{activePlan?.name || "Push Day"}</h1><p>{activeExercises.length ? `${activeExercises.length} exercises · Day ${activeDay}` : "Chest · Shoulders · Triceps"}</p><button className="primary" onClick={startDefaultWorkout}>Start Workout →</button></div><div className="hero-stat"><strong>{startedAt ? formatTime(elapsed) : "45"}</strong><span>{startedAt ? "TIME" : "MIN"}</span></div></div>
      <div className="section-head"><h2>Quick Stats</h2><span>Live data</span></div><div className="stats"><div><strong>{history.length || 0}</strong><span>Recent workouts</span></div><div><strong>{completedSets}</strong><span>Sets completed</span></div><div><strong>{user ? "SYNC" : "DEMO"}</strong><span>Account status</span></div></div>
      <div className="section-head"><h2>Your Plans</h2><button onClick={() => setTab("plans")}>View all</button></div><div className="plan-row">{plans.slice(0,2).map(p => <button className="plan-card clickable" key={p.name} onClick={() => openPlan(p)}><span>{p.difficulty}</span><h3>{p.name}</h3><p>{p.duration_weeks} weeks</p></button>)}</div>
      <div className="section-head"><h2>Account</h2><span>{user ? user.email : "Demo mode"}</span></div>{!user && <button className="outline full" onClick={() => setAuthOpen(true)}>Connect your account</button>}
    </section>}

    {tab === "plans" && <section className="content"><div className="page-title"><span className="kicker">PROGRAMS</span><h1>Workout Plans</h1></div><div className="stack">{plans.map(p => <button className="list-card clickable" key={p.name} onClick={() => openPlan(p)}><div className="icon">▦</div><div className="grow"><span className="muted">{p.difficulty}</span><h3>{p.name}</h3><p>{p.duration_weeks} weeks · {p.description}</p></div><span className="arrow">→</span></button>)}</div></section>}

    {tab === "exercises" && <section className="content"><div className="page-title"><span className="kicker">LIBRARY</span><h1>Exercises</h1></div><div className="search">⌕ <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search exercises..." /></div><div className="stack">{filteredExercises.map(e => <button className="list-card compact clickable" key={e.name} onClick={() => setSelectedExercise(e)}><div className="exercise-dot">{e.name[0]}</div><div className="grow"><h3>{e.name}</h3><p>{e.muscle_group} · {e.equipment}</p></div><span className="chevron">›</span></button>)}</div></section>}

    {tab === "workout" && <section className="content"><div className="page-title"><span className="kicker">ACTIVE SESSION</span><h1>{activePlan?.name || "Workout"}</h1></div>{!activeExercises.length ? <div className="workout-card"><h2>No active workout</h2><p>Choose a plan or start a demo workout from Home.</p><button className="primary" onClick={startDefaultWorkout}>Start Workout</button></div> : <><div className="progress-line"><span style={{ width: `${((currentExercise + 1) / activeExercises.length) * 100}%` }} /></div><div className="session-info"><span>Exercise {currentExercise + 1} / {activeExercises.length} · {completedSets}/{totalSets} sets</span><strong>{formatTime(elapsed)}</strong></div><article className="workout-card"><span className="muted">{current.exercise.muscle_group.toUpperCase()}</span><h2>{current.exercise.name}</h2><p className="exercise-note">{current.notes || current.exercise.equipment} · {current.rest_seconds}s rest · Target {current.reps} reps</p><div className="set-grid"><div>SET</div><div>KG</div><div>REPS</div><div>DONE</div>{currentLogs.map((s, i) => <div className="set-row" key={s.set_number}><span>{s.set_number}</span><input value={s.weight_kg} onChange={e => updateSet(current.exercise.id || current.exercise.name, i, "weight_kg", e.target.value)} placeholder="60" inputMode="decimal" /><input value={s.reps} onChange={e => updateSet(current.exercise.id || current.exercise.name, i, "reps", e.target.value)} inputMode="numeric" /><button className={s.completed ? "check done" : "check"} onClick={() => toggleSet(current.exercise.id || current.exercise.name, i)}>✓</button></div>)}</div></article><div className="workout-actions"><button className="outline" disabled={currentExercise === 0} onClick={() => setCurrentExercise(Math.max(0, currentExercise - 1))}>← Previous</button>{currentExercise < activeExercises.length - 1 ? <button className="primary" onClick={() => setCurrentExercise(currentExercise + 1)}>Next Exercise →</button> : <button className="primary" onClick={finishWorkout}>{saving ? "Saving..." : "Finish Workout ✓"}</button>}</div><button className="text-danger" onClick={() => { setStartedAt(null); setActiveExercises([]); setLogs({}); setTab("home"); }}>Cancel workout</button></>}</section>}

    {tab === "progress" && <section className="content"><div className="page-title"><span className="kicker">YOUR DATA</span><h1>Progress</h1></div><div className="chart-card"><div className="section-head"><h2>Workout History</h2><span>{user ? "Saved sessions" : "Sign in to save"}</span></div>{history.length ? <div className="history-list">{history.map((h: any) => <div className="history-item" key={h.id}><div><strong>{h.plan?.name || "Custom Workout"}</strong><span>{new Date(h.started_at).toLocaleDateString()}</span></div><b>✓</b></div>)}</div> : <p className="muted">No saved workouts yet. Finish a workout while logged in to see it here.</p>}</div><div className="stats"><div><strong>{history.length}</strong><span>Total shown</span></div><div><strong>{user ? "ON" : "OFF"}</strong><span>Cloud sync</span></div><div><strong>KG</strong><span>Body weight</span></div></div><div className="workout-card progress-form"><span className="kicker">BODY WEIGHT</span><h2>Log today&apos;s weight</h2><div className="weight-row"><input value={progressWeight} onChange={e => setProgressWeight(e.target.value)} placeholder="78.4" inputMode="decimal" /><span>kg</span><button className="primary" onClick={saveProgress}>Save</button></div>{progressMessage && <div className="auth-message">{progressMessage}</div>}</div></section>}

    {toast && <div className="toast" onClick={() => setToast("")}>{toast}</div>}
    <nav className="bottom-nav">{[["home","⌂","Home"],["plans","▣","Plans"],["workout","＋","Workout"],["exercises","◈","Exercises"],["progress","↗","Progress"]].map(([id,icon,label]) => <button className={tab === id ? "active" : ""} onClick={() => setTab(id)} key={id}>{icon}<span>{label}</span></button>)}</nav>

    {selectedPlan && <div className="modal-backdrop" onClick={() => setSelectedPlan(null)}><div className="modal plan-modal" onClick={e => e.stopPropagation()}><button className="modal-close" onClick={() => setSelectedPlan(null)}>×</button><span className="kicker">{selectedPlan.difficulty}</span><h2>{selectedPlan.name}</h2><p>{selectedPlan.description}</p><div className="day-tabs">{Array.from(new Set(planExercises.map(x => x.day_number))).map(day => <button className={selectedDay === day ? "day-active" : ""} onClick={() => setSelectedDay(day)} key={day}>Day {day}</button>)}</div>{loadingPlan ? <p>Loading plan...</p> : <div className="plan-exercise-list">{planExercises.filter(x => x.day_number === selectedDay).map(x => <div className="mini-exercise" key={x.id}><div><strong>{x.exercise?.name}</strong><span>{x.exercise?.muscle_group} · {x.exercise?.equipment}</span></div><b>{x.sets} × {x.reps}</b></div>)}</div>}<button className="primary full" onClick={startPlanWorkout}>Start this day →</button></div></div>}
    {authOpen && <div className="modal-backdrop" onClick={() => setAuthOpen(false)}><div className="modal" onClick={e => e.stopPropagation()}><button className="modal-close" onClick={() => setAuthOpen(false)}>×</button><span className="kicker">ACCOUNT</span><h2>Sign in</h2><p>We&apos;ll send a secure magic link to your email.</p><input className="auth-input" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" type="email"/><button className="primary full" onClick={signIn}>Send magic link</button>{authMessage && <div className="auth-message">{authMessage}</div>}</div></div>}
    {selectedExercise && <div className="modal-backdrop" onClick={() => setSelectedExercise(null)}><div className="modal" onClick={e => e.stopPropagation()}><button className="modal-close" onClick={() => setSelectedExercise(null)}>×</button><span className="kicker">{selectedExercise.muscle_group}</span><h2>{selectedExercise.name}</h2><p>{selectedExercise.equipment}</p><p>{selectedExercise.instructions || "Perform the movement with controlled tempo and proper form."}</p><button className="primary full" onClick={() => { setSelectedExercise(null); startDefaultWorkout(); }}>Add to workout</button></div></div>}
  </main>;
}
