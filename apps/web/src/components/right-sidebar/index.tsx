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

import { useMemo, useState } from "react";
import { Box, Button, Flex, Input, Text } from "@theme-ui/components";
import { ScopedThemeProvider } from "../theme-provider";
import { useStore as useAppStore } from "../../stores/app-store";
import { Calendar, Close, Icon, Robot } from "../icons";
import { DayPicker } from "../day-picker";
import { useWindowControls } from "../../hooks/use-window-controls";
import { isMac } from "../../utils/platform";
import useMobile from "../../hooks/use-mobile";
import useTablet from "../../hooks/use-tablet";

type RightSidebarTab = {
  id: string;
  title: string;
  icon: Icon;
  render: () => JSX.Element;
};

const TABS: RightSidebarTab[] = [
  {
    id: "calendar",
    title: "Calendar",
    icon: Calendar,
    render: () => <CalendarPanel />
  },
  {
    id: "ai",
    title: "AI Assistant",
    icon: Robot,
    render: () => <AIPanel />
  }
];

export function RightSidebar() {
  const activeTabId = useAppStore((s) => s.rightSidebarTab);
  const setRightSidebarTab = useAppStore((s) => s.setRightSidebarTab);
  const toggleRightSidebar = useAppStore((s) => s.toggleRightSidebar);
  const { isFullscreen, hasNativeWindowControls } = useWindowControls();
  const isMobile = useMobile();
  const isTablet = useTablet();
  const needsWindowControlsSpace =
    hasNativeWindowControls &&
    !isMac() &&
    !isFullscreen &&
    !isMobile &&
    !isTablet;

  const activeTab =
    TABS.find((t) => t.id === activeTabId) ?? TABS[0];

  return (
    <ScopedThemeProvider
      scope="list"
      className="right-sidebar"
      sx={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        bg: "background",
        borderLeft: "1px solid var(--separator)",
        overflow: "hidden"
      }}
    >
      <Flex
        sx={{
          alignItems: "center",
          justifyContent: "space-between",
          pl: 2,
          py: 1,
          pr: needsWindowControlsSpace
            ? `calc(100vw - env(titlebar-area-width) + 8px)`
            : 2,
          borderBottom: "1px solid var(--separator)",
          flexShrink: 0,
          gap: 1
        }}
      >
        <Flex sx={{ alignItems: "center", gap: 1, minWidth: 0 }}>
          <activeTab.icon size={14} color="accent" />
          <Text
            variant="subtitle"
            sx={{
              fontSize: "body",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis"
            }}
          >
            {activeTab.title}
          </Text>
        </Flex>
        <Flex sx={{ alignItems: "center", gap: "2px", flexShrink: 0 }}>
          {TABS.map((tab) => {
            const isActive = tab.id === activeTab.id;
            return (
              <Button
                key={tab.id}
                variant="secondary"
                onClick={() => setRightSidebarTab(tab.id)}
                title={tab.title}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 28,
                  height: 28,
                  p: 0,
                  bg: isActive ? "background-selected" : "transparent",
                  borderRadius: "default",
                  ":hover": { bg: "hover" }
                }}
              >
                <tab.icon size={14} color={isActive ? "accent" : undefined} />
              </Button>
            );
          })}
          <Button
            variant="secondary"
            onClick={() => toggleRightSidebar(false)}
            title="Close sidebar"
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 28,
              height: 28,
              p: 0,
              ml: 1,
              bg: "transparent",
              ":hover": { bg: "hover" }
            }}
          >
            <Close size={14} />
          </Button>
        </Flex>
      </Flex>
      <Box sx={{ flex: 1, overflow: "auto" }}>{activeTab.render()}</Box>
    </ScopedThemeProvider>
  );
}

function CalendarPanel() {
  const [selected, setSelected] = useState(new Date());
  const formatted = useMemo(
    () =>
      selected.toLocaleDateString(undefined, {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
      }),
    [selected]
  );
  return (
    <Flex sx={{ flexDirection: "column", p: 2, gap: 2 }}>
      <DayPicker selected={selected} onSelect={setSelected} />
      <Box
        sx={{
          borderTop: "1px solid var(--separator)",
          pt: 2
        }}
      >
        <Text variant="subtitle" sx={{ display: "block", mb: 1 }}>
          Selected
        </Text>
        <Text variant="body" sx={{ color: "paragraph" }}>
          {formatted}
        </Text>
      </Box>
    </Flex>
  );
}

type ChatMessage = { role: "user" | "assistant"; text: string };

function AIPanel() {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setMessages((m) => [
      ...m,
      { role: "user", text },
      {
        role: "assistant",
        text: "AI assistant is not connected yet. Wire this up to your provider of choice."
      }
    ]);
    setDraft("");
  };

  return (
    <Flex sx={{ flexDirection: "column", height: "100%" }}>
      <Box sx={{ flex: 1, overflow: "auto", p: 2 }}>
        {messages.length === 0 ? (
          <Flex
            sx={{
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "paragraph-secondary",
              textAlign: "center",
              gap: 1
            }}
          >
            <Robot size={32} />
            <Text variant="subtitle">AI Assistant</Text>
            <Text variant="body" sx={{ color: "paragraph-secondary" }}>
              Ask questions about your notes. (Backend not wired up yet.)
            </Text>
          </Flex>
        ) : (
          <Flex sx={{ flexDirection: "column", gap: 2 }}>
            {messages.map((m, i) => (
              <Box
                key={i}
                sx={{
                  alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                  maxWidth: "85%",
                  bg:
                    m.role === "user" ? "background-selected" : "background",
                  border: "1px solid var(--separator)",
                  borderRadius: "default",
                  px: 2,
                  py: 1
                }}
              >
                <Text variant="body">{m.text}</Text>
              </Box>
            ))}
          </Flex>
        )}
      </Box>
      <Flex
        sx={{
          borderTop: "1px solid var(--separator)",
          p: 2,
          gap: 1,
          flexShrink: 0
        }}
      >
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Ask anything…"
          sx={{ flex: 1 }}
        />
        <Button variant="accent" onClick={send} disabled={!draft.trim()}>
          Send
        </Button>
      </Flex>
    </Flex>
  );
}

export default RightSidebar;
