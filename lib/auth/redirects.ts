const AUTH_REDIRECT_PATHS = new Set(["/me", "/printer", "/printer/onboarding"]);

export function getAuthRedirectPath(
  value: string | string[] | undefined,
  fallback = "/me",
): string {
  const path = Array.isArray(value) ? value[0] : value;
  return path && AUTH_REDIRECT_PATHS.has(path) ? path : fallback;
}
