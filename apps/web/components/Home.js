"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import confetti from "canvas-confetti";
import { Arrow } from "./Icons";
import Logo from "./Logo";
import ProfileAvatar from "./ProfileAvatar";
import WelcomeModal from "./WelcomeModal";

const CONFIGURED_API_URL = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
const DEMO_SENTENCE = "Let’s ship the new onboarding flow on Friday.";

function getApiUrl() {
  if (CONFIGURED_API_URL) return CONFIGURED_API_URL;
  if (typeof window === "undefined") return "http://localhost:4000";
  if (["localhost", "127.0.0.1"].includes(window.location.hostname)) {
    return `${window.location.protocol}//${window.location.hostname}:4000`;
  }
  return window.location.origin;
}

export default function Home() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [creatorName, setCreatorName] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createStep, setCreateStep] = useState(1);
  const [mode, setMode] = useState("");
  const [multiAccess, setMultiAccess] = useState("anyone");
  const [editorLimit, setEditorLimit] = useState(2);
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
    setCreateStep(1);
    setMode("");
    setMultiAccess("anyone");
    setEditorLimit(2);
    setShowCreateModal(true);
  }

  function continueToMode(event) {
    event.preventDefault();
    setError("");
    setCreateStep(2);
  }

  async function createSession(event) {
    event.preventDefault();
    if (!mode) {
      setError("Choose how this sheet should work.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch(`${getApiUrl()}/api/sessions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          creatorName,
          mode,
          accessPolicy: mode === "multi" ? multiAccess : undefined,
          editorLimit:
            mode === "multi" && multiAccess === "limited"
              ? Number(editorLimit)
              : undefined,
        }),
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
      <WelcomeModal />
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
              <span className="step-number num">0{createStep}</span>
              <div>
                <h2 id="create-modal-title">
                  {createStep === 1 ? "Name your live sheet" : "Choose how people join"}
                </h2>
                <p>
                  {createStep === 1
                    ? "Add the details people will recognize."
                    : "You can share the same link in every mode."}
                </p>
              </div>
            </div>
            <div className="creation-progress" aria-label={`Step ${createStep} of 2`}>
              <span className="is-complete" />
              <span className={createStep === 2 ? "is-complete" : ""} />
            </div>
            <form
              id="create-session"
              onSubmit={createStep === 1 ? continueToMode : createSession}
            >
              {createStep === 1 ? (
                <div className="create-step-fields">
                  <div className="field">
                    <label htmlFor="sheet-title">Sheet title</label>
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
                </div>
              ) : (
                <div className="mode-step">
                  <fieldset className="mode-choices">
                    <legend className="sr-only">Collaboration mode</legend>
                    <label className={`mode-choice ${mode === "solo" ? "is-selected" : ""}`}>
                      <input
                        type="radio"
                        name="mode"
                        value="solo"
                        checked={mode === "solo"}
                        onChange={(event) => setMode(event.target.value)}
                        required
                      />
                      <span className="mode-index num">01</span>
                      <span className="mode-visual mode-visual-solo" aria-hidden="true">
                        <span className="mode-avatar profile-color-0">
                          <ProfileAvatar seed="Solo writer" size={42} decorative />
                        </span>
                      </span>
                      <span className="mode-copy">
                        <span className="mode-title-row">
                          <strong>Solo mode</strong>
                          <span className="mode-capacity">1 writer</span>
                        </span>
                        <small>You write. Everyone with the link reads and copies.</small>
                      </span>
                    </label>
                    <label className={`mode-choice ${mode === "duo" ? "is-selected" : ""}`}>
                      <input
                        type="radio"
                        name="mode"
                        value="duo"
                        checked={mode === "duo"}
                        onChange={(event) => setMode(event.target.value)}
                      />
                      <span className="mode-index num">02</span>
                      <span className="mode-visual mode-visual-duo" aria-hidden="true">
                        <span className="mode-avatar profile-color-0">
                          <ProfileAvatar seed="Duo creator" size={38} decorative />
                        </span>
                        <span className="mode-avatar profile-color-1">
                          <ProfileAvatar seed="Duo collaborator" size={38} decorative />
                        </span>
                      </span>
                      <span className="mode-copy">
                        <span className="mode-title-row">
                          <strong>Duo mode</strong>
                          <span className="mode-capacity">2 editors · private</span>
                        </span>
                        <small>A private writing room for you and one collaborator.</small>
                      </span>
                    </label>
                    <label className={`mode-choice ${mode === "multi" ? "is-selected" : ""}`}>
                      <input
                        type="radio"
                        name="mode"
                        value="multi"
                        checked={mode === "multi"}
                        onChange={(event) => setMode(event.target.value)}
                      />
                      <span className="mode-index num">03</span>
                      <span className="mode-visual mode-visual-multi" aria-hidden="true">
                        <span className="mode-avatar profile-color-0">
                          <ProfileAvatar seed="Multi creator" size={34} decorative />
                        </span>
                        <span className="mode-avatar profile-color-1">
                          <ProfileAvatar seed="Multi teammate one" size={34} decorative />
                        </span>
                        <span className="mode-avatar profile-color-2">
                          <ProfileAvatar seed="Multi teammate two" size={34} decorative />
                        </span>
                        <span className="mode-more num">+</span>
                      </span>
                      <span className="mode-copy">
                        <span className="mode-title-row">
                          <strong>Multi mode</strong>
                          <span className="mode-capacity">Group room</span>
                        </span>
                        <small>Bring a group together with flexible editing access.</small>
                      </span>
                    </label>
                  </fieldset>

                  {mode === "multi" && (
                    <fieldset className="access-choices">
                      <legend>Who can edit?</legend>
                      <label>
                        <input
                          type="radio"
                          name="multi-access"
                          value="read_only"
                          checked={multiAccess === "read_only"}
                          onChange={(event) => setMultiAccess(event.target.value)}
                        />
                        <span><strong>Read only</strong><small>Only you can write</small></span>
                      </label>
                      <label>
                        <input
                          type="radio"
                          name="multi-access"
                          value="anyone"
                          checked={multiAccess === "anyone"}
                          onChange={(event) => setMultiAccess(event.target.value)}
                        />
                        <span><strong>Anyone</strong><small>Every visitor can write</small></span>
                      </label>
                      <label>
                        <input
                          type="radio"
                          name="multi-access"
                          value="limited"
                          checked={multiAccess === "limited"}
                          onChange={(event) => setMultiAccess(event.target.value)}
                        />
                        <span><strong>Limited</strong><small>Set collaborator seats</small></span>
                      </label>
                    </fieldset>
                  )}

                  {mode === "multi" && multiAccess === "limited" && (
                    <div className="field editor-limit-field">
                      <label htmlFor="editor-limit">Collaborator seats</label>
                      <input
                        id="editor-limit"
                        type="number"
                        min="1"
                        max="20"
                        value={editorLimit}
                        onChange={(event) => setEditorLimit(event.target.value)}
                        required
                      />
                      <span className="field-hint">
                        Visitors beyond this limit can still read and copy.
                      </span>
                    </div>
                  )}
                </div>
              )}
              {error && <p className="form-error" role="alert">{error}</p>}
              <div className="create-form-actions">
                {createStep === 2 && (
                  <button
                    className="secondary-button"
                    onClick={() => {
                      setError("");
                      setCreateStep(1);
                    }}
                    disabled={submitting}
                    type="button"
                  >
                    Back
                  </button>
                )}
                <button className="primary-button create-button" disabled={submitting} type="submit">
                  <span>
                    {createStep === 1
                      ? "Next"
                      : submitting
                        ? "Creating…"
                        : "Create live sheet"}
                  </span>
                  {!submitting && <Arrow />}
                </button>
              </div>
            </form>
            <p className="privacy-note">
              {createStep === 1
                ? "Your name stays tied to this browser for the live session."
                : "Permissions are enforced by the live service, not only the page controls."}
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
