"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { authApi } from "@/services/auth";
import { ApiRequestError } from "@/services/api";
import { useAuth } from "./auth-provider";
import { PasswordInput } from "./password-input";
import styles from "@/app/login/login.module.css";

export function AuthForm({ register = false }: { register?: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [credentialsInvalid, setCredentialsInvalid] = useState(false);
  const [nameError, setNameError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [confirmPasswordError, setConfirmPasswordError] = useState("");
  const submitting = useRef(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const confirmPasswordInputRef = useRef<HTMLInputElement>(null);
  const { setUser } = useAuth();
  const router = useRouter();

  function handlePasswordBlur() {
    if (password.length > 0 && (password.length < 12 || password.length > 128)) {
      setPasswordError("Use 12–128 characters. A long, unique passphrase works well.");
    } else if (!password) {
      setPasswordError("");
    } else {
      setPasswordError("");
    }

    if (confirmPassword) {
      if (confirmPassword !== password) {
        setConfirmPasswordError("Passwords don't match.");
      } else {
        setConfirmPasswordError("");
      }
    }
  }

  function handlePasswordChange(event: React.ChangeEvent<HTMLInputElement>) {
    const val = event.target.value;
    setPassword(val);
    setError("");

    if (passwordError) {
      if (val.length >= 12 && val.length <= 128) {
        setPasswordError("");
      } else if (!val) {
        setPasswordError("Please enter a password.");
      } else {
        setPasswordError("Use 12–128 characters. A long, unique passphrase works well.");
      }
    }

    if (confirmPassword && confirmPasswordError && val === confirmPassword) {
      setConfirmPasswordError("");
    }
  }

  function handleConfirmPasswordBlur() {
    if (confirmPassword) {
      if (confirmPassword !== password) {
        setConfirmPasswordError("Passwords don't match.");
      } else {
        setConfirmPasswordError("");
      }
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current) return;

    if (!register) {
      const emailTrimmed = email.trim();
      let emailErr = "";
      let passwordErr = "";

      if (!emailTrimmed) {
        emailErr = "Please enter your email.";
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
        emailErr = "Please enter a valid email address.";
      }

      if (!password) {
        passwordErr = "Please enter your password.";
      }

      if (emailErr || passwordErr) {
        setEmailError(emailErr);
        setPasswordError(passwordErr);
        if (emailErr) {
          emailInputRef.current?.focus();
        } else if (passwordErr) {
          passwordInputRef.current?.focus();
        }
        return;
      }
    } else {
      const nameTrimmed = name.trim();
      const emailTrimmed = email.trim();
      let nameErr = "";
      let emailErr = "";
      let passwordErr = "";
      let confirmPasswordErr = "";

      if (!nameTrimmed) {
        nameErr = "Please enter your name.";
      }

      if (!emailTrimmed) {
        emailErr = "Please enter your email.";
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
        emailErr = "Please enter a valid email address.";
      }

      if (!password) {
        passwordErr = "Please enter a password.";
      } else if (password.length < 12 || password.length > 128) {
        passwordErr = "Use 12–128 characters. A long, unique passphrase works well.";
      }

      if (!confirmPassword) {
        confirmPasswordErr = "Please confirm your password.";
      } else if (confirmPassword !== password) {
        confirmPasswordErr = "Passwords don't match.";
      }

      if (nameErr || emailErr || passwordErr || confirmPasswordErr) {
        setNameError(nameErr);
        setEmailError(emailErr);
        setPasswordError(passwordErr);
        setConfirmPasswordError(confirmPasswordErr);
        if (nameErr) {
          nameInputRef.current?.focus();
        } else if (emailErr) {
          emailInputRef.current?.focus();
        } else if (passwordErr) {
          passwordInputRef.current?.focus();
        } else if (confirmPasswordErr) {
          confirmPasswordInputRef.current?.focus();
        }
        return;
      }
    }

    submitting.current = true;
    setBusy(true);
    setError("");
    setCredentialsInvalid(false);
    setNameError("");
    setEmailError("");
    setPasswordError("");
    setConfirmPasswordError("");

    try {
      setUser(register ? await authApi.register(email, password, name) : await authApi.login(email, password));
      setPassword("");
      setConfirmPassword("");
      const next = new URLSearchParams(window.location.search).get("next") ?? "/projects";
      router.replace(/^\/(dashboard|projects|simulator)([/?]|$)/.test(next) ? next : "/projects");
    } catch (cause) {
      if (!register) setPassword("");
      const message = cause instanceof Error ? cause.message : register ? "Could not create account." : "Could not sign in.";
      setError(message);
      const is401 = cause instanceof ApiRequestError && cause.status === 401;
      const isConflict = cause instanceof ApiRequestError && cause.status === 409;
      setCredentialsInvalid(is401);
      submitting.current = false;
      setBusy(false);

      if (is401) {
        passwordInputRef.current?.focus();
      } else if (register) {
        if (/email/i.test(message) || isConflict) {
          setEmailError(message);
          emailInputRef.current?.focus();
        } else if (/password/i.test(message)) {
          setPasswordError(message);
          passwordInputRef.current?.focus();
        } else if (/name/i.test(message)) {
          setNameError(message);
          nameInputRef.current?.focus();
        }
      }
    }
  }

  if (!register) {
    const hasEmailError = Boolean(emailError);
    const isEmailInvalid = hasEmailError || credentialsInvalid;
    const hasPasswordError = Boolean(passwordError || error);
    const isPasswordInvalid = hasPasswordError || credentialsInvalid;

    return (
      <div className={styles.formCard}>
        <div className={styles.formContent}>
          <h1>Welcome back</h1>
          <p className={styles.formDescription}>Sign in to continue to your Astra workspace</p>
          <form onSubmit={submit} className={styles.form} aria-busy={busy} noValidate>
            <div className={`${styles.field}${isEmailInvalid ? ` ${styles.fieldInvalid}` : ""}`}>
              <label className={styles.visuallyHidden} htmlFor="login-email">Email</label>
              <input
                ref={emailInputRef}
                id="login-email"
                name="email"
                className={`${styles.input}${isEmailInvalid ? ` ${styles.inputError}` : ""}${hasEmailError ? ` ${styles.inputHasPanel}` : ""}`}
                required
                type="email"
                inputMode="email"
                maxLength={320}
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="Enter your email"
                disabled={busy}
                aria-invalid={isEmailInvalid}
                aria-describedby={hasEmailError ? "login-email-error" : undefined}
                value={email}
                onChange={event => {
                  setEmail(event.target.value);
                  setEmailError("");
                  setError("");
                  setCredentialsInvalid(false);
                }}
              />
              {hasEmailError && (
                <div id="login-email-error" role="alert" className={styles.errorPanel}>
                  {emailError}
                </div>
              )}
            </div>
            <div className={`${styles.field}${isPasswordInvalid ? ` ${styles.fieldInvalid}` : ""}`}>
              <label className={styles.visuallyHidden} htmlFor="login-password">Password</label>
              <PasswordInput
                ref={passwordInputRef}
                id="login-password"
                name="password"
                className={`${styles.input}${isPasswordInvalid ? ` ${styles.inputError}` : ""}${hasPasswordError ? ` ${styles.inputHasPanel}` : ""}`}
                required
                minLength={12}
                maxLength={128}
                autoComplete="current-password"
                placeholder="Enter your password"
                disabled={busy}
                aria-invalid={isPasswordInvalid}
                aria-describedby={hasPasswordError ? "login-password-error" : undefined}
                value={password}
                onChange={event => {
                  setPassword(event.target.value);
                  setPasswordError("");
                  setError("");
                  setCredentialsInvalid(false);
                }}
              />
              {hasPasswordError && (
                <div id="login-password-error" role="alert" className={styles.errorPanel}>
                  {passwordError || error}
                </div>
              )}
            </div>
            <button type="submit" disabled={busy} className={styles.submit}>
              {busy && <span className={styles.spinner} aria-hidden="true" />}
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
        <p className={styles.account}>Don&apos;t have an account? <Link className={styles.accountLink} href="/register">Sign up</Link></p>
      </div>
    );
  }

  const hasNameError = Boolean(nameError);
  const hasEmailError = Boolean(emailError);
  const hasPasswordError = Boolean(passwordError);
  const hasConfirmPasswordError = Boolean(confirmPasswordError);

  return (
    <div className={styles.formCard}>
      <div className={styles.formContent}>
        <h1>Create your account</h1>
        <p className={styles.formDescription}>Your projects and simulation results belong to your account.</p>
        <form onSubmit={submit} className={`${styles.form} ${styles.registerForm}`} aria-busy={busy} noValidate>
          <div className={`${styles.field}${hasNameError ? ` ${styles.fieldInvalid}` : ""}`}>
            <label className={styles.visuallyHidden} htmlFor="register-name">Name</label>
            <input
              ref={nameInputRef}
              id="register-name"
              name="name"
              className={`${styles.input}${hasNameError ? ` ${styles.inputError} ${styles.inputHasPanel}` : ""}`}
              required
              type="text"
              maxLength={200}
              autoComplete="name"
              placeholder="Enter your name"
              disabled={busy}
              aria-invalid={hasNameError}
              aria-describedby={hasNameError ? "register-name-error" : undefined}
              value={name}
              onChange={event => {
                setName(event.target.value);
                setNameError("");
                setError("");
              }}
            />
            {hasNameError && (
              <div id="register-name-error" role="alert" className={styles.errorPanel}>
                {nameError}
              </div>
            )}
          </div>

          <div className={`${styles.field}${hasEmailError ? ` ${styles.fieldInvalid}` : ""}`}>
            <label className={styles.visuallyHidden} htmlFor="register-email">Email</label>
            <input
              ref={emailInputRef}
              id="register-email"
              name="email"
              className={`${styles.input}${hasEmailError ? ` ${styles.inputError} ${styles.inputHasPanel}` : ""}`}
              required
              type="email"
              inputMode="email"
              maxLength={320}
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="Enter your email"
              disabled={busy}
              aria-invalid={hasEmailError}
              aria-describedby={hasEmailError ? "register-email-error" : undefined}
              value={email}
              onChange={event => {
                setEmail(event.target.value);
                setEmailError("");
                setError("");
              }}
            />
            {hasEmailError && (
              <div id="register-email-error" role="alert" className={styles.errorPanel}>
                {emailError}
              </div>
            )}
          </div>

          <div className={`${styles.field}${hasPasswordError ? ` ${styles.fieldInvalid}` : ""}`}>
            <label className={styles.visuallyHidden} htmlFor="register-password">Password</label>
            <PasswordInput
              ref={passwordInputRef}
              id="register-password"
              name="password"
              className={`${styles.input}${hasPasswordError ? ` ${styles.inputError} ${styles.inputHasPanel}` : ""}`}
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
              placeholder="Create a password"
              disabled={busy}
              aria-invalid={hasPasswordError}
              aria-describedby={hasPasswordError ? "register-password-error" : undefined}
              value={password}
              onBlur={handlePasswordBlur}
              onChange={handlePasswordChange}
            />
            {hasPasswordError && (
              <div id="register-password-error" role="alert" className={styles.errorPanel}>
                {passwordError}
              </div>
            )}
          </div>

          <div className={`${styles.field}${hasConfirmPasswordError ? ` ${styles.fieldInvalid}` : ""}`}>
            <label className={styles.visuallyHidden} htmlFor="register-confirm-password">Confirm password</label>
            <PasswordInput
              ref={confirmPasswordInputRef}
              id="register-confirm-password"
              name="confirmPassword"
              className={`${styles.input}${hasConfirmPasswordError ? ` ${styles.inputError} ${styles.inputHasPanel}` : ""}`}
              required
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
              placeholder="Confirm your password"
              disabled={busy}
              aria-invalid={hasConfirmPasswordError}
              aria-describedby={hasConfirmPasswordError ? "register-confirm-password-error" : undefined}
              value={confirmPassword}
              onBlur={handleConfirmPasswordBlur}
              onChange={event => {
                setConfirmPassword(event.target.value);
                setConfirmPasswordError("");
                setError("");
              }}
            />
            {hasConfirmPasswordError && (
              <div id="register-confirm-password-error" role="alert" className={styles.errorPanel}>
                {confirmPasswordError}
              </div>
            )}
          </div>

          {error && !hasNameError && !hasEmailError && !hasPasswordError && !hasConfirmPasswordError && (
            <div role="alert" className={styles.errorPanel} style={{ borderRadius: 12, borderTop: "1px solid #B3402A" }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={busy} className={`${styles.submit} ${styles.submitRegister}`}>
            {busy && <span className={styles.spinner} aria-hidden="true" />}
            {busy ? "Please wait…" : "Create account"}
          </button>
        </form>
      </div>
      <p className={styles.account}>
        Already have an account?{" "}
        <Link className={styles.accountLink} href="/login">
          Sign in
        </Link>
      </p>
    </div>
  );
}
