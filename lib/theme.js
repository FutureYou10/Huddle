// Applies a theme choice ("system" | "light" | "dark") to the document and
// caches it in localStorage so the next page load can apply it before the
// profile fetch resolves (avoids a flash of the wrong theme). "system" means
// "no override" — globals.css's prefers-color-scheme media query decides.
export function applyTheme(theme) {
  if (typeof document === "undefined") return;
  const value = theme === "light" || theme === "dark" ? theme : null;
  if (value) {
    document.documentElement.setAttribute("data-theme", value);
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
  try {
    if (value) localStorage.setItem("huddle-theme", value);
    else localStorage.removeItem("huddle-theme");
  } catch {
    // Private windows / blocked storage — the attribute above still applied
    // for this load, it just won't be remembered for the next one.
  }
}
