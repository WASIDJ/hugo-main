/** Accept an explicit private HTTPS origin, never credentials or URL tokens. */
export function sshPortalOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      return null;
    return url.origin;
  } catch {
    return null;
  }
}
export const sshPortalStorageKey = "ryou-private-ssh-origin";
