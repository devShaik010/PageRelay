"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Arrow } from "./Icons";

const WELCOME_STORAGE_KEY = "pagerelay:welcome-seen";

export default function WelcomeModal() {
  const [isOpen, setIsOpen] = useState(false);
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);

  useEffect(() => {
    try {
      setIsOpen(localStorage.getItem(WELCOME_STORAGE_KEY) !== "true");
    } catch {
      setIsOpen(true);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        dismiss();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = dialogRef.current.querySelectorAll(
        'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [isOpen]);

  function dismiss() {
    try {
      localStorage.setItem(WELCOME_STORAGE_KEY, "true");
    } catch {
      // The modal can still close when storage is unavailable.
    }
    setIsOpen(false);
  }

  if (!isOpen) return null;

  return (
    <div
      className="welcome-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) dismiss();
      }}
    >
      <section
        className="welcome-card"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
        aria-describedby="welcome-description"
      >
        <div className="welcome-portrait" aria-hidden="true">
          <Image
            src="/images/abrar.jpeg"
            alt=""
            fill
            priority
            sizes="(max-width: 680px) 100vw, 340px"
          />
          <span className="welcome-portrait-label">CREATOR OF PAGERELAY</span>
        </div>

        <div className="welcome-content">
          <button
            className="welcome-close"
            ref={closeButtonRef}
            onClick={dismiss}
            type="button"
            aria-label="Close welcome message"
          >
            <span aria-hidden="true">×</span>
          </button>

          <p className="welcome-kicker">A NOTE FROM ABRAR</p>
          <h2 id="welcome-title">Hey there!</h2>
          <p id="welcome-description" className="welcome-message">
            I’m Shaik Abrar, the creator of PageRelay. I built this as a simple,
            focused place where people can write together without setup getting
            in the way. Thanks for stopping by — I hope you enjoy using it.
          </p>

          <div className="welcome-signoff">
            <span>SHAIK ABRAR</span>
            <small>DevOps Engineer at TalentCogent Inc.</small>
          </div>

          <button className="primary-button welcome-action" onClick={dismiss} type="button">
            <span>Start writing</span>
            <Arrow />
          </button>
        </div>
      </section>
    </div>
  );
}
