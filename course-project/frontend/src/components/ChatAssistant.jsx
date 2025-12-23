import React from "react";
import { FaMicrophone } from "react-icons/fa";
import { useAuth } from "../contexts/AuthContext";
import { apiUrl } from "../config/apiBase";

export default function ChatAssistant() {
  const { token } = useAuth();
  const [input, setInput] = React.useState("");
  const [msgs, setMsgs] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  const [listening, setListening] = React.useState(false);
  const [speechSupported, setSpeechSupported] = React.useState(false);
  const [speechLang, setSpeechLang] = React.useState(() => {
    try {
      return localStorage.getItem("assistantLang") || "en-US";
    } catch {
      return "en-US";
    }
  });
  const [voiceEnabled, setVoiceEnabled] = React.useState(() => {
    try {
      return JSON.parse(localStorage.getItem("assistantVoice") ?? "true");
    } catch {
      return true;
    }
  });
  const listRef = React.useRef(null);
  const recognitionRef = React.useRef(null);
  const scrollToBottom = React.useCallback(() => {
    if (!listRef.current) return;
    listRef.current.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, []);
  // Collapse/expand state with persistence
  const [open, setOpen] = React.useState(() => {
    try {
      return JSON.parse(localStorage.getItem("assistantOpen") ?? "true");
    } catch {
      return true;
    }
  });
  const panelId = "assistant-panel";
  React.useEffect(() => {
    try {
      localStorage.setItem("assistantOpen", JSON.stringify(open));
    } catch {}
  }, [open]);

  React.useEffect(() => {
    try {
      localStorage.setItem("assistantVoice", JSON.stringify(voiceEnabled));
    } catch {}
  }, [voiceEnabled]);

  React.useEffect(() => {
    scrollToBottom();
  }, [msgs, open, scrollToBottom]);

  // Set up speech recognition if the browser supports it.
  React.useEffect(() => {
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Speech) return;
    const rec = new Speech();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = speechLang;
    rec.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript || "";
      if (transcript) {
        setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
      }
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    setSpeechSupported(true);
    return () => rec.abort();
  }, [speechLang]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setMsgs((m) => [...m, { role: "you", text }]);
    setBusy(true);
    try {
      const r = await fetch(apiUrl("/ai/chat"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: text }),
      });
      const data = await r.json();
      const reply = data?.reply || "Sorry, I’m not sure.";
      const audioUrl = data?.audioBase64 ? `data:audio/mpeg;base64,${data.audioBase64}` : null;
      setMsgs((m) => [...m, { role: "ai", text: reply, audioUrl }]);
      playVoice(reply, audioUrl);
    } catch (e) {
      setMsgs((m) => [...m, { role: "ai", text: "AI is unavailable right now." }]);
    } finally {
      setBusy(false);
      scrollToBottom();
    }
  }

  function onKey(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function openPanel() { setOpen(true); }
  function closePanel() { setOpen(false); }
  function togglePanel() { setOpen((o) => !o); }

  function startVoice() {
    if (!recognitionRef.current || busy) return;
    try {
      recognitionRef.current.lang = speechLang;
      setListening(true);
      recognitionRef.current.start();
    } catch {
      setListening(false);
    }
  }

  async function playVoice(text, providedUrl) {
    if (!voiceEnabled) return;
    const play = (url) => {
      try { new Audio(url).play().catch(() => {}); } catch {}
    };
    if (providedUrl) {
      play(providedUrl);
      return;
    }
    try {
      const resp = await fetch(apiUrl("/ai/tts"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ text }),
      });
      const data = await resp.json();
      const url = data?.audioBase64 ? `data:audio/mpeg;base64,${data.audioBase64}` : null;
      if (url) {
        setMsgs((prev) => {
          const copy = [...prev];
          const idx = copy.length - 1;
          if (idx >= 0 && copy[idx].role === "ai" && copy[idx].text === text) {
            copy[idx] = { ...copy[idx], audioUrl: url };
          }
          return copy;
        });
        play(url);
      }
    } catch {}
  }

  return (
    <>
      {!open && (
        <button
          className="pc-btn"
          onClick={openPanel}
          aria-controls={panelId}
          aria-expanded="false"
          style={{ position: "fixed", right: 16, bottom: 16, zIndex: 70, borderRadius: 9999 }}
          title="Open assistant"
        >
          Assistant
        </button>
      )}

      {open && (
        <div
          id={panelId}
          className="pc-card"
          style={{ position: "fixed", right: 16, bottom: 16, width: 360, zIndex: 70 }}
        >
          <div className="pc-head u-justify-between u-items-center">
            <h3 className="pc-title u-m-0">Assistant</h3>
            <div className="pc-field" style={{ display: "flex", alignItems: "center", gap: 8, margin: 0 }}>
              <span className="pc-desc" style={{ margin: 0 }}>Voice</span>
              <button
                type="button"
                onClick={() => setVoiceEnabled((v) => !v)}
                aria-label="Toggle voice playback"
                title="Toggle voice playback"
                style={{
                  width: 40,
                  height: 22,
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.2)",
                  background: voiceEnabled ? "linear-gradient(90deg, #60a5fa, #2563eb)" : "rgba(255,255,255,0.08)",
                  position: "relative",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: 2,
                    left: voiceEnabled ? 20 : 2,
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    background: "#fff",
                    transition: "left 120ms ease",
                  }}
                />
              </button>
            </div>
            <button
              className="pc-btn secondary"
              onClick={closePanel}
              aria-label="Minimize assistant"
              title="Minimize"
            >
              —
            </button>
          </div>

          <div
            ref={listRef}
            style={{ maxHeight: 300, overflow: "auto", marginTop: 8, display: "grid", gap: 8 }}
          >
            {msgs.map((m, i) => (
              <div key={i} className="pc-card" style={{ background: "rgba(15,22,40,0.7)" }}>
                <div className="pc-name" style={{ opacity: 0.8 }}>
                  {m.role === "you" ? "You" : "AI"}
                </div>
                <div className="pc-desc" style={{ whiteSpace: "pre-wrap" }}>{m.text}</div>
              </div>
            ))}
            {!msgs.length && (
              <div className="pc-desc-muted">Ask about events, RSVP steps, roles, etc.</div>
            )}
          </div>

          <div className="u-mt-12" style={{ display: "grid", gap: 8 }}>
            <div style={{ position: "relative" }}>
              <textarea
                className="pc-input"
                rows={2}
                placeholder="Type a message…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKey}
                style={{ paddingRight: 44 }}
              />
              <button
                type="button"
                className="pc-btn secondary"
                aria-label="Record voice input"
                onClick={startVoice}
                disabled={!speechSupported || listening || busy}
                title={!speechSupported ? "Voice input not supported in this browser" : "Add via microphone"}
                style={{
                  position: "absolute",
                  right: 6,
                  bottom: 6,
                  padding: "6px 10px",
                  minHeight: "auto",
                }}
              >
                <FaMicrophone style={{ opacity: listening ? 1 : 0.85 }} />
              </button>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              {speechSupported && (
                <select
                  aria-label="Speech input language"
                  value={speechLang}
                  onChange={(e) => {
                    const lang = e.target.value;
                    setSpeechLang(lang);
                    try {
                      localStorage.setItem("assistantLang", lang);
                    } catch {}
                  }}
                  style={{
                    background: "transparent",
                    color: "#e5edff",
                    border: "1px solid rgba(255,255,255,0.2)",
                    borderRadius: 8,
                    padding: "6px 8px",
                    cursor: "pointer",
                    flex: "0 0 auto",
                  }}
                >
                  <option value="en-US">English (US)</option>
                  <option value="en-GB">English (UK)</option>
                  <option value="hi-IN">Hindi</option>
                  <option value="fr-FR">French</option>
                  <option value="es-ES">Spanish</option>
                  <option value="zh-CN">Chinese (Mandarin)</option>
                </select>
              )}
              <button className="pc-btn" onClick={send} disabled={busy || !input.trim()}>
                {busy ? "Sending…" : "Send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
