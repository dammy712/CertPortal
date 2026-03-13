import api from '@/lib/api';

export const productsApi = {
  list:    () => api.get('/products').then(r => r.data),
  get:     (id: string) => api.get(`/products/${id}`).then(r => r.data),

  // Admin
  listAll: () => api.get('/admin/products').then(r => r.data),
  create:  (data: any) => api.post('/products', data).then(r => r.data),
  update:  (id: string, data: any) => api.patch(`/products/${id}`, data).then(r => r.data),
  toggle:  (id: string) => api.patch(`/products/${id}/toggle`).then(r => r.data),
  upsertPrice: (id: string, validity: string, priceNgn: number) =>
    api.put(`/products/${id}/prices`, { validity, priceNgn }).then(r => r.data),
};
