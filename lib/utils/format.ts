export const formatDateTime = (value?: string | null) => {
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  return date.toLocaleString();
};

export const formatDuration = (seconds?: number | null) => {
  if (!seconds || seconds <= 0) {
    return '-';
  }
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins <= 0) {
    return `${secs}s`;
  }
  return `${mins}m ${secs}s`;
};

export const truncateId = (value: string, length = 8) => {
  if (value.length <= length * 2) {
    return value;
  }
  return `${value.slice(0, length)}...${value.slice(-length)}`;
};

export const isUuid = (value: string) =>
  /^[0-9a-fA-F-]{36}$/.test(value.trim());
