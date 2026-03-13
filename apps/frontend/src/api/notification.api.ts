import api from '@/lib/api';

export const notificationApi = {
  getAll: async (params?: { page?: number; limit?: number; unread?: boolean }) => {
    const res = await api.get('/notifications', { params });
    return res.data;
  },

  getUnreadCount: async () => {
    const res = await api.get('/notifications/unread-count');
    return res.data;
  },

  markAsRead: async (id: string) => {
    const res = await api.patch(`/notifications/${id}/read`);
    return res.data;
  },

  markAllAsRead: async () => {
    const res = await api.post('/notifications/mark-all-read');
    return res.data;
  },

  delete: async (id: string) => {
    const res = await api.delete(`/notifications/${id}`);
    return res.data;
  },

  clearRead: async () => {
    const res = await api.delete('/notifications/clear-read');
    return res.data;
  },
};
