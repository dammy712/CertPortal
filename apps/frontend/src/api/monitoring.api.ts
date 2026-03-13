import api from '@/lib/api';

export const monitoringApi = {
  getSummary:      () => api.get('/monitoring/summary').then(r => r.data),
  getAdminOverview: () => api.get('/monitoring/admin').then(r => r.data),
  runCheck:        () => api.post('/monitoring/run-check').then(r => r.data),
};
