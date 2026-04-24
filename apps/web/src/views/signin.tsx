/*
This file is part of the Notesnook project (https://notesnook.com/)

Copyright (C) 2023 Streetwriters (Private) Limited

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

import { FormEvent, useEffect, useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { isConvexConfigured } from "../common/convex";

// Convex Auth screen. The ConvexAuthProvider is mounted one level up in
// root.tsx so `Authenticated`/`Unauthenticated`/`useAuthActions` work here
// without an inner provider.
export default function SignIn() {
  if (!isConvexConfigured) return <MissingConvexUrl />;
  return (
    <>
      <AuthLoading>
        <Centered>Loading…</Centered>
      </AuthLoading>
      <Unauthenticated>
        <SignInForm />
      </Unauthenticated>
      <Authenticated>
        <RedirectToApp />
      </Authenticated>
    </>
  );
}

function RedirectToApp() {
  // After successful signup / signin, kick into the main app. The authenticated
  // session is stored in localStorage by Convex Auth and is picked up by the
  // AuthGate wrapper in root.tsx on the next page load.
  useEffect(() => {
    window.location.replace("/");
  }, []);
  return <Centered>Signed in. Loading app…</Centered>;
}

function SignInForm() {
  const { signIn } = useAuthActions();
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signIn("password", { email, password, flow: mode });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Centered>
      <h1 style={{ marginBottom: 8 }}>
        {mode === "signUp" ? "Create account" : "Sign in"}
      </h1>
      <p style={{ color: "#666", marginTop: 0, marginBottom: 24 }}>
        Convex Auth · this fork replaces the Streetwriters auth flow.
      </p>
      <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 4 }}>
          <span>Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
            autoComplete="email"
          />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span>Password</span>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
            autoComplete={
              mode === "signUp" ? "new-password" : "current-password"
            }
          />
        </label>
        {error && (
          <div style={{ color: "crimson", fontSize: 14 }}>{error}</div>
        )}
        <button type="submit" disabled={busy} style={primaryButtonStyle}>
          {busy ? "…" : mode === "signUp" ? "Create account" : "Sign in"}
        </button>
      </form>
      <button
        type="button"
        onClick={() => setMode(mode === "signIn" ? "signUp" : "signIn")}
        style={linkButtonStyle}
      >
        {mode === "signIn"
          ? "Need an account? Sign up"
          : "Have an account? Sign in"}
      </button>
    </Centered>
  );
}

function MissingConvexUrl() {
  return (
    <Centered>
      <h1>Convex URL not configured</h1>
      <p style={{ color: "#666" }}>
        Set <code>NN_CONVEX_URL</code> in <code>apps/web/.env.local</code> to
        your Convex deployment URL (see <code>servers/convex/.env.local</code>)
        and restart the dev server.
      </p>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        maxWidth: 360,
        margin: "80px auto",
        padding: "0 20px",
        fontFamily: "system-ui, sans-serif"
      }}
    >
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid #ccc",
  borderRadius: 6,
  fontSize: 14,
  boxSizing: "border-box"
};

const primaryButtonStyle: React.CSSProperties = {
  padding: "10px 16px",
  background: "#2563eb",
  color: "white",
  border: "none",
  borderRadius: 6,
  fontSize: 14,
  cursor: "pointer"
};

const linkButtonStyle: React.CSSProperties = {
  marginTop: 16,
  padding: 0,
  background: "transparent",
  border: "none",
  color: "#2563eb",
  cursor: "pointer",
  textDecoration: "underline",
  fontSize: 14
};
