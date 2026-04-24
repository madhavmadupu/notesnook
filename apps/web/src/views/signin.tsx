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

import { FormEvent, useState } from "react";
import {
  ConvexAuthProvider,
  useAuthActions
} from "@convex-dev/auth/react";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { convex, isConvexConfigured } from "../common/convex";

// Minimal standalone Convex Auth screen used while the rest of the
// Notesnook UI still runs on the (broken) Streetwriters auth flow.
// App-wide wiring (route guards, persistent session, user store) lands
// in M3c. This view only proves end-to-end: signup → signin → signout.
export default function SignIn() {
  if (!convex || !isConvexConfigured) return <MissingConvexUrl />;
  return (
    <ConvexAuthProvider client={convex}>
      <AuthLoading>
        <Centered>Loading…</Centered>
      </AuthLoading>
      <Unauthenticated>
        <SignInForm />
      </Unauthenticated>
      <Authenticated>
        <SignedInPlaceholder />
      </Authenticated>
    </ConvexAuthProvider>
  );
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

function SignedInPlaceholder() {
  const { signOut } = useAuthActions();
  return (
    <Centered>
      <h1>Signed in</h1>
      <p style={{ color: "#666" }}>
        Convex Auth session established. Notesnook app wiring still pending —
        the main app doesn&apos;t consume this session yet.
      </p>
      <button type="button" onClick={() => signOut()} style={primaryButtonStyle}>
        Sign out
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
