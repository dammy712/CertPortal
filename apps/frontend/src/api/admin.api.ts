import api from '@/lib/api';

export const adminApi = {
  getStats: () => api.get('/admin/stats').then(r => r.data),

  // Users
  getUsers: (params?: Record<string, any>) => api.get('/admin/users', { params }).then(r => r.data),
  getUserDetail: (id: string) => api.get(`/admin/users/${id}`).then(r => r.data),
  updateUserStatus: (id: string, status: string) => api.patch(`/admin/users/${id}/status`, { status }).then(r => r.data),
  updateUserRole: (id: string, role: string) => api.patch(`/admin/users/${id}/role`, { role }).then(r => r.data),
  adjustWallet: (id: string, amount: number, note: string) => api.post(`/admin/users/${id}/wallet/adjust`, { amount, note }).then(r => r.data),

  // KYC
  getKyc: (params?: Record<string, any>) => api.get('/admin/kyc', { params }).then(r => r.data),
  getKycDoc: (id: string) => api.get(`/admin/kyc/${id}`).then(r => r.data),
  getKycFileUrl: (id: string) => `${api.defaults.baseURL}/admin/kyc/${id}/serve`,
  reviewKyc: (id: string, action: string, reviewNotes?: string) => api.post(`/admin/kyc/${id}/review`, { action, reviewNotes }).then(r => r.data),

  // Orders
  getOrders: (params?: Record<string, any>) => api.get('/admin/orders', { params }).then(r => r.data),

  // Certificates
  getCertificates: (params?: Record<string, any>) => api.get('/admin/certificates', { params }).then(r => r.data),
  revokeCertificate: (id: string, reason: string) => api.post(`/admin/certificates/${id}/revoke`, { reason }).then(r => r.data),

  // Audit
  getAuditLogs: (params?: Record<string, any>) => api.get('/admin/audit-logs', { params }).then(r => r.data),
  // Invoice settings (Module 22)
  getInvoiceSettings: () => api.get('/settings/invoice').then(r => r.data),
  saveInvoiceSettings: (data: any) => api.put('/settings/invoice', data).then(r => r.data),

  // Order management (Module 20)
  getOrderDetail:    (id: string) => api.get(`/admin/orders/${id}`).then(r => r.data),
  updateOrderStatus: (id: string, status: string) => api.patch(`/admin/orders/${id}/status`, { status }).then(r => r.data),
  adminIssueOrder:   (id: string) => api.post(`/admin/orders/${id}/issue`).then(r => r.data),

  // Analytics (Module 17)
  getRevenueChart:       (period?: 'week' | 'month' | 'year') => api.get('/admin/analytics/revenue', { params: { period } }).then(r => r.data),
  getProductBreakdown:   () => api.get('/admin/analytics/products').then(r => r.data),
  getOrderStatusBreakdown: () => api.get('/admin/analytics/order-status').then(r => r.data),
  getGrowthStats:        () => api.get('/admin/analytics/growth').then(r => r.data),
};
