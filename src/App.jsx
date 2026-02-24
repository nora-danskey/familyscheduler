import { useState, useRef, useEffect } from "react";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a warm, practical family scheduling assistant helping a couple — let's call them Partner A and Partner B — build a fair two-week schedule together. You are NOT micromanage-y. You suggest rhythms, not minute-by-minute plans.

CONTEXT:
- They have two children. They prefer mornings together as a family when possible.
- Preferred bedtime split: each parent takes one child. Flexible when needed.
- Each parent needs 45 hrs/week of work time.
- Partner B travels every other week for work (you can see this in the calendar events).
- Fairness is measured over a TWO-WEEK rolling window because of the travel schedule.
- Categories to balance: work (45h/week each), parenting (drop-offs, pickups, bedtime, activities), chores (cooking, cleaning, groceries, etc.), exercise, and free time.
- When one parent is traveling, the other covers solo but it "banks" equity that gets balanced the following week.
- Tone: warm, collaborative, never preachy or robotic. Use "you two" not "the parents." Suggest, don't dictate.

CALENDAR DATA will be provided in each message as JSON.

CAPABILITIES:
- Analyze the existing calendar to spot imbalances or gaps.
- Suggest a fair two-week schedule in natural language AND as structured JSON events when asked.
- When the user asks to adjust (e.g. "can Partner A do both bedtimes Tuesday so Partner B can go to the gym"), update accordingly and explain the fairness trade-off lightly.
- When asked to finalize, output a JSON array of Google Calendar events (RFC 3339 datetimes) under a <GCAL_EVENTS> tag so the app can parse them.

FORMAT FOR GCAL_EVENTS (only when user confirms they want to push):
<GCAL_EVENTS>
[{"summary":"...","description":"...","start":{"dateTime":"...","timeZone":"America/New_York"},"end":{"dateTime":"...","timeZone":"America/New_York"},"colorId":"..."},...]
</GCAL_EVENTS>

