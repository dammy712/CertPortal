import api from '@/lib/api';

export const validationApi = {
  initialize: async (orderId: string, method: string, validationEmail?: string) => {
    const res = await api.post('/validations/initialize', { orderId, method, validationEmail });
    return res.data;
  },

  getByOrder: async (orderId: string) => {
    const res = await api.get(`/validations/order/${orderId}`);
    return res.data;
  },

  check: async (validationId: string) => {
    const res = await api.post(`/validations/${validationId}/check`);
    return res.data;
  },
};
