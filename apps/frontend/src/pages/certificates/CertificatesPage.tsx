import { useState, useEffect, useCallback, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldCheck, ShieldAlert, Clock, Download, Loader2, Search,
  AlertCircle, Calendar, RefreshCw, SlidersHorizontal,
  ChevronLeft, ChevronRight, X, FileText
} from 'lucide-react';
import { certificateApi } from '@/api/certificate.api';
import { cn } from '@/lib/utils';

interface Certificate {
  id: string;
  commonName: string;
  serialNumber: string;
  thumbprint: string;
  subjectAltNames: string[];
  issuedAt: string;
  expiresAt: string;
  revokedAt?: string;
  isExpired: boolean;
  daysUntilExpiry: number;
  order: {
    orderNumber: string;
    validity: string;
    product: { name: string; type: string };
  };
}

const PRODUCT_TYPES = ['DV','DV_MULTIDOMAIN','DV_WILDCARD','OV','OV_MULTIDOMAIN','OV_WILDCARD','EV','EV_MULTIDOMAIN'];

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });

function ExpiryBadge({ days, isExpired, revokedAt }: { days: number; isExpired: boolean; revokedAt?: string }) {
  if (revokedAt) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
      <ShieldAlert className="w-3 h-3" /> Revoked
    </span>
  );
  if (isExpired) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300">
      <AlertCircle className="w-3 h-3" /> Expired
    </span>
  );
  if (days <= 7) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300">
      <Clock className="w-3 h-3" /> {days}d left
    </span>
  );
  if (days <= 30) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300">
      <Clock className="w-3 h-3" /> {days}d left
    </span>
  );
  if (days <= 90) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300">
      <Clock className="w-3 h-3" /> {days}d left
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
      <ShieldCheck className="w-3 h-3" /> Active · {days}d
    </span>
  );
}

