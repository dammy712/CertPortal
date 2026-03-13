import { useState, useEffect, useCallback, FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ShieldCheck, Plus, Search, Eye, XCircle, Clock,
  CheckCircle2, AlertTriangle, Loader2, RefreshCw,
  FileText, ChevronLeft, ChevronRight, SlidersHorizontal, X, Package
} from 'lucide-react';
import { certificateApi } from '@/api/certificate.api';
import { cn } from '@/lib/utils';

interface Order {
  id: string;
  orderNumber: string;
  status: string;
  commonName: string;
  validity: string;
  priceNgn: number;
  createdAt: string;
  product: { name: string; type: string };
  certificate?: { serialNumber: string; expiresAt: string };
}

const VALIDITY_LABELS: Record<string, string> = {
  ONE_YEAR: '1 Year', TWO_YEARS: '2 Years', THREE_YEARS: '3 Years',
};

const fmtMoney = (n: number) => `₦${Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
const fmtDate  = (d: string) => new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  PENDING_PAYMENT:    { label: 'Pending Payment',    color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',       icon: Clock },
  PAID:               { label: 'Paid',               color: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',       icon: CheckCircle2 },
  PENDING_VALIDATION: { label: 'Pending Validation', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300', icon: Clock },
  VALIDATING:         { label: 'Validating',         color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300', icon: RefreshCw },
  PENDING_ISSUANCE:   { label: 'Pending Issuance',   color: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300', icon: Clock },
  ISSUED:             { label: 'Issued',             color: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',    icon: ShieldCheck },
  CANCELLED:          { label: 'Cancelled',          color: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',           icon: XCircle },
  REFUNDED:           { label: 'Refunded',           color: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300', icon: RefreshCw },
  EXPIRED:            { label: 'Expired',            color: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',       icon: AlertTriangle },
};

const PENDING_STATUSES = ['PAID', 'PENDING_VALIDATION', 'VALIDATING', 'PENDING_ISSUANCE'];
const STATUSES = ['PENDING_PAYMENT', 'PAID', 'PENDING_VALIDATION', 'VALIDATING', 'PENDING_ISSUANCE', 'ISSUED', 'CANCELLED', 'REFUNDED', 'EXPIRED'];
const PRODUCT_TYPES = ['DV', 'OV', 'EV', 'WILDCARD', 'MULTI_DOMAIN'];

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || { label: status, color: 'bg-gray-100 text-gray-700', icon: FileText };
  const Icon = cfg.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', cfg.color)}>
      <Icon className="w-3 h-3" /> {cfg.label}
    </span>
  );
}

function OrderRow({ o, highlight }: { o: Order; highlight?: boolean }) {
  return (
    <tr className={cn('hover:bg-muted/30 transition', highlight && 'bg-blue-50/50 dark:bg-blue-950/20')}>
      <td className="px-4 py-3 font-mono text-xs text-primary">{o.orderNumber}</td>
      <td className="px-4 py-3 font-medium text-foreground max-w-[180px] truncate">{o.commonName || '—'}</td>
      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{o.product?.name}</td>
      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{VALIDITY_LABELS[o.validity] || o.validity}</td>
      <td className="px-4 py-3 whitespace-nowrap"><StatusBadge status={o.status} /></td>
      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{fmtMoney(o.priceNgn)}</td>
      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{fmtDate(o.createdAt)}</td>
      <td className="px-4 py-3">
        <Link to={`/orders/${o.id}`}
          className="flex items-center gap-1 text-xs text-primary hover:underline whitespace-nowrap">
          <Eye className="w-3.5 h-3.5" /> View
        </Link>
      </td>
    </tr>
  );
}

const TABLE_HEADERS = ['Order #', 'Domain', 'Product', 'Validity', 'Status', 'Price', 'Date', ''];

export default function OrdersPage() {
  const [searchParams] = useSearchParams();
  const fromDashboard = searchParams.get('status') === 'pending';

  // ── Pending orders (always loaded separately, shown at top) ──
  const [pendingOrders, setPendingOrders] = useState<Order[]>([]);
  const [pendingLoading, setPendingLoading] = useState(true);

  // ── All orders ──
  const [data, setData]         = useState<any>(null);
  const [loading, setLoading]   = useState(true);
  const [page, setPage]         = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [search, setSearch]     = useState('');
  const [status, setStatus]     = useState('');
  const [productType, setProductType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');

  const activeFilters = [status, productType, dateFrom, dateTo].filter(Boolean).length;

  // Load pending orders once
  useEffect(() => {
    setPendingLoading(true);
    certificateApi.getOrders({ page: 1, limit: 50, status: 'pending' })
      .then(res => setPendingOrders(res.data || []))
      .catch(() => setPendingOrders([]))
      .finally(() => setPendingLoading(false));
  }, []);

  // Load all orders with filters
  const load = useCallback(async (p = page) => {
    setLoading(true);
    try {
      const res = await certificateApi.getOrders({
        page: p, limit: 10,
        search:      search      || undefined,
        status:      status      || undefined,
        productType: productType || undefined,
        dateFrom:    dateFrom    || undefined,
        dateTo:      dateTo      || undefined,
      });
      setData(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [page, search, status, productType, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const handleSearch = (e: FormEvent) => { e.preventDefault(); setPage(1); load(1); };
  const clearFilters = () => { setStatus(''); setProductType(''); setDateFrom(''); setDateTo(''); setPage(1); };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Certificate Orders</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {data?.meta ? `${data.meta.total} order${data.meta.total !== 1 ? 's' : ''} total` : 'Your SSL/TLS certificate orders'}
          </p>
        </div>
        <Link to="/orders/new"
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition">
          <Plus className="w-4 h-4" /> New Order
        </Link>
      </div>

      {/* ── PENDING ORDERS SECTION (always visible) ── */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-blue-50/50 dark:bg-blue-950/20">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <h2 className="font-semibold text-foreground">Pending Orders</h2>
            {!pendingLoading && (
              <span className={cn(
                'px-2 py-0.5 rounded-full text-xs font-bold',
                pendingOrders.length > 0
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                  : 'bg-muted text-muted-foreground'
              )}>
                {pendingOrders.length}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">Paid · Validation · Issuance in progress</p>
        </div>

        {pendingLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : pendingOrders.length === 0 ? (
          <div className="flex items-center gap-3 px-5 py-6 text-muted-foreground">
            <ShieldCheck className="w-5 h-5 text-green-500" />
            <p className="text-sm">No pending orders — all caught up!</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  {TABLE_HEADERS.map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pendingOrders.map(o => <OrderRow key={o.id} o={o} highlight />)}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── ALL ORDERS SECTION with search + filters ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-foreground">All Orders</h2>
        </div>

        {/* Search + Filter bar */}
        <div className="space-y-3">
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by order number, domain…"
                className="w-full pl-9 pr-4 py-2.5 border border-input rounded-xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <button type="submit"
              className="px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition">
              Search
            </button>
            <button type="button" onClick={() => setShowFilters(s => !s)}
              className={cn('flex items-center gap-2 px-4 py-2.5 border rounded-xl text-sm font-medium transition',
                showFilters || activeFilters > 0
                  ? 'border-primary text-primary bg-primary/5'
                  : 'border-border hover:bg-accent'
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

          {/* Filter panel */}
          {showFilters && (
            <div className="bg-muted/40 border border-border rounded-xl p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">Status</label>
                <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}
                  className="w-full px-3 py-2 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                  <option value="">All Statuses</option>
                  <option value="pending">⏳ All Pending</option>
                  {STATUSES.map(s => <option key={s} value={s}>{STATUS_CONFIG[s]?.label || s}</option>)}
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
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">From Date</label>
                <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }}
                  className="w-full px-3 py-2 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">To Date</label>
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

        {/* All orders table */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>
          ) : !data?.data?.length ? (
            <div className="text-center py-16">
              <FileText className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-30" />
              <p className="text-muted-foreground font-medium">No orders found</p>
              <p className="text-sm text-muted-foreground mt-1">
                {search || activeFilters > 0 ? 'Try adjusting your search or filters.' : 'Place your first order to get started.'}
              </p>
              {(search || activeFilters > 0) && (
                <button onClick={() => { setSearch(''); clearFilters(); }}
                  className="mt-3 text-sm text-primary hover:underline">Clear all filters</button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    {TABLE_HEADERS.map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.data.map((o: Order) => <OrderRow key={o.id} o={o} />)}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {data?.meta && data.meta.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <p className="text-xs text-muted-foreground">
                Page {data.meta.page} of {data.meta.totalPages} · {data.meta.total} orders
              </p>
              <div className="flex items-center gap-2">
                <button onClick={() => { setPage(p => p - 1); }} disabled={page <= 1}
                  className="p-1.5 rounded-lg border border-border hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button onClick={() => { setPage(p => p + 1); }} disabled={page >= data.meta.totalPages}
                  className="p-1.5 rounded-lg border border-border hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
