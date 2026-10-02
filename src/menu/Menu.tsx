import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

interface MenuBarContextValue {
  openMenu: string | null;
  setOpenMenu: (id: string | null) => void;
}

const MenuBarContext = createContext<MenuBarContextValue | null>(null);

function useMenuBarContext(): MenuBarContextValue {
  const ctx = useContext(MenuBarContext);
  if (!ctx) throw new Error("Menu components must be rendered inside <MenuBar>");
  return ctx;
}

/**
 * Section 8's menu bar: five top-level menus, drawn in React (not the native Windows menu) so
 * it stays inside the app's own neumorphic design language. A click outside, or Escape,
 * closes whatever menu is open; only one top-level menu is open at a time.
 */
export function MenuBar({ children }: { children: ReactNode }) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpenMenu(null);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenMenu(null);
    }
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <MenuBarContext.Provider value={{ openMenu, setOpenMenu }}>
      <div ref={rootRef} role="menubar" className="raised relative flex gap-1 rounded-lg p-1 text-xs">
        {children}
      </div>
    </MenuBarContext.Provider>
  );
}

/** Exposes open/close to callers outside the tree — used for Alt+letter mnemonics (section 8). */
export function useMenuBarControl() {
  return useMenuBarContext();
}

// View is on "w" rather than "v": Alt+V is Guitar Pro's wide-vibrato shortcut and must reach the editor.
const MNEMONICS: Record<string, string> = { f: "file", e: "edit", n: "note", b: "bar", w: "view", h: "help" };

/**
 * Section 8: "Alt tuşu ile menü klavyeden açılır (Alt+F dosya menüsü, vb.)". Mnemonics stay
 * pinned to the English initials regardless of the active UI language, matching the spec's
 * own example. Render this once as a child of <MenuBar>; it has no visual output.
 */
export function MenuBarAltKeys() {
  const { setOpenMenu } = useMenuBarContext();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!event.altKey || event.ctrlKey || event.metaKey) return;
      const id = MNEMONICS[event.key.toLowerCase()];
      if (!id) return;
      event.preventDefault();
      setOpenMenu(id);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setOpenMenu]);

  return null;
}

interface MenuRootProps {
  id: string;
  label: string;
  children: ReactNode;
  /** Disables the whole top-level menu at once (section 17's read-only lock: the Note menu is entirely mutating actions). */
  disabled?: boolean;
  disabledReason?: string;
}

export function MenuRoot({ id, label, children, disabled, disabledReason }: MenuRootProps) {
  const { openMenu, setOpenMenu } = useMenuBarContext();
  const isOpen = !disabled && openMenu === id;

  return (
    <div className="relative">
      <button
        type="button"
        role="menuitem"
        aria-haspopup="true"
        aria-expanded={isOpen}
        disabled={disabled}
        title={disabled ? disabledReason : undefined}
        onClick={() => {
          if (disabled) return;
          setOpenMenu(isOpen ? null : id);
        }}
        onMouseEnter={() => {
          if (disabled) return;
          if (openMenu !== null) setOpenMenu(id);
        }}
        className={`${isOpen ? "inset" : ""} rounded px-2 py-1`}
        style={{
          color: disabled ? "var(--label)" : isOpen ? "var(--accent)" : "var(--control-text)",
          border: isOpen ? "1px solid var(--accent)" : "1px solid transparent",
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? "default" : "pointer",
        }}
      >
        {label}
      </button>
      {isOpen ? (
        <div
          role="menu"
          className="raised absolute left-0 top-full z-30 mt-1 flex min-w-60 flex-col gap-0.5 rounded-lg p-1"
          style={{ background: "var(--body)" }}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

interface MenuItemProps {
  label: string;
  shortcut?: string;
  onClick?: () => void;
  disabled?: boolean;
  disabledReason?: string;
  checked?: boolean;
}

/** A leaf menu entry. Disabled items stay visible but pale, with the reason on hover (section 8). */
export function MenuItem({ label, shortcut, onClick, disabled, disabledReason, checked }: MenuItemProps) {
  const { setOpenMenu } = useMenuBarContext();
  const [hover, setHover] = useState(false);

  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      title={disabled ? disabledReason : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => {
        onClick?.();
        setOpenMenu(null);
      }}
      className={`${hover && !disabled ? "inset" : ""} flex min-h-[28px] items-center justify-between gap-4 rounded px-2 py-1 text-left`}
      style={{
        color: disabled ? "var(--label)" : checked ? "var(--accent)" : "var(--control-text)",
        opacity: disabled ? 0.5 : 1,
        border: checked ? "1px solid var(--accent)" : "1px solid transparent",
        cursor: disabled ? "default" : "pointer",
      }}
    >
      <span>{label}</span>
      {shortcut ? (
        <span className="font-mono" style={{ color: "var(--label)", fontSize: "10px" }}>
          {shortcut}
        </span>
      ) : null}
    </button>
  );
}

export function MenuSeparator() {
  return <div role="separator" className="my-1 h-px" style={{ background: "var(--body-edge)" }} />;
}

/** A nested flyout (Recent files, Duration, Bend, Slide, Measures per line, Theme, Language). */
export function MenuSubmenu({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);

  return (
    <div className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        role="menuitem"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className={`${hover ? "inset" : ""} flex min-h-[28px] w-full items-center justify-between gap-4 rounded px-2 py-1 text-left`}
        style={{ color: "var(--control-text)" }}
      >
        <span>{label}</span>
        <span style={{ color: "var(--label)" }}>▸</span>
      </button>
      {open ? (
        <div
          role="menu"
          className="raised absolute left-full top-0 z-40 ml-1 flex max-h-80 min-w-52 flex-col gap-0.5 overflow-auto rounded-lg p-1"
          style={{ background: "var(--body)" }}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
