import apiClient from '@/lib/apiClient';

import { API_URL } from '@/lib/apiBase';

export const getMediaPlayerErrorMessage = (error) => {
  const message = String(error?.message || '');
  if (error?.code === '42501' || message.toLowerCase().includes('row-level security')) return 'Akses media player ditolak.';
  return message || 'Operasi media player gagal.';
};

export const uploadMusicFile = async ({ file, filePath }) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('path', filePath);
  const token = apiClient.getToken();
  const res = await fetch(`${API_URL}/api/upload/music`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'Upload musik gagal'); }
  const data = await res.json();
  return { path: data.path, publicUrl: `${API_URL}/files/music-files/${data.path}` };
};

export const fetchMusicFiles = async () => apiClient.get('/api/music-files');

export const addMusicFileRecord = async ({ title, artist, filename, storagePath, fileUrl }) => {
  return apiClient.post('/api/music-files', {
    title,
    artist: artist || 'Unknown Artist',
    filename,
    storage_path: storagePath,
    file_url: fileUrl,
  });
};

export const deleteMusicFile = async (id) => {
  await apiClient.put(`/api/music-files/${id}`, { is_active: false });
};

export const fetchOrInitMediaPlayerSettings = async (userId) => {
  if (!userId) return null;
  return apiClient.get(`/api/media-player-settings/${userId}`);
};

export const syncPlaybackState = async (id, { position, isPlaying }) => {
  await apiClient.put(`/api/media-player-settings/${id}`, {
    playback_position: Math.floor(position),
    is_playing: isPlaying,
    updated_at: new Date().toISOString(),
  });
};

export const updatePlaybackPosition = async (id, position) => {
  await apiClient.put(`/api/media-player-settings/${id}`, { playback_position: Math.floor(position) });
};

export const updateShuffleEnabled = async (id, enabled) => {
  await apiClient.put(`/api/media-player-settings/${id}`, { shuffle_enabled: enabled });
};