function DownloadMenu({ cert }: { cert: Certificate }) {
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);

  const download = async (type: 'cert' | 'chain' | 'fullchain') => {
    setLoading(true);
    setOpen(false);
    try {
      const res = await certificateApi.downloadCertificate(cert.id, type);
      if (res.url) {
        const a = document.createElement('a');
        a.href = res.url;
        a.download = res.fileName || `${cert.commonName}-${type}.crt`;
        a.click();
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)} disabled={loading}
        className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs font-medium hover:bg-accent transition disabled:opacity-50">
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
        Download
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-8 z-20 bg-card border border-border rounded-xl shadow-lg py-1 w-40">
            {[
              { type: 'cert' as const,      label: 'Certificate' },
              { type: 'chain' as const,     label: 'Chain Only' },
              { type: 'fullchain' as const, label: 'Full Chain' },
            ].map(({ type, label }) => (
              <button key={type} onClick={() => download(type)}
                className="w-full text-left px-4 py-2 text-xs hover:bg-accent transition">
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Pagination({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <div className="flex items-center gap-2 justify-end">
      <button onClick={() => onPage(page - 1)} disabled={page === 1}
        className="p-1.5 border border-border rounded-lg hover:bg-accent disabled:opacity-40 transition">
        <ChevronLeft className="w-4 h-4" />
      </button>
      <span className="text-sm text-muted-foreground">Page {page} of {pages}</span>
      <button onClick={() => onPage(page + 1)} disabled={page === pages}
        className="p-1.5 border border-border rounded-lg hover:bg-accent disabled:opacity-40 transition">
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

export default function CertificatesPage() {
  const [data, setData]       = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage]       = useState(1);
  const [showFilters, setShowFilters] = useState(false);

  const [search, setSearch]           = useState('');
  const [status, setStatus]           = useState('');
  const [productType, setProductType] = useState('');
  const [expiryFrom, setExpiryFrom]   = useState('');
  const [expiryTo, setExpiryTo]       = useState('');
  const [dateFrom, setDateFrom]       = useState('');
  const [dateTo, setDateTo]           = useState('');

  const activeFilters = [status, productType, expiryFrom, expiryTo, dateFrom, dateTo].filter(Boolean).length;

  const load = useCallback(async (p = page) => {
    setLoading(true);
    try {
      const res = await certificateApi.listIssuedCertificates({
        page: p, limit: 10,
        search:      search      || undefined,
        status:      status      || undefined,
        productType: productType || undefined,
        expiryFrom:  expiryFrom  || undefined,
        expiryTo:    expiryTo    || undefined,
        dateFrom:    dateFrom    || undefined,
        dateTo:      dateTo      || undefined,
      });
      setData(res);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [page, search, status, productType, expiryFrom, expiryTo, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const handleSearch = (e: FormEvent) => { e.preventDefault(); setPage(1); load(1); };
  const clearFilters = () => {
    setStatus(''); setProductType(''); setExpiryFrom(''); setExpiryTo('');
    setDateFrom(''); setDateTo(''); setPage(1);
  };

  const certs: Certificate[] = data?.data || [];
  const meta = data?.meta;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">My Certificates</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {meta ? `${meta.total} certificate${meta.total !== 1 ? 's' : ''}` : 'Your issued SSL/TLS certificates'}
          </p>
        </div>
        <Link to="/convert"
          className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-accent transition">
          <RefreshCw className="w-4 h-4" /> Convert Format
        </Link>
      </div>

      {/* Search + filters */}
      <div className="space-y-3">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by domain, serial number, thumbprint…"
              className="w-full pl-9 pr-4 py-2.5 border border-input rounded-xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <button type="submit"
            className="px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition">
            Search
          </button>
          <button type="button" onClick={() => setShowFilters(s => !s)}
            className={cn('flex items-center gap-2 px-4 py-2.5 border rounded-xl text-sm font-medium transition',
              showFilters || activeFilters > 0 ? 'border-primary text-primary bg-primary/5' : 'border-border hover:bg-accent'
            )}>
            <SlidersHorizontal className="w-4 h-4" />
            Filters
            {activeFilters > 0 && (
              <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
                {activeFilters}
              </span>
            )}
          </button>
        </form>

        {showFilters && (
          <div className="bg-muted/40 border border-border rounded-xl p-4 grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">Status</label>
              <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}
                className="w-full px-3 py-2 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="">All</option>
                <option value="active">Active</option>
                <option value="expired">Expired</option>
                <option value="revoked">Revoked</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">Product Type</label>
              <select value={productType} onChange={e => { setProductType(e.target.value); setPage(1); }}
                className="w-full px-3 py-2 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="">All Types</option>
                {PRODUCT_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">Expiry From</label>
              <input type="date" value={expiryFrom} onChange={e => { setExpiryFrom(e.target.value); setPage(1); }}
                className="w-full px-3 py-2 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">Expiry To</label>
              <input type="date" value={expiryTo} onChange={e => { setExpiryTo(e.target.value); setPage(1); }}
                className="w-full px-3 py-2 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">Issued From</label>
              <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }}
                className="w-full px-3 py-2 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">Issued To</label>
              <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }}
                className="w-full px-3 py-2 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            {activeFilters > 0 && (
              <div className="col-span-full flex justify-end">
                <button onClick={clearFilters}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition">
                  <X className="w-3.5 h-3.5" /> Clear filters
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Results */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>
        ) : !certs.length ? (
          <div className="text-center py-16">
            <ShieldCheck className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-30" />
            <p className="text-muted-foreground font-medium">No certificates found</p>
            <p className="text-sm text-muted-foreground mt-1">
              {search || activeFilters > 0 ? 'Try adjusting your search or filters.' : 'Complete an order to get your first certificate.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  {['Domain / CN', 'Product', 'Serial Number', 'Issued', 'Expires', 'Status', ''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {certs.map(cert => (
                  <tr key={cert.id} className="hover:bg-muted/30 transition group">
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{cert.commonName}</p>
                      {cert.subjectAltNames?.length > 1 && (
                        <p className="text-xs text-muted-foreground mt-0.5">+{cert.subjectAltNames.length - 1} SANs</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{cert.order?.product?.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground max-w-[120px] truncate" title={cert.serialNumber || ''}>
                      {cert.serialNumber || '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      <div className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{fmtDate(cert.issuedAt)}</div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{fmtDate(cert.expiresAt)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <ExpiryBadge days={cert.daysUntilExpiry} isExpired={cert.isExpired} revokedAt={cert.revokedAt} />
                    </td>
                    <td className="px-4 py-3">
                      <DownloadMenu cert={cert} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {meta && meta.totalPages > 1 && (
          <div className="px-4 py-3 border-t border-border">
            <Pagination page={page} pages={meta.totalPages} onPage={p => setPage(p)} />
          </div>
        )}
      </div>

      {/* Legend */}
      {!loading && certs.length > 0 && (
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground px-1">
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500" /> Active</div>
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-yellow-500" /> Expiring ≤90d</div>
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-orange-500" /> Expiring ≤30d</div>
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500" /> Expiring ≤7d / Expired</div>
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-gray-500" /> Revoked</div>
          <Link to="/convert" className="ml-auto flex items-center gap-1 text-primary hover:underline">
            <FileText className="w-3.5 h-3.5" /> Convert format
          </Link>
        </div>
      )}
    </div>
  );
}
