import api from '@/lib/api';

export const kycApi = {
  getStatus: async () => {
    const res = await api.get('/kyc/status');
    return res.data;
  },

  uploadDocument: async (documentType: string, file: File) => {
    const formData = new FormData();
    formData.append('document', file);
    formData.append('documentType', documentType);
    const res = await api.post('/kyc/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },

  getDocumentUrl: async (id: string) => {
    const res = await api.get(`/kyc/documents/${id}/url`);
    return res.data;
  },

  deleteDocument: async (id: string) => {
    const res = await api.delete(`/kyc/documents/${id}`);
    return res.data;
  },

  // Admin
  getAdminQueue: async (params?: any) => {
    const res = await api.get('/kyc/admin/queue', { params });
    return res.data;
  },

  reviewDocument: async (id: string, decision: 'APPROVED' | 'REJECTED', note?: string) => {
    const res = await api.post(`/kyc/admin/documents/${id}/review`, { decision, note });
    return res.data;
  },
};
