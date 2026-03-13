import api from '@/lib/api';

export const walletApi = {
  getWallet: async () => {
    const res = await api.get('/wallet');
    return res.data;
  },

  getTransactions: async (page = 1, limit = 20, type?: string) => {
    const params: any = { page, limit };
    if (type) params.type = type;
    const res = await api.get('/wallet/transactions', { params });
    return res.data;
  },

  fundWallet: async (amount: number) => {
    const res = await api.post('/wallet/fund', { amount });
    return res.data;
  },

  getInvoice: async (transactionId: string) => {
    // Fetches HTML invoice and opens in new tab with auth
    const response = await api.get(`/wallet/invoice/${transactionId}`, { responseType: 'blob' });
    const blob = new Blob([response.data], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  },
  getStatement: async (params?: { from?: string; to?: string; page?: number; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.from)  q.set('from', params.from);
    if (params?.to)    q.set('to', params.to);
    if (params?.page)  q.set('page', String(params.page));
    if (params?.limit) q.set('limit', String(params.limit));
    const { data } = await api.get(`/wallet/statement?${q.toString()}`);
    return data;
  },
  downloadStatement: async (from?: string, to?: string) => {
    const q = new URLSearchParams({ format: 'csv' });
    if (from) q.set('from', from);
    if (to)   q.set('to', to);
    const response = await api.get(`/wallet/statement?${q.toString()}`, { responseType: 'blob' });
    const url = URL.createObjectURL(response.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = `statement-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },
  verifyPayment: async (reference: string) => {
    const res = await api.get(`/wallet/verify/${reference}`);
    return res.data;
  },
};
