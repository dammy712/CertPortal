import api from '@/lib/api';

export const profileApi = {
  getProfile: async () => {
    const res = await api.get('/profile');
    return res.data;
  },

  updateProfile: async (data: { firstName?: string; lastName?: string; phone?: string; timezone?: string }) => {
    const res = await api.patch('/profile', data);
    return res.data;
  },

  changePassword: async (currentPassword: string, newPassword: string) => {
    const res = await api.post('/profile/change-password', { currentPassword, newPassword });
    return res.data;
  },

  updatePreferences: async (data: { darkMode?: boolean; timezone?: string }) => {
    const res = await api.patch('/profile/preferences', data);
    return res.data;
  },

  getSessions: async () => {
    const res = await api.get('/profile/sessions');
    return res.data;
  },

  revokeSession: async (id: string) => {
    const res = await api.delete(`/profile/sessions/${id}`);
    return res.data;
  },

  revokeAllSessions: async () => {
    const res = await api.delete('/profile/sessions');
    return res.data;
  },

  changeEmail: async (newEmail: string, currentPassword: string) => {
    const res = await api.post('/profile/change-email', { newEmail, currentPassword });
    return res.data;
  },
};
