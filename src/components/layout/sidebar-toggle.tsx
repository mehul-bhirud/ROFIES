"use client";

import { useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

export function SidebarToggle() {
  const [collapsed, setCollapsed] = useState(false);

  function toggle() {
    setCollapsed((current) => {
      const next = !current;
      document.documentElement.classList.toggle("sidebar-collapsed", next);
      return next;
    });
  }

  return (
    <button
      type="button"
      className="sidebar-toggle"
      onClick={toggle}
      aria-label={collapsed ? "Show sidebar" : "Hide sidebar"}
      aria-expanded={!collapsed}
    >
      {collapsed ? (
        <PanelLeftOpen size={18} aria-hidden="true" />
      ) : (
        <PanelLeftClose size={18} aria-hidden="true" />
      )}
    </button>
  );
}
