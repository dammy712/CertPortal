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

  // Poll Certum immediately for the latest status on a pending order
  checkCAStatus: async (orderId: string) => {
    const res = await api.post(`/issued-certificates/check-status/${orderId}`);
    return res.data;
  },

  // List all issued certificates for the current user
  listIssuedCertificates: async (params?: any) => {
    const res = await api.get('/issued-certificates', { params });
    return res.data;
  },

  // Get certificate by order ID
  getCertificateByOrder: async (orderId: string) => {
    const res = await api.get(`/issued-certificates/order/${orderId}`);
    return res.data;
  },

  // Download certificate — streams file and triggers browser save dialog
  downloadCertificate: async (certId: string, type: 'cert' | 'chain' | 'fullchain') => {
    const response = await api.get(`/issued-certificates/${certId}/download`, {
      params: { type },
      responseType: 'blob',
    });
    const url  = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href  = url;
    const disposition = response.headers['content-disposition'] || '';
    const match = disposition.match(/filename="?([^"]+)"?/);
    link.download = match ? match[1] : `certificate-${type}.crt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  },
};