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

import { useEffect } from "react";
import { useAuthActions } from "@convex-dev/auth/react";

// Dedicated sign-out route — Notesnook's existing logout() only clears the
// Streetwriters session, not Convex Auth. Until the in-app user menu is
// wired to call both, navigate here to end a session cleanly.
export default function SignOut() {
  const { signOut } = useAuthActions();
  useEffect(() => {
    signOut().finally(() => window.location.replace("/signin"));
  }, [signOut]);
  return (
    <div
      style={{
        maxWidth: 360,
        margin: "80px auto",
        padding: "0 20px",
        fontFamily: "system-ui, sans-serif"
      }}
    >
      Signing out…
    </div>
  );
}
