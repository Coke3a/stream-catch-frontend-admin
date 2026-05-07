import { buildBackendUrl } from '@/lib/api/backend';

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
    buildBackendUrl(`/api/v1/admin/recordings/${recordingId}/watch-url`),
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
