const PRODUCTION_AUTH_REDIRECT_URL = 'https://imtjls3t.github.io/foodislife/';

export function getAuthRedirectUrl() {
  const configuredRedirectUrl = import.meta.env.VITE_AUTH_REDIRECT_URL?.trim();
  if (configuredRedirectUrl) return configuredRedirectUrl;

  if (import.meta.env.PROD) return PRODUCTION_AUTH_REDIRECT_URL;

  return new URL(import.meta.env.BASE_URL, window.location.origin).href;
}
