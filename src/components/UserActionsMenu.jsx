import { useEffect, useId, useRef, useState } from "react";
import ThemeSelector from "./ThemeSelector";

function MenuIcon({ mobile }) {
  if (mobile) {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M4 7h16M4 12h16M4 17h16" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7 8a7 7 0 0 0-14 0" />
    </svg>
  );
}

export default function UserActionsMenu({ usuario, onLogout, mobile = false }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return undefined;

    const previousFocus = triggerRef.current;
    const focusTimer = window.requestAnimationFrame(() => {
      const selectedTheme = menuRef.current?.querySelector("input:checked");
      (selectedTheme || menuRef.current)?.focus();
    });

    const closeOnEscape = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      window.requestAnimationFrame(() => previousFocus?.focus());
    };

    const closeOutside = (event) => {
      if (
        menuRef.current?.contains(event.target) ||
        triggerRef.current?.contains(event.target)
      ) return;
      setOpen(false);
    };

    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOutside);
    return () => {
      window.cancelAnimationFrame(focusTimer);
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOutside);
    };
  }, [open]);

  return (
    <div className={`user-menu ${mobile ? "user-menu--mobile" : "user-menu--desktop"}`}>
      <button
        ref={triggerRef}
        type="button"
        className="user-menu__trigger"
        aria-label={open ? "Cerrar menú de acciones" : "Abrir menú de acciones"}
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((current) => !current)}
      >
        <MenuIcon mobile={mobile} />
      </button>

      {open && (
        <div
          ref={menuRef}
          id={menuId}
          className="user-menu__panel"
          role="dialog"
          aria-label="Cuenta y apariencia"
          tabIndex="-1"
        >
          <div className="user-menu__identity">
            <span className="user-menu__name">{usuario?.nombre || "Usuario"}</span>
            <span className="user-menu__role">{usuario?.rol || "Sin rol"}</span>
          </div>

          <ThemeSelector />

          <button
            type="button"
            className="user-menu__logout"
            onClick={onLogout}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24">
              <path d="M10 5H5v14h5M14 8l4 4-4 4M8 12h10" />
            </svg>
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}
