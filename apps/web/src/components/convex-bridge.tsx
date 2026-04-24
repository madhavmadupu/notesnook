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
import { useQuery } from "convex/react";
import {
  SubscriptionPlan,
  SubscriptionProvider,
  SubscriptionStatus,
  User
} from "@notesnook/core";
import { api } from "../common/convex";
import { db } from "../common/db";
import { useStore as useUserStore } from "../stores/user-store";

// Writes the Convex-authenticated identity into Notesnook's local KV as the
// "current user" so the existing user store / profile UI / settings all
// report logged-in. This stays local — no Streetwriters API contact.
//
// Retries until the local DB is ready (it's initialized in parallel with
// this component mounting).
export function BridgeConvexIdentity() {
  const me = useQuery(api.users.currentUser);
  useEffect(() => {
    if (!me || !me.email) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function attempt() {
      if (cancelled || !me) return;
      try {
        const syntheticId = `convex:${me._id}`;
        const existing = await db.user.getUser();
        if (existing?.id === syntheticId) return; // already bridged
        await db.user.setUser(buildSyntheticUser(syntheticId, me.email!));
        if (cancelled) return;
        await useUserStore.getState().init();
      } catch {
        // DB probably not ready yet — retry shortly.
        if (!cancelled) timer = setTimeout(attempt, 200);
      }
    }

    attempt();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [me]);

  return null;
}

function buildSyntheticUser(id: string, email: string): User {
  // Most fields are zero/defaults — Notesnook's local UI reads email/id
  // plus subscription.plan/status. Everything else the old auth flow
  // populated is irrelevant when sync is off. Cast to User to skip fields
  // that don't apply (attachmentsKey, monographPasswordsKey, etc.).
  return {
    id,
    email,
    isEmailConfirmed: true,
    salt: "",
    mfa: {
      isEnabled: false,
      primaryMethod: "app",
      remainingValidCodes: 0
    },
    subscription: {
      appId: 0,
      cancelURL: null,
      expiry: 0,
      productId: null,
      provider: SubscriptionProvider.STREETWRITERS,
      start: 0,
      plan: SubscriptionPlan.FREE,
      status: SubscriptionStatus.ACTIVE
    }
  } as unknown as User;
}