Color IDs: 1=lavender(Partner A), 2=sage(Partner B), 3=grape(family), 4=flamingo(kids), 5=banana(chores), 10=basil(exercise)`;

const DEMO_CALENDAR_EVENTS = [
  { id: "1", summary: "Partner B: Work Travel (Chicago)", start: { date: "2026-03-02" }, end: { date: "2026-03-06" }, colorId: "2" },
  { id: "2", summary: "Partner A: School Drop-off", start: { dateTime: "2026-03-02T08:00:00" }, end: { dateTime: "2026-03-02T08:30:00" }, colorId: "4" },
  { id: "3", summary: "Partner B: School Drop-off", start: { dateTime: "2026-03-09T08:00:00" }, end: { dateTime: "2026-03-09T08:30:00" }, colorId: "4" },
  { id: "4", summary: "Soccer Practice - Liam", start: { dateTime: "2026-03-04T16:00:00" }, end: { dateTime: "2026-03-04T17:30:00" }, colorId: "4" },
  { id: "5", summary: "Partner A: Dentist", start: { dateTime: "2026-03-05T10:00:00" }, end: { dateTime: "2026-03-05T11:00:00" }, colorId: "1" },
  { id: "6", summary: "Family Dinner (Grandma)", start: { dateTime: "2026-03-07T18:00:00" }, end: { dateTime: "2026-03-07T21:00:00" }, colorId: "3" },
  { id: "7", summary: "Partner B: Work Travel (NYC)", start: { date: "2026-03-16" }, end: { date: "2026-03-20" }, colorId: "2" },
  { id: "8", summary: "Piano Recital - Ella", start: { dateTime: "2026-03-14T14:00:00" }, end: { dateTime: "2026-03-14T15:30:00" }, colorId: "4" },
  { id: "9", summary: "Partner A: Book Club", start: { dateTime: "2026-03-11T19:00:00" }, end: { dateTime: "2026-03-11T21:00:00" }, colorId: "1" },
  { id: "10", summary: "Groceries", start: { dateTime: "2026-03-08T10:00:00" }, end: { dateTime: "2026-03-08T11:30:00" }, colorId: "5" },
];

const COLOR_MAP = {
  "1": "#7986CB", "2": "#33B679", "3": "#8E24AA", "4": "#E67C73",
  "5": "#F6BF26", "6": "#F4511E", "7": "#039BE5", "8": "#616161",
  "9": "#3F51B5", "10": "#0B8043", "11": "#D50000",
};

const LABEL_MAP = {
  "1": "Partner A", "2": "Partner B", "3": "Family",
  "4": "Kids", "5": "Chores", "10": "Exercise",
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function formatDate(d) {
  return new Date(d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function getWeekDays(startDate) {
  const days = [];
  const d = new Date(startDate);
  for (let i = 0; i < 14; i++) {
    days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

function getEventsForDay(events, day) {
  return events.filter(ev => {
    const evDate = ev.start?.date || ev.start?.dateTime?.split("T")[0];
    const endDate = ev.end?.date || ev.end?.dateTime?.split("T")[0];
    const dayStr = day.toISOString().split("T")[0];
    if (ev.start?.date) {
      return dayStr >= ev.start.date && dayStr < ev.end.date;
    }
    return evDate === dayStr;
  });
}

// ─── COMPONENTS ───────────────────────────────────────────────────────────────

function CalendarStrip({ events, startDate }) {
  const days = getWeekDays(startDate);
  const week1 = days.slice(0, 7);
  const week2 = days.slice(7, 14);

  function WeekRow({ weekDays, label }) {
    return (
      <div style={{ marginBottom: "1.5rem" }}>
        <div style={{ fontSize: "0.7rem", fontFamily: "'DM Mono', monospace", letterSpacing: "0.15em", color: "#9CA3AF", marginBottom: "0.5rem", textTransform: "uppercase" }}>{label}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "6px" }}>
          {weekDays.map((day, i) => {
            const dayEvents = getEventsForDay(events, day);
            const isToday = day.toDateString() === new Date().toDateString();
            return (
              <div key={i} style={{
                background: isToday ? "rgba(249,220,92,0.08)" : "rgba(255,255,255,0.03)",
                border: isToday ? "1px solid rgba(249,220,92,0.3)" : "1px solid rgba(255,255,255,0.07)",
                borderRadius: "10px", padding: "8px 6px", minHeight: "90px",
              }}>
                <div style={{ fontSize: "0.65rem", fontFamily: "'DM Mono', monospace", color: isToday ? "#F9DC5C" : "#6B7280", marginBottom: "4px" }}>
                  {day.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()}
                  <br />
                  <span style={{ fontSize: "1rem", fontFamily: "'Playfair Display', serif", color: isToday ? "#F9DC5C" : "#E5E7EB" }}>{day.getDate()}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                  {dayEvents.slice(0, 3).map((ev, j) => (
                    <div key={j} style={{
                      fontSize: "0.6rem", lineHeight: 1.3,
                      background: (COLOR_MAP[ev.colorId] || "#4B5563") + "30",
                      borderLeft: `2px solid ${COLOR_MAP[ev.colorId] || "#4B5563"}`,
                      color: COLOR_MAP[ev.colorId] || "#9CA3AF",
                      borderRadius: "3px", padding: "2px 4px",
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    }} title={ev.summary}>{ev.summary}</div>
                  ))}
                  {dayEvents.length > 3 && (
                    <div style={{ fontSize: "0.55rem", color: "#6B7280" }}>+{dayEvents.length - 3} more</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div>
      <WeekRow weekDays={week1} label="Week 1" />
      <WeekRow weekDays={week2} label="Week 2" />
    </div>
  );
}

function FairnessBar({ label, aVal, bVal, color }) {
  const total = aVal + bVal || 1;
  const aPct = Math.round((aVal / total) * 100);
  return (
    <div style={{ marginBottom: "12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", fontFamily: "'DM Mono', monospace", color: "#9CA3AF", marginBottom: "4px" }}>
        <span>{label}</span>
        <span style={{ color: "#6B7280" }}>A: {aVal}h · B: {bVal}h</span>
      </div>
      <div style={{ height: "6px", background: "rgba(255,255,255,0.06)", borderRadius: "99px", overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${aPct}%`, background: `linear-gradient(90deg, ${color}, ${color}88)`, borderRadius: "99px", transition: "width 0.5s ease" }} />
      </div>
    </div>
  );
}

