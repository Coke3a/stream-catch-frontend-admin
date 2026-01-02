import { APP_CONFIG } from '@/config/app';

export type AdminWatchUrlResponse = {
  recording_id: string;
  url: string;
  expires_at: string;
};

const buildHeaders = (accessToken: string) => ({
  Authorization: `Bearer ${accessToken}`,
});

export const fetchAdminWatchUrl = async (
  recordingId: string,
  accessToken: string
) => {
  const response = await fetch(
    `${APP_CONFIG.backendBaseUrl}/api/v1/admin/recordings/${recordingId}/watch-url`,
    {
      headers: buildHeaders(accessToken),
    }
  );

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Failed to load watch URL');
  }

  return (await response.json()) as AdminWatchUrlResponse;
};
