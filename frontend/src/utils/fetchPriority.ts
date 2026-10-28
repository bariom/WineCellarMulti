/**
 * React 18 does not know the camel-case `fetchPriority` prop and warns on every
 * render; the browser reads the lowercase `fetchpriority` attribute. Spread this
 * on an <img> instead (drop it once the app moves to React 19).
 */
export const highFetchPriority = { fetchpriority: "high" } as Record<string, string>;
