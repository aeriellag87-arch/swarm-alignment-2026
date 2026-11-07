/**
 * Whether a working `localStorage` is here to use.
 *
 * `typeof localStorage !== "undefined"` isn't enough: Node 25 defines a global
 * `localStorage` even without `--localstorage-file`, as an object with no
 * `getItem`/`setItem`, so a guard on the name alone calls into nothing during
 * SSR and tests. Checking for the methods covers both that and the browser.
 */
export function hasLocalStorage(): boolean {
  try {
    const ls = (globalThis as { localStorage?: Storage }).localStorage;
    return typeof ls?.getItem === "function" && typeof ls.setItem === "function";
  } catch {
    // Some browsers throw on access when site data is blocked.
    return false;
  }
}
