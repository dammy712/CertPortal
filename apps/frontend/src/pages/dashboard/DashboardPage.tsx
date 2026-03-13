import {
  ShieldCheck, ShieldAlert, Clock, Wallet, Plus, ArrowRight,
  AlertTriangle, RefreshCw, Loader2, Bell, X, ChevronDown, ChevronUp,
  Package, Calendar, CheckCircle2, XCircle, AlertCircle
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useEffect, useState, useCallback } from 'react';
import { walletApi } from '@/api/wallet.api';
import { monitoringApi } from '@/api/monitoring.api';
import { cn } from '@/lib/utils';

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });

const fmtDateTime = (d: string) =>
  new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const fmtBalance = (n: number) =>
  `₦${n.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;

function expiryColor(days: number) {
  if (days <= 7)  return 'text-red-600 dark:text-red-400';
  if (days <= 30) return 'text-orange-500 dark:text-orange-400';
  if (days <= 90) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-green-600 dark:text-green-400';
}
function expiryBadge(days: number) {
  if (days <= 7)  return 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300';
  if (days <= 30) return 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300';
  if (days <= 90) return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300';
  return 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300';
}

// ─── Status meta for pending orders ──────────────────
const STATUS_META: Record<string, { label: string; desc: string; color: string; bg: string; dot: string }> = {
  PENDING_PAYMENT:    { label: 'Pending Payment',     desc: 'Awaiting wallet payment',                   color: 'text-gray-600',   bg: 'bg-gray-100 dark:bg-gray-800',     dot: 'bg-gray-400' },
  PAID:               { label: 'Payment Received',    desc: 'Payment confirmed, preparing validation',   color: 'text-blue-600',   bg: 'bg-blue-100 dark:bg-blue-900',     dot: 'bg-blue-500' },
  PENDING_VALIDATION: { label: 'Domain Validation',   desc: 'Waiting for domain ownership verification', color: 'text-yellow-600', bg: 'bg-yellow-100 dark:bg-yellow-900', dot: 'bg-yellow-500' },
  VALIDATING:         { label: 'Validating',          desc: 'Domain validation in progress',             color: 'text-yellow-600', bg: 'bg-yellow-100 dark:bg-yellow-900', dot: 'bg-yellow-500' },
  PENDING_ISSUANCE:   { label: 'Issuing Certificate', desc: 'Certificate Authority is processing',       color: 'text-purple-600', bg: 'bg-purple-100 dark:bg-purple-900', dot: 'bg-purple-500' },
  ISSUED:             { label: 'Certificate Issued',  desc: 'Certificate ready to download',             color: 'text-green-600',  bg: 'bg-green-100 dark:bg-green-900',   dot: 'bg-green-500' },
  CANCELLED:          { label: 'Cancelled',           desc: 'Order was cancelled',                       color: 'text-red-600',    bg: 'bg-red-100 dark:bg-red-900',       dot: 'bg-red-500' },
  REFUNDED:           { label: 'Refunded',            desc: 'Payment refunded to wallet',                color: 'text-orange-600', bg: 'bg-orange-100 dark:bg-orange-900', dot: 'bg-orange-500' },
};
const PIPELINE_STEPS = ['PAID', 'PENDING_VALIDATION', 'VALIDATING', 'PENDING_ISSUANCE', 'ISSUED'];

// ─── Certificate Row ──────────────────────────────────
function CertRow({ cert, type }: { cert: any; type: 'active' | 'expired' }) {
  const isExpired = type === 'expired';
  const days = isExpired ? cert.daysAgo : cert.daysLeft;
  return (
    <div className="flex items-center justify-between py-3 px-4 border-b border-border last:border-0 hover:bg-muted/30 transition group">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
          isExpired ? 'bg-red-100 dark:bg-red-900' : 'bg-green-100 dark:bg-green-900')}>
          {isExpired
            ? <XCircle className="w-4 h-4 text-red-500" />
            : <ShieldCheck className="w-4 h-4 text-green-500" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{cert.commonName}</p>
          <p className="text-xs text-muted-foreground">{cert.order?.product?.name || '—'}</p>
        </div>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="text-right">
          <p className="text-xs text-muted-foreground">{isExpired ? 'Expired' : 'Expires'}</p>
          <p className="text-xs font-medium text-foreground">{fmtDate(cert.expiresAt)}</p>
        </div>
        <span className={cn('px-2 py-0.5 rounded-full text-xs font-semibold',
          isExpired ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' : expiryBadge(days))}>
          {isExpired ? `${days}d ago` : `${days}d left`}
        </span>
        <Link to={`/orders/${cert.orderId || cert.order?.id}`}
          className="opacity-0 group-hover:opacity-100 transition text-xs text-primary hover:underline">
          View
        </Link>
      </div>
    </div>
  );
}

// ─── Certificates Modal (tabbed: 7d / 30d / 90d) ──────
function CertificatesModal({
  title, certs, type, onClose, expiring7, expiring30
}: {
  title: string; certs: any[]; type: 'active' | 'expired'; onClose: () => void;
  expiring7?: any[]; expiring30?: any[];
}) {
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'7' | '30' | '90' | 'all'>('all');

  const tabs7   = expiring7  || [];
  const tabs30  = expiring30 || [];
  const tabs90  = certs;

  const activeCerts = tab === '7' ? tabs7 : tab === '30' ? tabs30 : tab === '90' ? tabs90 : certs;
  const filtered = activeCerts.filter(c =>
    c.commonName?.toLowerCase().includes(search.toLowerCase()) ||
    c.order?.product?.name?.toLowerCase().includes(search.toLowerCase())
  );

  const isExpiring = type === 'active' && (expiring7 !== undefined || expiring30 !== undefined);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-background border border-border rounded-2xl shadow-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div>
            <h2 className="font-bold text-foreground">{title}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {filtered.length} certificate{filtered.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button type="button" onClick={onClose}
            className="p-2 rounded-lg hover:bg-accent transition text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs — only for expiring modal */}
        {isExpiring && (
          <div className="flex gap-1 px-4 pt-3 pb-0 flex-shrink-0">
            {([
              { key: '7',  label: '≤ 7 Days',  count: tabs7.length,  urgent: true },
              { key: '30', label: '≤ 30 Days', count: tabs30.length, urgent: false },
              { key: '90', label: '≤ 90 Days', count: tabs90.length, urgent: false },
            ] as const).map(({ key, label, count, urgent }) => (
              <button key={key} type="button" onClick={() => setTab(key)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition border',
                  tab === key
                    ? urgent && count > 0
                      ? 'bg-red-100 text-red-700 border-red-300 dark:bg-red-900 dark:text-red-300 dark:border-red-700'
                      : 'bg-primary/10 text-primary border-primary/30'
                    : 'bg-transparent text-muted-foreground border-transparent hover:bg-accent'
                )}>
                {label}
                <span className={cn(
                  'px-1.5 py-0.5 rounded-full text-[10px] font-bold',
                  tab === key
                    ? urgent && count > 0 ? 'bg-red-200 text-red-800 dark:bg-red-800 dark:text-red-200' : 'bg-primary/20 text-primary'
                    : 'bg-muted text-muted-foreground'
                )}>{count}</span>
              </button>
            ))}
          </div>
        )}

        {/* Search */}
        <div className="px-4 py-3 border-b border-border flex-shrink-0">
          <input
            type="text"
            placeholder="Search by domain or product..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-muted rounded-lg border border-border focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1">
          {filtered.length === 0 ? (
            <div className="text-center py-12">
              <ShieldCheck className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm font-medium text-foreground">No certificates found</p>
              <p className="text-xs text-muted-foreground mt-1">
                {isExpiring ? `No certificates expiring within ${tab === '7' ? '7' : tab === '30' ? '30' : '90'} days` : 'Nothing to show'}
              </p>
            </div>
          ) : (
            filtered.map((cert: any) => <CertRow key={cert.id} cert={cert} type={type} />)
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border flex-shrink-0">
          <Link to="/certificates" onClick={onClose}
            className="flex items-center justify-center gap-2 w-full py-2 text-sm text-primary hover:underline font-medium">
            Manage all certificates <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── Pending Order Card ───────────────────────────────
function PendingOrderCard({ order }: { order: any }) {
  const [expanded, setExpanded] = useState(false);
  const meta = STATUS_META[order.status] || STATUS_META.PAID;
  const currentStepIdx = PIPELINE_STEPS.indexOf(order.status);
  const lastChange = order.statusHistory?.length
    ? new Date(order.statusHistory[order.statusHistory.length - 1].createdAt)
    : new Date(order.createdAt);
  const hoursStuck = Math.floor((Date.now() - lastChange.getTime()) / 3600000);
  const isStuck = hoursStuck >= 24;

  return (
    <div className={cn('border rounded-xl overflow-hidden transition-all', isStuck ? 'border-orange-300 dark:border-orange-700' : 'border-border')}>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0', meta.bg)}>
              <Package className={cn('w-4 h-4', meta.color)} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-foreground truncate">{order.commonName || 'Unnamed Domain'}</p>
                <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', meta.bg, meta.color)}>
                  {meta.label}
                </span>
                {isStuck && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300">
                    ⚠ Stuck {hoursStuck}h
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{order.product?.name} • #{order.orderNumber}</p>
              <p className="text-xs text-muted-foreground">{meta.desc}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Link to={`/orders/${order.id}`} className="text-xs text-primary hover:underline font-medium">View</Link>
            <button type="button" onClick={() => setExpanded(!expanded)}
              className="p-1 rounded hover:bg-accent transition text-muted-foreground">
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>
        {/* Progress bar */}
        <div className="mt-3 flex items-center gap-1">
          {PIPELINE_STEPS.filter(s => s !== 'ISSUED').map((step, i) => {
            const stepIdx = PIPELINE_STEPS.indexOf(step);
            const isDone = currentStepIdx > stepIdx;
            const isCurrent = currentStepIdx === stepIdx;
            return (
              <div key={step} className="flex items-center flex-1">
                <div className={cn('h-1.5 flex-1 rounded-full transition-all',
                  isDone ? 'bg-primary' : isCurrent ? 'bg-primary/50' : 'bg-muted')} />
                {i < PIPELINE_STEPS.filter(s => s !== 'ISSUED').length - 1 && (
                  <div className={cn('w-2 h-2 rounded-full mx-0.5 flex-shrink-0',
                    isDone || isCurrent ? 'bg-primary' : 'bg-muted')} />
                )}
              </div>
            );
          })}
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[10px] text-muted-foreground">Payment</span>
          <span className="text-[10px] text-muted-foreground">Validation</span>
          <span className="text-[10px] text-muted-foreground">Issuance</span>
        </div>
      </div>
      {expanded && (
        <div className="border-t border-border bg-muted/30 p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Status History</p>
          {!order.statusHistory?.length ? (
            <p className="text-xs text-muted-foreground">No history recorded yet.</p>
          ) : (
            <div className="relative space-y-0">
              {order.statusHistory.map((h: any, i: number) => {
                const hMeta = STATUS_META[h.toStatus] || STATUS_META.PAID;
                const isLast = i === order.statusHistory.length - 1;
                return (
                  <div key={h.id} className="flex gap-3 pb-4 last:pb-0 relative">
                    {!isLast && <div className="absolute left-[11px] top-5 bottom-0 w-px bg-border" />}
                    <div className={cn('w-5 h-5 rounded-full flex-shrink-0 mt-0.5 flex items-center justify-center z-10', hMeta.bg)}>
                      {isLast
                        ? <div className={cn('w-2 h-2 rounded-full', hMeta.dot)} />
                        : <CheckCircle2 className="w-3 h-3 text-green-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className={cn('text-xs font-semibold', hMeta.color)}>{hMeta.label}</p>
                        <p className="text-[10px] text-muted-foreground flex-shrink-0">{fmtDateTime(h.createdAt)}</p>
                      </div>
                      {h.reason && <p className="text-xs text-muted-foreground mt-0.5">{h.reason}</p>}
                      {h.note && <p className="text-xs text-muted-foreground/70 mt-0.5 italic">{h.note}</p>}
                    </div>
                  </div>
                );
              })}
              <div className="flex gap-3 mt-2 pt-2 border-t border-border">
                <div className={cn('w-5 h-5 rounded-full flex-shrink-0 mt-0.5 flex items-center justify-center', meta.bg)}>
                  <div className={cn('w-2 h-2 rounded-full animate-pulse', meta.dot)} />
                </div>
                <div>
                  <p className={cn('text-xs font-semibold', meta.color)}>Currently: {meta.label}</p>
                  <p className="text-xs text-muted-foreground">{meta.desc}</p>
                  <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                    In this status for {hoursStuck < 1 ? 'less than 1 hour' : `${hoursStuck}h`}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Pending Orders Modal ─────────────────────────────
function PendingOrdersModal({ orders, onClose }: { orders: any[]; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-background border border-border rounded-2xl shadow-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
          <div>
            <h2 className="font-bold text-foreground">Pending Orders</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {orders.length} order{orders.length !== 1 ? 's' : ''} in progress — expand to see history
            </p>
          </div>
          <button type="button" onClick={onClose}
            className="p-2 rounded-lg hover:bg-accent transition text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-4 space-y-3">
          {orders.length === 0 ? (
            <div className="text-center py-12">
              <Clock className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm font-medium text-foreground">No pending orders</p>
              <p className="text-xs text-muted-foreground mt-1">All your orders have been completed</p>
            </div>
          ) : (
            orders.map((order: any) => <PendingOrderCard key={order.id} order={order} />)
          )}
        </div>
        <div className="px-5 py-3 border-t border-border flex-shrink-0">
          <Link to="/orders" onClick={onClose}
            className="flex items-center justify-center gap-2 w-full py-2 text-sm text-primary hover:underline font-medium">
            View all orders <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── Expiry Banners ───────────────────────────────────
function ExpiryAlertBanner({ certs }: { certs: any[] }) {
  if (!certs?.length) return null;
  const urgent  = certs.filter((c: any) => c.daysLeft <= 7);
  const warning = certs.filter((c: any) => c.daysLeft > 7 && c.daysLeft <= 30);
  return (
    <div className="space-y-2">
      {urgent.length > 0 && (
        <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-xl">
          <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-red-800 dark:text-red-200 text-sm">
              🚨 {urgent.length} certificate{urgent.length > 1 ? 's' : ''} expiring within 7 days!
            </p>
            <div className="mt-1 space-y-0.5">
              {urgent.map((c: any) => (
                <p key={c.id} className="text-xs text-red-700 dark:text-red-300">
                  <strong>{c.commonName}</strong> — expires in <strong>{c.daysLeft} day{c.daysLeft !== 1 ? 's' : ''}</strong> ({fmtDate(c.expiresAt)})
                </p>
              ))}
            </div>
            <Link to="/certificates" className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-red-700 dark:text-red-300 hover:underline">
              Renew now <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      )}
      {warning.length > 0 && (
        <div className="flex items-start gap-3 p-4 bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 rounded-xl">
          <Bell className="w-5 h-5 text-orange-600 dark:text-orange-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-orange-800 dark:text-orange-200 text-sm">
              ⚠️ {warning.length} certificate{warning.length > 1 ? 's' : ''} expiring within 30 days
            </p>
            <div className="mt-1 space-y-0.5">
              {warning.slice(0, 3).map((c: any) => (
                <p key={c.id} className="text-xs text-orange-700 dark:text-orange-300">
                  <strong>{c.commonName}</strong> — {c.daysLeft} days left ({fmtDate(c.expiresAt)})
                </p>
              ))}
              {warning.length > 3 && <p className="text-xs text-orange-600 dark:text-orange-400">+{warning.length - 3} more…</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ExpiringSoonTable({ certs }: { certs: any[] }) {
  if (!certs?.length) return (
    <div className="text-center py-8 text-muted-foreground text-sm">
      <ShieldCheck className="w-8 h-8 mx-auto mb-2 opacity-30" />
      No certificates expiring in the next 90 days.
    </div>
  );
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Domain</th>
            <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Product</th>
            <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Expires</th>
            <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Days Left</th>
          </tr>
        </thead>
        <tbody>
          {certs.map((c: any) => (
            <tr key={c.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition">
              <td className="py-3 px-3 font-medium text-foreground">{c.commonName}</td>
              <td className="py-3 px-3 text-muted-foreground">{c.order?.product?.name || '—'}</td>
              <td className="py-3 px-3 text-muted-foreground">{fmtDate(c.expiresAt)}</td>
              <td className="py-3 px-3">
                <span className={cn('font-semibold', expiryColor(c.daysLeft))}>{c.daysLeft}d</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────
export default function DashboardPage() {
  const { user } = useAuthStore();
  const [balance, setBalance]     = useState(0);
  const [summary, setSummary]     = useState<any>(null);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modal, setModal] = useState<'pending' | 'active' | 'expiring' | 'expired' | null>(null);

  const load = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    try {
      const [walletRes, summaryRes] = await Promise.all([
        walletApi.getWallet().catch(() => null),
        monitoringApi.getSummary().catch(() => null),
      ]);
      if (walletRes?.data) setBalance(Number(walletRes.data.balanceNgn));
      if (summaryRes?.data) setSummary(summaryRes.data);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const pendingCount  = summary?.pendingOrders ?? 0;
  const expiring90    = summary?.expiring90Count ?? 0;
  const expiring30    = summary?.expiring30Count ?? 0;

  const stats = [
    {
      label: 'Active Certificates',
      value: loading ? '—' : String(summary?.activeCerts ?? 0),
      icon: ShieldCheck, color: 'text-green-500', bg: 'bg-green-50 dark:bg-green-950',
      badge: undefined,
      clickable: true,
      hint: 'Click to view',
      onClick: () => setModal('active'),
    },
    {
      label: 'Expiring ≤ 90 Days',
      value: loading ? '—' : String(expiring90),
      icon: ShieldAlert,
      color: expiring30 > 0 ? 'text-orange-500' : expiring90 > 0 ? 'text-yellow-500' : 'text-muted-foreground',
      bg: expiring30 > 0 ? 'bg-orange-50 dark:bg-orange-950' : expiring90 > 0 ? 'bg-yellow-50 dark:bg-yellow-950' : 'bg-muted/30',
      badge: expiring30 > 0 ? 'Action needed' : undefined,
      clickable: true,
      hint: 'Click to view',
      onClick: () => setModal('expiring'),
    },
    {
      label: 'Pending Orders',
      value: loading ? '—' : String(pendingCount),
      icon: Clock, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-950',
      badge: pendingCount > 0 ? 'Action needed' : undefined,
      clickable: true,
      hint: 'View pending orders',
      onClick: () => window.location.assign('/orders?status=pending'),
    },
    {
      label: 'Wallet Balance',
      value: loading ? '—' : fmtBalance(balance),
      icon: Wallet, color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-950',
      badge: undefined, clickable: true, hint: 'Go to wallet', onClick: () => window.location.assign('/wallet'),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Modals */}
      {modal === 'pending' && (
        <PendingOrdersModal orders={summary?.pendingOrdersList || []} onClose={() => setModal(null)} />
      )}
      {modal === 'active' && (
        <CertificatesModal
          title="Active Certificates"
          certs={summary?.activeCertsList || []}
          type="active"
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'expiring' && (
        <CertificatesModal
          title="Expiring Certificates"
          certs={summary?.expiring90 || []}
          type="active"
          expiring7={summary?.expiring7 || []}
          expiring30={summary?.expiring30 || []}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'expired' && (
        <CertificatesModal
          title="Expired Certificates"
          certs={summary?.allExpired || []}
          type="expired"
          onClose={() => setModal(null)}
        />
      )}

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Welcome back, {user?.firstName} 👋</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your SSL/TLS certificates from one place</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => load(true)} disabled={refreshing} className="p-2 border border-border rounded-lg hover:bg-accent transition" title="Refresh">
            <RefreshCw className={cn('w-4 h-4 text-muted-foreground', refreshing && 'animate-spin')} />
          </button>
          <Link to="/orders/new" className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition">
            <Plus className="w-4 h-4" /> New Certificate
          </Link>
        </div>
      </div>

      {!loading && summary?.expiring30?.length > 0 && <ExpiryAlertBanner certs={summary.expiring30} />}

      {!loading && summary?.recentExpired?.length > 0 && (
        <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-xl">
          <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-red-800 dark:text-red-200 text-sm">
              {summary.recentExpired.length} certificate{summary.recentExpired.length > 1 ? 's have' : ' has'} recently expired
            </p>
            <p className="text-xs text-red-700 dark:text-red-300 mt-0.5">
              {summary.recentExpired.map((c: any) => c.commonName).join(', ')}
            </p>
            <div className="flex items-center gap-3 mt-1">
              <Link to="/certificates" className="inline-flex items-center gap-1 text-xs font-medium text-red-700 dark:text-red-300 hover:underline">
                View certificates <ArrowRight className="w-3 h-3" />
              </Link>
              <button type="button" onClick={() => setModal('expired')}
                className="inline-flex items-center gap-1 text-xs font-medium text-red-700 dark:text-red-300 hover:underline">
                View all expired <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon, color, bg, badge, clickable, hint, onClick }) => (
          <div
            key={label}
            onClick={onClick}
            className={cn(
              'bg-card border border-border rounded-xl p-5 transition select-none',
              clickable && 'cursor-pointer hover:border-primary/50 hover:shadow-md hover:-translate-y-0.5'
            )}
          >
            <div className="flex items-start justify-between mb-3">
              <div className={cn('p-2 rounded-lg', bg)}>
                <Icon className={cn('w-5 h-5', color)} />
              </div>
              {badge && (
                <span className={cn('text-xs font-medium px-1.5 py-0.5 rounded-full',
                  label === 'Pending Orders'
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                    : 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300'
                )}>
                  {badge}
                </span>
              )}
            </div>
            {loading
              ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              : <p className="text-2xl font-bold text-foreground">{value}</p>
            }
            <p className="text-sm text-muted-foreground mt-1">{label}</p>
            {clickable && hint && !loading && (
              <p className="text-xs text-primary mt-1 flex items-center gap-1">
                {hint} <ArrowRight className="w-3 h-3" />
              </p>
            )}
          </div>
        ))}
      </div>



      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Order a Certificate', desc: 'Start a new SSL/TLS certificate order', to: '/orders/new', icon: Plus },
          { label: 'View My Certificates', desc: 'Download, track and manage certificates', to: '/certificates', icon: ShieldCheck },
          { label: 'Convert Format', desc: 'Convert between PEM, PFX, DER, CRT, CER', to: '/convert', icon: RefreshCw },
        ].map(({ label, desc, to, icon: Icon }) => (
          <Link key={to} to={to} className="group flex items-start gap-4 p-5 bg-card border border-border rounded-xl hover:border-primary/40 hover:shadow-sm transition">
            <div className="p-2 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition">
              <Icon className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-foreground text-sm">{label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
