"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import confetti from "canvas-confetti";
import { Arrow } from "./Icons";
import Logo from "./Logo";
import ProfileAvatar from "./ProfileAvatar";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const DEMO_SENTENCE = "Let’s ship the new onboarding flow on Friday.";

export default function Home() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [creatorName, setCreatorName] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [demoText, setDemoText] = useState("");
  const [demoStage, setDemoStage] = useState("sharing");
  const [celebrating, setCelebrating] = useState(false);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      setDemoStage("typing");
      setDemoText(DEMO_SENTENCE);
      return undefined;
    }

    const timers = [];
    let stopped = false;
    const later = (callback, delay) => {
      const timer = window.setTimeout(callback, delay);
      timers.push(timer);
      return timer;
    };

    function runCycle() {
      if (stopped) return;
      setDemoText("");
      setDemoStage("sharing");

      later(() => setDemoStage("joined"), 1750);
      later(() => {
        setDemoStage("typing");
        let index = 0;
        function typeNext() {
          if (stopped) return;
          index += 1;
          setDemoText(DEMO_SENTENCE.slice(0, index));
          if (index < DEMO_SENTENCE.length) {
            later(typeNext, 48 + (index % 4) * 13);
          } else {
            later(runCycle, 2100);
          }
        }
        typeNext();
      }, 2450);
    }

    runCycle();
    return () => {
      stopped = true;
      timers.forEach(window.clearTimeout);
    };
  }, []);

  useEffect(() => {
    if (!showCreateModal) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event) => {
      if (event.key === "Escape" && !submitting) setShowCreateModal(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [showCreateModal, submitting]);

  function openCreateModal() {
    setError("");
    setShowCreateModal(true);
  }

  async function createSession(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`${API_URL}/api/sessions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, creatorName }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not create the session");

      localStorage.setItem(`pagerelay:creator:${data.code}`, data.creatorToken);
      localStorage.setItem(`pagerelay:name:${data.code}`, creatorName.trim());
      const destination = `/r/${data.code}`;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        router.push(destination);
        return;
      }
      setShowCreateModal(false);
      setCelebrating(true);
      confetti({
        particleCount: 110,
        spread: 82,
        startVelocity: 42,
        scalar: 0.92,
        origin: { x: 0.5, y: 0.62 },
        disableForReducedMotion: true,
        zIndex: 110,
      });
      window.setTimeout(() => router.push(destination), 950);
    } catch (requestError) {
      setError(requestError.message || "Could not reach the live service");
      setSubmitting(false);
    }
  }

  return (
    <main className="home-shell" id="main-content">
      <a className="skip-link" href="#live-demo">Skip to live preview</a>
      <header className="home-nav" data-od-id="topnav">
        <Logo />
        <span className="nav-note">No account. Just a link.</span>
      </header>

      <section className="home-grid" data-od-id="hero">
        <div className="hero-copy">
          <p className="eyebrow">A QUIET PLACE TO WRITE TOGETHER</p>
          <h1>One live page.<br />Everyone in it.</h1>
          <p className="hero-lead">
            Create a shared sheet, send the link, and watch the words arrive.
            No workspace to configure.
          </p>
          <div className="promise-list" aria-label="Product qualities">
            <span><i aria-hidden="true" /> Live, conflict-safe editing</span>
            <span><i aria-hidden="true" /> Only you can end the session</span>
            <span><i aria-hidden="true" /> Keyboard and screen-reader friendly</span>
          </div>
          <aside className="founder-card" aria-label="Founder">
            <div className="founder-avatar profile-color-2">
              <ProfileAvatar seed="Shaik Abrar" name="Shaik Abrar" size={54} />
            </div>
            <div className="founder-copy">
              <span className="founder-label">BUILT BY</span>
              <strong>SHAIK ABRAR</strong>
              <p>DevOps Engineer at TalentCogent Inc.</p>
            </div>
          </aside>
        </div>

        <div
          className="live-demo"
          id="live-demo"
          data-stage={demoStage}
          aria-label="Animated preview: one person shares a live sheet link, another joins, and they type together"
        >
          <p className="sr-only">
            Person A is online, shares a live sheet with Person B, and both edit it together.
          </p>
          <div className="demo-window-bar" aria-hidden="true">
            <div className="window-dots"><i /><i /><i /></div>
            <span>Live collaboration</span>
            <span className="demo-secure">PRIVATE LINK</span>
          </div>

          <div className="collab-flow" aria-hidden="true">
            <div className="demo-person person-a">
              <span className="demo-avatar profile-color-0">
                <ProfileAvatar seed="PageRelay creator" size={34} decorative />
              </span>
              <span className="person-name">You</span>
              <span className="online-label"><i /> Online</span>
            </div>
            <div className="flow-rail">
              <span className="rail-line" />
              <span className="travel-link">
                <span className="link-glyph">↗</span>
                pagerelay.link
              </span>
            </div>
            <div className="demo-person person-b">
              <span className="demo-avatar profile-color-1">
                <ProfileAvatar seed="PageRelay teammate" size={34} decorative />
              </span>
              <span className="person-name">Teammate</span>
              <span className="online-label"><i /> Online</span>
            </div>
          </div>

          <div className="demo-editor" aria-hidden="true">
            <div className="demo-editor-head">
              <div>
                <span className="demo-kicker">LIVE SHEET</span>
                <strong>Launch notes</strong>
              </div>
              <div className="demo-presence">
                <span className="profile-color-0">
                  <ProfileAvatar seed="PageRelay creator" size={20} decorative />
                </span>
                <span className="profile-color-1">
                  <ProfileAvatar seed="PageRelay teammate" size={20} decorative />
                </span>
              </div>
            </div>
            <div className="demo-writing">
              <span>{demoText}</span>
              <i className="demo-caret" />
            </div>
            <div className="demo-sync-status">
              <span><i /> Both online</span>
              <span>Changes saved</span>
            </div>
          </div>
        </div>
      </section>

      <section className="home-cta" data-od-id="create-cta">
        <div className="home-cta-inner">
          <div>
            <p className="cta-kicker">READY WHEN YOU ARE</p>
            <h2>Open a page and invite someone in.</h2>
          </div>
          <button className="primary-button cta-create-button" onClick={openCreateModal} type="button">
            <span>Create live sheet</span>
            <Arrow />
          </button>
        </div>
      </section>

      <footer className="home-footer" data-od-id="footer">
        <span>PageRelay</span>
        <span>Write · share · close</span>
      </footer>

      {showCreateModal && (
        <div className="modal-backdrop create-modal-backdrop">
          <section
            className="create-modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-modal-title"
          >
            <button
              className="modal-close"
              onClick={() => setShowCreateModal(false)}
              disabled={submitting}
              type="button"
              aria-label="Close create sheet dialog"
            >
              <span aria-hidden="true">×</span>
            </button>
            <div className="panel-heading">
              <span className="step-number num">01</span>
              <div>
                <h2 id="create-modal-title">Start a live sheet</h2>
                <p>You&apos;ll get a unique link to share.</p>
              </div>
            </div>
            <form id="create-session" onSubmit={createSession}>
              <div className="field">
                <label htmlFor="sheet-title">Sheet name</label>
                <input
                  id="sheet-title"
                  name="title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={80}
                  placeholder="Thursday planning notes"
                  autoComplete="off"
                  autoFocus
                  required
                />
                <span className="field-hint">Make it easy for guests to recognize.</span>
              </div>
              <div className="field">
                <label htmlFor="creator-name">Your name</label>
                <input
                  id="creator-name"
                  name="creatorName"
                  value={creatorName}
                  onChange={(event) => setCreatorName(event.target.value)}
                  maxLength={40}
                  placeholder="Avery"
                  autoComplete="name"
                  required
                />
                <span className="field-hint">Shown to people who join the sheet.</span>
              </div>
              {error && <p className="form-error" role="alert">{error}</p>}
              <button className="primary-button create-button" disabled={submitting} type="submit">
                <span>{submitting ? "Creating…" : "Create live sheet"}</span>
                {!submitting && <Arrow />}
              </button>
            </form>
            <p className="privacy-note">
              Anyone with the link can join. You remain the only person who can end it.
            </p>
          </section>
        </div>
      )}

      {celebrating && (
        <div className="celebration-layer" aria-live="polite">
          <p className="celebration-toast">Your live sheet is ready</p>
        </div>
      )}
    </main>
  );
}
