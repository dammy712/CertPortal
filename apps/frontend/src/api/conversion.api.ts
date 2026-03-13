import api from '@/lib/api';

export const conversionApi = {
  // Inspect a PEM cert and return metadata
  inspect: (certificate: string) =>
    api.post('/convert/inspect', { certificate }).then(r => r.data),

  // Convert and download — returns a Blob
  convert: async (payload: {
    certificate: string;
    privateKey?: string;
    chain?: string;
    targetFormat: string;
    pfxPassword?: string;
  }) => {
    const response = await api.post('/convert', payload, {
      responseType: 'blob',
    });

    // Extract filename from Content-Disposition header
    const disposition = response.headers['content-disposition'] || '';
    const match = disposition.match(/filename="?([^"]+)"?/);
    const filename = match ? match[1] : `certificate.${payload.targetFormat.toLowerCase()}`;

    return { blob: response.data as Blob, filename };
  },
};
