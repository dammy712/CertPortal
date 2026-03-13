import api from '@/lib/api';

export const certificateApi = {
  getProducts: async () => {
    const res = await api.get('/certificates/products');
    return res.data;
  },

  getProductById: async (id: string) => {
    const res = await api.get(`/certificates/products/${id}`);
    return res.data;
  },

  decodeCSR: async (csr: string) => {
    const res = await api.post('/certificates/decode-csr', { csr });
    return res.data;
  },

  createOrder: async (data: any) => {
    const res = await api.post('/certificates/orders', data);
    return res.data;
  },

  getOrders: async (params?: any) => {
    const res = await api.get('/certificates/orders', { params });
    return res.data;
  },

  getOrderById: async (id: string) => {
    const res = await api.get(`/certificates/orders/${id}`);
    return res.data;
  },

  cancelOrder: async (id: string) => {
    const res = await api.post(`/certificates/orders/${id}/cancel`);
    return res.data;
  },

  // Issued certificates
  listIssuedCertificates: async (params?: any) => {
    const res = await api.get('/issued-certificates', { params });
    return res.data;
  },

  getCertificateByOrder: async (orderId: string) => {
    const res = await api.get(`/issued-certificates/order/${orderId}`);
    return res.data;
  },

  downloadCertificate: async (certId: string, type: 'cert' | 'chain' | 'fullchain') => {
    const res = await api.get(`/issued-certificates/${certId}/download`, { params: { type } });
    return res.data;
  },
};
