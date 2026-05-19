import { FormEvent, useState, type SVGProps } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { isTauri } from "@tauri-apps/api/core";
import { useAuth, type UserRole } from "@/shared/auth-context";
import { homeRouteForRole } from "@/shared/auth-routes";
import { loginUser, registerStudentUser } from "@/shared/auth-resolve-tauri";
import styles from "./LoginPage.module.css";

function BrainIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={28}
      height={28}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
      <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
      <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" />
      <path d="M17.599 6.5a3 3 0 0 0 .399-1.375" />
      <path d="M6.003 5.125A3 3 0 0 0 6.401 6.5" />
    </svg>
  );
}

function isUserRole(v: string): v is UserRole {
  return v === "student" || v === "teacher" || v === "admin";
}

function buildBrowserDemoStudent(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  return {
    id: `browser-demo-student:${normalizedEmail}`,
    email: normalizedEmail,
    role: "student" as const,
  };
}

function saveBrowserDemoStudent(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const key = `ai-lab-demo-student:${normalizedEmail}`;
  window.localStorage.setItem(key, JSON.stringify({ email: normalizedEmail, password }));
}

function hasBrowserDemoStudent(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const key = `ai-lab-demo-student:${normalizedEmail}`;
  const raw = window.localStorage.getItem(key);
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as { password?: string };
    return parsed.password === password;
  } catch {
    return false;
  }
}

export function LoginPage() {
  const { isAuthenticated, userRole, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (isAuthenticated && userRole) {
    return <Navigate to={homeRouteForRole(userRole)} replace />;
  }

  function validateInput(): { email: string; password: string } | null {
    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();
    if (!trimmedEmail) {
      setFormError("Укажите email.");
      return null;
    }
    if (!trimmedPassword) {
      setFormError("Укажите пароль.");
      return null;
    }
    return { email: trimmedEmail, password: trimmedPassword };
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!isTauri()) {
      const input = validateInput();
      if (!input) return;
      if (!hasBrowserDemoStudent(input.email, input.password)) {
        setFormError("В браузере сначала нажмите «Зарегистрироваться». Это демо-вход для учеников.");
        return;
      }
      const demoStudent = buildBrowserDemoStudent(input.email);
      login({
        userId: demoStudent.id,
        userEmail: demoStudent.email,
        userRole: demoStudent.role,
      });
      navigate(homeRouteForRole("student"), { replace: true });
      return;
    }
    const input = validateInput();
    if (!input) return;

    setSubmitting(true);
    try {
      const resolved = await loginUser(input.email, input.password);
      const role = resolved.role;
      if (!isUserRole(role)) {
        setFormError("Некорректная роль пользователя в базе.");
        return;
      }
      login({
        userId: resolved.id,
        userEmail: resolved.email,
        userRole: role,
      });
      navigate(homeRouteForRole(role), { replace: true });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRegister() {
    setFormError(null);
    const input = validateInput();
    if (!input) return;
    if (input.password.length < 6) {
      setFormError("Пароль должен содержать минимум 6 символов.");
      return;
    }

    if (!isTauri()) {
      saveBrowserDemoStudent(input.email, input.password);
      const demoStudent = buildBrowserDemoStudent(input.email);
      login({
        userId: demoStudent.id,
        userEmail: demoStudent.email,
        userRole: demoStudent.role,
      });
      navigate(homeRouteForRole("student"), { replace: true });
      return;
    }

    setSubmitting(true);
    try {
      const created = await registerStudentUser(input.email, input.password);
      login({
        userId: created.id,
        userEmail: created.email,
        userRole: "student",
      });
      navigate(homeRouteForRole("student"), { replace: true });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className={styles.main}>
      <div className={styles.bg} aria-hidden>
        <div className={styles.bgRadial} />
        <div className={styles.blobTop} />
        <div className={styles.blobBottom} />
      </div>

      <div className={styles.card}>
        <header className={styles.cardHeader}>
          <div className={styles.iconWrap}>
            <BrainIcon />
          </div>
          <h1 className={styles.title}>AI Lab</h1>
          <p className={styles.description}>Создавай и обучай своего ИИ-помощника</p>
          {!isTauri() ? (
            <p className={styles.demoNotice}>
              Браузерный демо-режим: регистрация создаёт ученический аккаунт только на этом устройстве.
            </p>
          ) : null}
        </header>

        <div className={styles.cardBody}>
          <form className={styles.form} onSubmit={handleSubmit}>
            {formError ? (
              <p className={styles.fieldLabel} style={{ color: "#c0392b" }}>
                {formError}
              </p>
            ) : null}
            <div className={styles.fieldGroup}>
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="email">
                  Эл. почта
                </label>
                <input
                  id="email"
                  className={styles.input}
                  type="email"
                  name="email"
                  autoComplete="username"
                  placeholder="pochta@shkola.ru"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={submitting}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="password">
                  Пароль
                </label>
                <input
                  id="password"
                  className={styles.input}
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  placeholder="Введите пароль"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={submitting}
                />
              </div>
            </div>

            <div className={styles.footerBlock}>
              <button type="submit" className={styles.submit} disabled={submitting}>
                {submitting ? "Подождите..." : "Войти"}
              </button>
              <p className={styles.signUpRow}>
                Нет аккаунта?{" "}
                <button
                  type="button"
                  className={styles.signUpLink}
                  onClick={() => void handleRegister()}
                  disabled={submitting}
                >
                  Зарегистрироваться
                </button>
              </p>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
