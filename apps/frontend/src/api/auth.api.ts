import api from '@/lib/api';

export interface LoginPayload {
  email: string;
  password: string;
  totpCode?: string;
}

export interface RegisterPayload {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone?: string;
}

export const authApi = {
  login: async (payload: LoginPayload) => {
    const res = await api.post('/auth/login', payload);
    return res.data;
  },

  register: async (payload: RegisterPayload) => {
    const res = await api.post('/auth/register', payload);
    return res.data;
  },

  logout: async () => {
    const res = await api.post('/auth/logout');
    return res.data;
  },

  getMe: async () => {
    const res = await api.get('/auth/me');
    return res.data;
  },

  forgotPassword: async (email: string) => {
    const res = await api.post('/auth/forgot-password', { email });
    return res.data;
  },

  resetPassword: async (token: string, password: string) => {
    const res = await api.post('/auth/reset-password', { token, password });
    return res.data;
  },

  changePassword: async (currentPassword: string, newPassword: string) => {
    const res = await api.post('/auth/change-password', { currentPassword, newPassword });
    return res.data;
  },

  setup2FA: async () => {
    const res = await api.post('/auth/2fa/setup');
    return res.data;
  },

  verify2FA: async (totpCode: string) => {
    const res = await api.post('/auth/2fa/verify', { totpCode });
    return res.data;
  },

  disable2FA: async (totpCode: string) => {
    const res = await api.post('/auth/2fa/disable', { totpCode });
    return res.data;
  },

  verifyEmail: async (token: string) => {
    const res = await api.get(`/auth/verify-email/${token}`);
    return res.data;
  },
};
