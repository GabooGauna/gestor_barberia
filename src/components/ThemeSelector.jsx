import { useEffect, useId, useState } from "react";

const THEME_KEY = "gestor-tema";
const THEMES = ["light", "dark", "system"];
const THEME_OPTIONS = [
  { value: "light", label: "Claro", icon: "sun" },
  { value: "dark", label: "Oscuro", icon: "moon" },
  { value: "system", label: "Sistema", icon: "system" },
];

function readTheme() {
  try {
    const storedTheme = localStorage.getItem(THEME_KEY);
    return THEMES.includes(storedTheme) ? storedTheme : "system";
  } catch {
    return "system";
  }
}

function resolveTheme(preference) {
  if (preference === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return preference;
}

function applyTheme(preference) {
  const resolved = resolveTheme(preference);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.style.colorScheme = resolved;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", resolved === "dark" ? "#111417" : "#253340");
}

function ThemeIcon({ name }) {
  if (name === "sun") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="3.5" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    );
  }

  if (name === "moon") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M20 15.3A8.5 8.5 0 0 1 8.7 4a8.5 8.5 0 1 0 11.3 11.3Z" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

export default function ThemeSelector() {
  const [theme, setTheme] = useState(readTheme);
  const groupName = useId();

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // La preferencia sigue activa durante la sesión aunque storage no esté disponible.
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const syncSystemTheme = () => {
      if (theme === "system") applyTheme(theme);
    };
    media.addEventListener("change", syncSystemTheme);
    return () => media.removeEventListener("change", syncSystemTheme);
  }, [theme]);

  return (
    <fieldset className="theme-selector">
      <legend>Apariencia</legend>
      <div className="theme-selector__options">
        {THEME_OPTIONS.map((option) => (
          <label
            key={option.value}
            className="theme-option"
            title={`Usar tema ${option.label.toLowerCase()}`}
          >
            <input
              type="radio"
              name={`theme-preference-${groupName}`}
              value={option.value}
              checked={theme === option.value}
              onChange={() => setTheme(option.value)}
            />
            <ThemeIcon name={option.icon} />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

