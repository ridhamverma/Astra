"use client";

import React, { forwardRef, useRef, useState, useImperativeHandle } from "react";
import styles from "@/app/login/login.module.css";

function EyeIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
      <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
      <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}

export interface PasswordInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  wrapperClassName?: string;
  toggleAriaLabel?: {
    show?: string;
    hide?: string;
  };
}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput(
    { className, wrapperClassName, toggleAriaLabel, disabled, id, name, ...props },
    ref
  ) {
    const [visible, setVisible] = useState(false);
    const innerRef = useRef<HTMLInputElement>(null);

    useImperativeHandle(ref, () => innerRef.current as HTMLInputElement);

    const isConfirm = name === "confirmPassword" || (typeof id === "string" && id.includes("confirm"));

    const defaultShowLabel = isConfirm ? "Show confirm password" : "Show password";
    const defaultHideLabel = isConfirm ? "Hide confirm password" : "Hide password";
    const showLabel = toggleAriaLabel?.show ?? defaultShowLabel;
    const hideLabel = toggleAriaLabel?.hide ?? defaultHideLabel;

    const handleToggle = (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      const input = innerRef.current;
      const wasFocused = input && document.activeElement === input;
      const start = input?.selectionStart;
      const end = input?.selectionEnd;

      setVisible((prev) => !prev);

      if (wasFocused && input) {
        requestAnimationFrame(() => {
          input.focus();
          if (start !== null && end !== null && typeof start === "number" && typeof end === "number") {
            try {
              input.setSelectionRange(start, end);
            } catch {
              // Ignore unsupported input type selection ranges
            }
          }
        });
      }
    };

    return (
      <div className={`${styles.inputWrapper}${wrapperClassName ? ` ${wrapperClassName}` : ""}`}>
        <input
          {...props}
          ref={innerRef}
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          disabled={disabled}
          className={`${className ? `${className} ` : ""}${styles.inputWithToggle}`}
        />
        <button
          type="button"
          tabIndex={0}
          disabled={disabled}
          aria-label={visible ? hideLabel : showLabel}
          aria-pressed={visible}
          title={visible ? hideLabel : showLabel}
          onMouseDown={(event) => {
            // Prevent input from losing focus when clicking with mouse
            event.preventDefault();
          }}
          onClick={handleToggle}
          className={styles.passwordToggle}
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
    );
  }
);

PasswordInput.displayName = "PasswordInput";
