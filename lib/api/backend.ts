import { APP_CONFIG } from '@/config/app';

const MISSING_BACKEND_BASE_URL_MESSAGE =
  'Missing NEXT_PUBLIC_BACKEND_BASE_URL. Set it in admin/.env.local and restart the admin dev server.';

const normalizeBackendBaseUrl = (value: string) => value.replace(/\/+$/, '');

export const getBackendBaseUrl = () => {
  const backendBaseUrl = APP_CONFIG.backendBaseUrl?.trim();

  if (!backendBaseUrl) {
    throw new Error(MISSING_BACKEND_BASE_URL_MESSAGE);
  }

  return normalizeBackendBaseUrl(backendBaseUrl);
};

export const buildBackendUrl = (path: string) => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  return `${getBackendBaseUrl()}${normalizedPath}`;
};