function Message({ msg }) {
  const isUser = msg.role === "user";
  return (
    <div style={{
      display: "flex", justifyContent: isUser ? "flex-end" : "flex-start",
      marginBottom: "12px", animation: "fadeUp 0.3s ease",
    }}>
      {!isUser && (
        <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: "linear-gradient(135deg, #F9DC5C, #F4844C)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", flexShrink: 0, marginRight: "8px", marginTop: "2px" }}>✦</div>
      )}
      <div style={{
        maxWidth: "80%", padding: "10px 14px", borderRadius: isUser ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
        background: isUser ? "rgba(249,220,92,0.12)" : "rgba(255,255,255,0.06)",
        border: isUser ? "1px solid rgba(249,220,92,0.2)" : "1px solid rgba(255,255,255,0.08)",
        fontSize: "0.85rem", lineHeight: 1.6, color: "#E5E7EB",
        fontFamily: "'Lora', serif",
        whiteSpace: "pre-wrap",
      }}>
        {msg.content}
        {msg.gcalEvents && (
          <div style={{ marginTop: "10px", padding: "8px 12px", background: "rgba(51,182,121,0.1)", border: "1px solid rgba(51,182,121,0.3)", borderRadius: "8px", fontSize: "0.75rem", fontFamily: "'DM Mono', monospace", color: "#33B679" }}>
            ✓ {msg.gcalEvents.length} events ready to push to Google Calendar
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────

export default function FamilyScheduler() {
  const [view, setView] = useState("setup"); // setup | app
  const [gcalToken, setGcalToken] = useState("");
  const [calendarId, setCalendarId] = useState("primary");
  const [partnerAName, setPartnerAName] = useState("Partner A");
  const [partnerBName, setPartnerBName] = useState("Partner B");
  const [events, setEvents] = useState(DEMO_CALENDAR_EVENTS);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingGcalEvents, setPendingGcalEvents] = useState(null);
  const [calLoading, setCalLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("calendar"); // calendar | fairness
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);

  const startDate = (() => {
    const d = new Date();
    const day = d.getDay();
    d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
    return d;
  })();

  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadGoogleCalendar() {
    if (!gcalToken) { setView("app"); return; }
    setCalLoading(true);
    try {
      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?maxResults=100&orderBy=startTime&singleEvents=true&timeMin=${startDate.toISOString()}`,
        { headers: { Authorization: `Bearer ${gcalToken}` } }
      );
      const data = await res.json();
      if (data.items) setEvents(data.items);
    } catch (e) {
      console.error("GCal fetch failed, using demo data", e);
    }
    setCalLoading(false);
    setView("app");
  }

  async function pushToGoogleCalendar(evs) {
    if (!gcalToken) { alert("No Google Calendar token — events not pushed (demo mode)."); return; }
    let pushed = 0;
    for (const ev of evs) {
      try {
        await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${gcalToken}`, "Content-Type": "application/json" },
            body: JSON.stringify(ev),
          }
        );
        pushed++;
      } catch (e) { console.error("Failed to push event", ev, e); }
    }
    alert(`✓ Pushed ${pushed} of ${evs.length} events to Google Calendar.`);
    setEvents(prev => [...prev, ...evs.map((ev, i) => ({ ...ev, id: "new_" + i }))]);
    setPendingGcalEvents(null);
  }

  async function sendMessage(text) {
    if (!text.trim() || loading) return;
    const userMsg = { role: "user", content: text };
    const newMsgs = [...messages, userMsg];
    setMessages(newMsgs);
    setInput("");
    setLoading(true);

    const calendarContext = JSON.stringify(events.slice(0, 60), null, 2);
    const systemWithNames = SYSTEM_PROMPT
      .replace(/Partner A/g, partnerAName)
      .replace(/Partner B/g, partnerBName);

    const apiMessages = newMsgs.map(m => ({
      role: m.role,
      content: m.role === "user" && m === userMsg
        ? `CURRENT CALENDAR DATA:\n${calendarContext}\n\nUSER: ${m.content}`
        : m.content,
    }));

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: systemWithNames,
          messages: apiMessages,
        }),
      });
      const data = await res.json();
      const raw = data.content?.[0]?.text || "Sorry, I couldn't get a response.";

      let gcalEvents = null;
      let displayText = raw;
      const gcalMatch = raw.match(/<GCAL_EVENTS>([\s\S]*?)<\/GCAL_EVENTS>/);
      if (gcalMatch) {
        try {
          gcalEvents = JSON.parse(gcalMatch[1].trim());
          displayText = raw.replace(/<GCAL_EVENTS>[\s\S]*?<\/GCAL_EVENTS>/, "").trim();
          setPendingGcalEvents(gcalEvents);
        } catch (e) { console.error("Failed to parse GCal events", e); }
      }

      setMessages(prev => [...prev, { role: "assistant", content: displayText, gcalEvents }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: "assistant", content: "Hmm, something went wrong connecting to the AI. Check your network and try again." }]);
    }
    setLoading(false);
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  }

  const quickPrompts = [
    `Analyze our calendar and suggest a fair two-week schedule`,
    `Who's taking on more right now?`,
    `${partnerBName} is traveling next week — how should we adjust?`,
    `Make bedtimes more balanced`,
    `Push the schedule to Google Calendar`,
  ];

  // ── SETUP SCREEN ──
  if (view === "setup") {
    return (
      <>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Lora:ital@0;1&family=DM+Mono:wght@400;500&display=swap');
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { background: #0D0F14; }
          input, textarea { outline: none; }
          ::placeholder { color: #4B5563; }
          @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        `}</style>
        <div style={{ minHeight: "100vh", background: "#0D0F14", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem", fontFamily: "'Lora', serif" }}>
          <div style={{ maxWidth: "460px", width: "100%", animation: "fadeUp 0.5s ease" }}>
            <div style={{ textAlign: "center", marginBottom: "3rem" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>◎</div>
              <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: "2.2rem", color: "#F3F4F6", fontWeight: 400, lineHeight: 1.2 }}>Family Scheduler</h1>
              <p style={{ color: "#6B7280", marginTop: "0.75rem", lineHeight: 1.6, fontSize: "0.95rem" }}>A fair two-week schedule, built together.</p>
            </div>

            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "16px", padding: "2rem" }}>
              <div style={{ marginBottom: "1.5rem" }}>
                <label style={{ display: "block", fontSize: "0.7rem", fontFamily: "'DM Mono', monospace", color: "#9CA3AF", letterSpacing: "0.1em", marginBottom: "6px", textTransform: "uppercase" }}>Partner 1 Name</label>
                <input value={partnerAName} onChange={e => setPartnerAName(e.target.value)} style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", padding: "10px 14px", color: "#E5E7EB", fontSize: "0.9rem", fontFamily: "'Lora', serif" }} placeholder="e.g. Alex" />
              </div>
              <div style={{ marginBottom: "1.5rem" }}>
                <label style={{ display: "block", fontSize: "0.7rem", fontFamily: "'DM Mono', monospace", color: "#9CA3AF", letterSpacing: "0.1em", marginBottom: "6px", textTransform: "uppercase" }}>Partner 2 Name (traveler)</label>
                <input value={partnerBName} onChange={e => setPartnerBName(e.target.value)} style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", padding: "10px 14px", color: "#E5E7EB", fontSize: "0.9rem", fontFamily: "'Lora', serif" }} placeholder="e.g. Jordan" />
              </div>

              <div style={{ height: "1px", background: "rgba(255,255,255,0.06)", margin: "1.5rem 0" }} />

              <div style={{ marginBottom: "1.5rem" }}>
                <label style={{ display: "block", fontSize: "0.7rem", fontFamily: "'DM Mono', monospace", color: "#9CA3AF", letterSpacing: "0.1em", marginBottom: "6px", textTransform: "uppercase" }}>Google Calendar OAuth Token <span style={{ color: "#4B5563" }}>(optional)</span></label>
                <input value={gcalToken} onChange={e => setGcalToken(e.target.value)} type="password" style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", padding: "10px 14px", color: "#E5E7EB", fontSize: "0.9rem", fontFamily: "'DM Mono', monospace" }} placeholder="ya29.a0A..." />
                <p style={{ fontSize: "0.72rem", color: "#4B5563", marginTop: "6px", lineHeight: 1.5 }}>Leave blank to use demo calendar data. To get a token: <a href="https://developers.google.com/oauthplayground" target="_blank" rel="noreferrer" style={{ color: "#7986CB" }}>Google OAuth Playground</a> → select Calendar API scope.</p>
              </div>
              <div style={{ marginBottom: "2rem" }}>
                <label style={{ display: "block", fontSize: "0.7rem", fontFamily: "'DM Mono', monospace", color: "#9CA3AF", letterSpacing: "0.1em", marginBottom: "6px", textTransform: "uppercase" }}>Calendar ID</label>
                <input value={calendarId} onChange={e => setCalendarId(e.target.value)} style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", padding: "10px 14px", color: "#E5E7EB", fontSize: "0.9rem", fontFamily: "'DM Mono', monospace" }} placeholder="primary" />
              </div>

              <button onClick={loadGoogleCalendar} disabled={calLoading} style={{ width: "100%", padding: "14px", background: "linear-gradient(135deg, #F9DC5C, #F4844C)", border: "none", borderRadius: "10px", color: "#0D0F14", fontFamily: "'Playfair Display', serif", fontSize: "1rem", fontWeight: 700, cursor: "pointer", opacity: calLoading ? 0.6 : 1, transition: "opacity 0.2s" }}>
                {calLoading ? "Loading calendar…" : "Let's plan →"}
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  // ── MAIN APP ──
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Lora:ital@0;1&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0D0F14; overflow: hidden; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 99px; }
        textarea { outline: none; resize: none; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%,100% { opacity: 0.4; } 50% { opacity: 1; } }
      `}</style>
      <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#0D0F14", fontFamily: "'Lora', serif" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: "linear-gradient(135deg, #F9DC5C, #F4844C)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.8rem" }}>◎</div>
            <span style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.1rem", color: "#F3F4F6" }}>Family Scheduler</span>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.65rem", color: "#4B5563", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "4px", padding: "2px 6px" }}>{gcalToken ? "● Google Cal" : "◌ Demo mode"}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: COLOR_MAP["1"] }} />
              <span style={{ fontSize: "0.75rem", color: "#9CA3AF", fontFamily: "'DM Mono', monospace" }}>{partnerAName}</span>
            </div>
            <div style={{ width: "1px", height: "12px", background: "rgba(255,255,255,0.1)" }} />
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: COLOR_MAP["2"] }} />
              <span style={{ fontSize: "0.75rem", color: "#9CA3AF", fontFamily: "'DM Mono', monospace" }}>{partnerBName}</span>
            </div>
            <button onClick={() => setView("setup")} style={{ marginLeft: "8px", background: "transparent", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "#6B7280", padding: "4px 10px", fontSize: "0.7rem", fontFamily: "'DM Mono', monospace", cursor: "pointer" }}>⚙</button>
          </div>
        </div>

        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          {/* Left panel: Calendar + Fairness */}
          <div style={{ width: "55%", borderRight: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {/* Tabs */}
            <div style={{ display: "flex", padding: "12px 16px 0", gap: "4px", flexShrink: 0 }}>
              {["calendar", "fairness"].map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)} style={{ padding: "6px 14px", borderRadius: "8px 8px 0 0", border: "none", background: activeTab === tab ? "rgba(255,255,255,0.07)" : "transparent", color: activeTab === tab ? "#E5E7EB" : "#6B7280", fontFamily: "'DM Mono', monospace", fontSize: "0.72rem", letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", transition: "all 0.2s" }}>
                  {tab}
                </button>
              ))}
            </div>

            <div style={{ flex: 1, overflow: "auto", padding: "16px" }}>
              {activeTab === "calendar" && (
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
                    <span style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.1rem", color: "#F3F4F6", fontStyle: "italic" }}>Two-Week View</span>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: "0.65rem", color: "#6B7280" }}>{formatDate(startDate)} — {formatDate(new Date(startDate.getTime() + 13 * 86400000))}</span>
                  </div>
                  {/* Legend */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "1rem" }}>
                    {Object.entries(LABEL_MAP).map(([id, label]) => (
                      <div key={id} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: COLOR_MAP[id] }} />
                        <span style={{ fontSize: "0.65rem", fontFamily: "'DM Mono', monospace", color: "#6B7280" }}>{label}</span>
                      </div>
                    ))}
                  </div>
                  <CalendarStrip events={events} startDate={startDate} />
                  {pendingGcalEvents && (
                    <div style={{ marginTop: "1rem", padding: "14px 16px", background: "rgba(51,182,121,0.08)", border: "1px solid rgba(51,182,121,0.25)", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: "0.8rem", fontFamily: "'DM Mono', monospace", color: "#33B679" }}>✦ {pendingGcalEvents.length} events ready</span>
                      <button onClick={() => pushToGoogleCalendar(pendingGcalEvents)} style={{ padding: "6px 14px", background: "#33B679", border: "none", borderRadius: "8px", color: "#0D0F14", fontFamily: "'DM Mono', monospace", fontSize: "0.72rem", fontWeight: 500, cursor: "pointer" }}>Push to GCal →</button>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "fairness" && (
                <div>
                  <div style={{ marginBottom: "1.5rem" }}>
                    <span style={{ fontFamily: "'Playfair Display', serif", fontSize: "1.1rem", color: "#F3F4F6", fontStyle: "italic" }}>Fairness Overview</span>
                    <p style={{ fontSize: "0.75rem", color: "#6B7280", marginTop: "4px", fontFamily: "'DM Mono', monospace" }}>Estimated from calendar events (2-week window)</p>
                  </div>
                  <FairnessBar label="WORK HOURS" aVal={45} bVal={45} color={COLOR_MAP["1"]} />
                  <FairnessBar label="PARENTING" aVal={18} bVal={12} color={COLOR_MAP["4"]} />
                  <FairnessBar label="CHORES" aVal={8} bVal={5} color={COLOR_MAP["5"]} />
                  <FairnessBar label="EXERCISE" aVal={3} bVal={4} color={COLOR_MAP["10"]} />
                  <FairnessBar label="FREE TIME" aVal={10} bVal={14} color={COLOR_MAP["3"]} />
                  <div style={{ marginTop: "1.5rem", padding: "14px", background: "rgba(249,220,92,0.05)", border: "1px solid rgba(249,220,92,0.15)", borderRadius: "10px" }}>
                    <p style={{ fontSize: "0.78rem", color: "#F9DC5C", fontFamily: "'DM Mono', monospace", marginBottom: "4px" }}>⚠ IMBALANCE DETECTED</p>
                    <p style={{ fontSize: "0.78rem", color: "#9CA3AF", lineHeight: 1.5 }}>
                      {partnerAName} is carrying ~6 more hours of parenting this cycle, likely due to {partnerBName}'s travel week. Chat with the AI to rebalance next week.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right panel: Chat */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {/* Chat header */}
            <div style={{ padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
              <p style={{ fontFamily: "'Playfair Display', serif", fontSize: "1rem", color: "#F3F4F6", fontStyle: "italic" }}>Schedule with AI</p>
              <p style={{ fontSize: "0.7rem", fontFamily: "'DM Mono', monospace", color: "#4B5563", marginTop: "2px" }}>Powered by Claude · Reads your calendar · Adjusts in conversation</p>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflow: "auto", padding: "16px" }}>
              {messages.length === 0 && (
                <div style={{ textAlign: "center", paddingTop: "2rem", animation: "fadeUp 0.5s ease" }}>
                  <div style={{ fontSize: "2rem", marginBottom: "1rem", opacity: 0.4 }}>◎</div>
                  <p style={{ color: "#6B7280", fontSize: "0.85rem", lineHeight: 1.6, maxWidth: "280px", margin: "0 auto 1.5rem" }}>
                    I've read your two-week calendar. Ask me to suggest a schedule, spot imbalances, or adjust anything.
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxWidth: "320px", margin: "0 auto" }}>
                    {quickPrompts.map((p, i) => (
                      <button key={i} onClick={() => sendMessage(p)} style={{ padding: "8px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", color: "#9CA3AF", fontFamily: "'DM Mono', monospace", fontSize: "0.7rem", cursor: "pointer", textAlign: "left", transition: "all 0.15s" }}
                        onMouseEnter={e => e.target.style.background = "rgba(255,255,255,0.07)"}
                        onMouseLeave={e => e.target.style.background = "rgba(255,255,255,0.04)"}
                      >→ {p}</button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((msg, i) => <Message key={i} msg={msg} />)}
              {loading && (
                <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 0" }}>
                  <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: "linear-gradient(135deg, #F9DC5C, #F4844C)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem" }}>✦</div>
                  <div style={{ display: "flex", gap: "4px" }}>
                    {[0, 1, 2].map(i => <div key={i} style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#F9DC5C", animation: `pulse 1.2s ease ${i * 0.2}s infinite` }} />)}
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div style={{ padding: "12px 16px", borderTop: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
              <div style={{ display: "flex", gap: "8px", alignItems: "flex-end", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", padding: "10px 12px" }}>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask to adjust the schedule, check fairness, or push to Google Calendar…"
                  rows={1}
                  style={{ flex: 1, background: "transparent", border: "none", color: "#E5E7EB", fontFamily: "'Lora', serif", fontSize: "0.85rem", lineHeight: 1.5, maxHeight: "120px", overflowY: "auto" }}
                />
                <button onClick={() => sendMessage(input)} disabled={loading || !input.trim()} style={{ width: "32px", height: "32px", borderRadius: "8px", background: input.trim() && !loading ? "linear-gradient(135deg, #F9DC5C, #F4844C)" : "rgba(255,255,255,0.06)", border: "none", color: input.trim() && !loading ? "#0D0F14" : "#4B5563", cursor: input.trim() && !loading ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s", flexShrink: 0, fontSize: "0.9rem" }}>↑</button>
              </div>
              <p style={{ fontSize: "0.6rem", fontFamily: "'DM Mono', monospace", color: "#374151", marginTop: "6px", textAlign: "center" }}>↵ Send · Shift+↵ New line · Calendar data is sent with each message</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
