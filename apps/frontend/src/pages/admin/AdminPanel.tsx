import { useState, useEffect, useCallback } from 'react';
import {
  Users, ShieldCheck, FileText, Wallet, Activity,
  Search, CheckCircle2, XCircle, AlertCircle, Loader2,
  ChevronLeft, ChevronRight, ChevronDown, Eye, TrendingUp, Clock,
  Ban, UserCheck, RefreshCw, Plus, Edit3, ToggleLeft, ToggleRight,
  SlidersHorizontal, X, Shield,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { adminApi } from '@/api/admin.api';
import { productsApi } from '@/api/products.api';
import { monitoringApi } from '@/api/monitoring.api';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';

// ─── Types ────────────────────────────────────────────

interface Stats {
  totalUsers: number; activeUsers: number; pendingKyc: number;
  totalOrders: number; issuedCerts: number; pendingOrders: number;
  totalRevenue: number;
}

// ─── Helpers ──────────────────────────────────────────

const fmt = (n: number) => `₦${Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
const VALIDITY_LABELS: Record<string, string> = { ONE_YEAR: '1 Year', TWO_YEARS: '2 Years', THREE_YEARS: '3 Years' };

function Badge({ label, color }: { label: string; color: string }) {
  return <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', color)}>{label}</span>;
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  SUSPENDED: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  PENDING_VERIFICATION: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  APPROVED: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  REJECTED: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  PENDING: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  ISSUED: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  CANCELLED: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  PAID: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  ADMIN: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  SUPER_ADMIN: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  CUSTOMER: 'bg-muted text-muted-foreground',
};

function Pagination({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between pt-4 border-t border-border">
      <p className="text-sm text-muted-foreground">Page {page} of {pages}</p>
      <div className="flex gap-2">
        <button disabled={page <= 1} onClick={() => onPage(page - 1)}
          className="p-2 border border-border rounded-lg disabled:opacity-40 hover:bg-accent transition">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button disabled={page >= pages} onClick={() => onPage(page + 1)}
          className="p-2 border border-border rounded-lg disabled:opacity-40 hover:bg-accent transition">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function Toast({ message, type }: { message: string; type: 'success' | 'error' }) {
  return (
    <div className={cn(
      'fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium',
      type === 'success' ? 'bg-green-500 text-white' : 'bg-destructive text-destructive-foreground'
    )}>
      {type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
      {message}
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: any; color: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', color)}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
    </div>
  );
}

// ─── Main Admin Panel ─────────────────────────────────

export default function AdminPanel() {
  const [tab, setTab] = useState<string>('overview');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const { user: currentUser } = useAuthStore();

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const tabs = [
    { id: 'overview',      label: 'Overview',          icon: TrendingUp },
    { id: 'analytics',     label: 'Analytics',         icon: Activity },
    { id: 'users',         label: 'Users',             icon: Users },
    { id: 'kyc',           label: 'KYC Review',        icon: ShieldCheck },
    { id: 'orders',        label: 'Orders',            icon: FileText },
    { id: 'certificates',  label: 'Certificates',      icon: ShieldCheck },
    { id: 'products',      label: 'Products',          icon: RefreshCw },
    { id: 'audit',         label: 'Audit Logs',        icon: Activity },
    { id: 'invoice',       label: 'Invoice Settings',  icon: FileText },
    ...(currentUser?.role === 'SUPER_ADMIN' ? [{ id: 'admins', label: 'Admin Management', icon: Shield }] : []),
  ];

  return (
    <div className="space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} />}

      <div>
        <h1 className="text-2xl font-bold text-foreground">Admin Panel</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage users, KYC, orders and system activity</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted p-1 rounded-xl overflow-x-auto">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition flex-shrink-0',
              tab === id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}>
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      {tab === 'overview'  && <OverviewTab showToast={showToast} />}
      {tab === 'analytics' && <AnalyticsTab />}
      {tab === 'users'    && <UsersTab showToast={showToast} />}
      {tab === 'kyc'      && <KycTab showToast={showToast} />}
      {tab === 'orders'       && <OrdersTab />}
      {tab === 'certificates' && <CertificatesTab showToast={showToast} />}
      {tab === 'products' && <ProductsTab showToast={showToast} />}
      {tab === 'audit'    && <AuditTab />}
      {tab === 'invoice'  && <InvoiceSettingsTab showToast={showToast} />}
      {tab === 'admins'   && <AdminManagementTab showToast={showToast} currentUser={currentUser} />}
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────

function OverviewTab({ showToast }: { showToast: any }) {
  const [data, setData]         = useState<any>(null);
  const [loading, setLoading]   = useState(true);
  const [monitor, setMonitor]   = useState<any>(null);
  const [running, setRunning]   = useState(false);

  useEffect(() => {
    Promise.all([
      adminApi.getStats(),
      monitoringApi.getAdminOverview().catch(() => null),
    ])
      .then(([statsRes, monitorRes]) => {
        setData(statsRes.data);
        if (monitorRes?.data) setMonitor(monitorRes.data);
      })
      .catch(() => showToast('Failed to load stats.', 'error'))
      .finally(() => setLoading(false));
  }, []);

  const handleRunCheck = async () => {
    setRunning(true);
    try {
      const res = await monitoringApi.runCheck();
      showToast(`Expiry check done — checked: ${res.data.checked}, notified: ${res.data.notified}`);
      const monitorRes = await monitoringApi.getAdminOverview().catch(() => null);
      if (monitorRes?.data) setMonitor(monitorRes.data);
    } catch {
      showToast('Expiry check failed.', 'error');
    } finally { setRunning(false); }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (!data) return null;

  const { stats, recentOrders, recentUsers } = data;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Users"     value={stats.totalUsers}        icon={Users}       color="bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-400" />
        <StatCard label="Pending KYC"     value={stats.pendingKyc}        icon={ShieldCheck} color="bg-yellow-100 text-yellow-600 dark:bg-yellow-900 dark:text-yellow-400" />
        <StatCard label="Certificates"    value={stats.issuedCerts}       icon={FileText}    color="bg-green-100 text-green-600 dark:bg-green-900 dark:text-green-400" />
        <StatCard label="Total Revenue"   value={fmt(stats.totalRevenue)} icon={Wallet}      color="bg-purple-100 text-purple-600 dark:bg-purple-900 dark:text-purple-400" />
      </div>

      {/* Certificate Monitoring */}
      {monitor && (
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-foreground">Certificate Monitoring</h3>
            <button onClick={handleRunCheck} disabled={running}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-accent transition disabled:opacity-50">
              {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              Run Expiry Check
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Active Certs',    value: monitor.totalActive, color: 'text-green-600' },
              { label: 'Expiring ≤ 30d',  value: monitor.expiring30,  color: monitor.expiring30  > 0 ? 'text-orange-600' : 'text-muted-foreground' },
              { label: 'Expiring ≤ 7d',   value: monitor.expiring7,   color: monitor.expiring7   > 0 ? 'text-red-600'    : 'text-muted-foreground' },
              { label: 'Expired',         value: monitor.expired,     color: monitor.expired     > 0 ? 'text-red-600'    : 'text-muted-foreground' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-muted/40 rounded-xl p-4 text-center">
                <p className={`text-2xl font-bold ${color}`}>{value}</p>
                <p className="text-xs text-muted-foreground mt-1">{label}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Recent Orders */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold mb-4">Recent Orders</h3>
          <div className="space-y-3">
            {recentOrders.map((o: any) => (
              <div key={o.id} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{o.user.firstName} {o.user.lastName}</p>
                  <p className="text-xs text-muted-foreground">{o.product?.name} · {fmtDate(o.createdAt)}</p>
                </div>
                <Badge label={o.status} color={STATUS_COLORS[o.status] || 'bg-muted text-muted-foreground'} />
              </div>
            ))}
          </div>
        </div>
        {/* Recent Users */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold mb-4">Recent Signups</h3>
          <div className="space-y-3">
            {recentUsers.map((u: any) => (
              <div key={u.id} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{u.firstName} {u.lastName}</p>
                  <p className="text-xs text-muted-foreground">{u.email} · {fmtDate(u.createdAt)}</p>
                </div>
                <Badge label={u.status} color={STATUS_COLORS[u.status] || ''} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Users Tab ────────────────────────────────────────

function UsersTab({ showToast }: { showToast: any }) {
  const [data, setData]     = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage]     = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [selected, setSelected] = useState<any>(null);
  const [adjustModal, setAdjustModal] = useState<any>(null);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustNote, setAdjustNote]   = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    adminApi.getUsers({ page, limit: 15, search: search || undefined })
      .then(r => setData(r.data))
      .catch(() => showToast('Failed to load users.', 'error'))
      .finally(() => setLoading(false));
  }, [page, search]);

  useEffect(() => { load(); }, [load]);

  const handleSearch = () => { setSearch(searchInput); setPage(1); };

  const handleStatus = async (id: string, status: string) => {
    try {
      await adminApi.updateUserStatus(id, status);
      showToast('User status updated.');
      load();
      setSelected(null);
    } catch { showToast('Failed to update status.', 'error'); }
  };

  const handleAdjust = async () => {
    if (!adjustAmount || !adjustNote) { showToast('Amount and note are required.', 'error'); return; }
    setSaving(true);
    try {
      await adminApi.adjustWallet(adjustModal.id, Number(adjustAmount), adjustNote);
      showToast('Wallet adjusted.');
      setAdjustModal(null); setAdjustAmount(''); setAdjustNote('');
      load();
    } catch (e: any) {
      showToast(e?.response?.data?.message || 'Adjustment failed.', 'error');
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="Search by name or email..."
            className="w-full pl-9 pr-4 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <button onClick={handleSearch} className="px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition">
          Search
        </button>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  {['Name', 'Email', 'Role', 'Status', 'Orders', 'Balance', 'Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data?.users?.map((u: any) => (
                  <tr key={u.id} className="hover:bg-muted/30 transition">
                    <td className="px-4 py-3 font-medium text-foreground">{u.firstName} {u.lastName}</td>
                    <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                    <td className="px-4 py-3"><Badge label={u.role} color={STATUS_COLORS[u.role] || ''} /></td>
                    <td className="px-4 py-3"><Badge label={u.status} color={STATUS_COLORS[u.status] || ''} /></td>
                    <td className="px-4 py-3 text-muted-foreground">{u._count.orders}</td>
                    <td className="px-4 py-3 text-muted-foreground">{fmt(u.wallet?.balanceNgn || 0)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => setSelected(u)} className="p-1.5 hover:bg-accent rounded-lg transition" title="View">
                          <Eye className="w-4 h-4 text-muted-foreground" />
                        </button>
                        <button onClick={() => setAdjustModal(u)} className="p-1.5 hover:bg-accent rounded-lg transition" title="Adjust Wallet">
                          <Wallet className="w-4 h-4 text-muted-foreground" />
                        </button>
                        {u.status === 'ACTIVE'
                          ? <button onClick={() => handleStatus(u.id, 'SUSPENDED')} className="p-1.5 hover:bg-accent rounded-lg transition" title="Suspend">
                              <Ban className="w-4 h-4 text-destructive" />
                            </button>
                          : <button onClick={() => handleStatus(u.id, 'ACTIVE')} className="p-1.5 hover:bg-accent rounded-lg transition" title="Activate">
                              <UserCheck className="w-4 h-4 text-green-600" />
                            </button>
                        }
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && <div className="p-4"><Pagination page={page} pages={data.pages} onPage={setPage} /></div>}
      </div>

      {/* User Detail Modal */}
      {selected && (
        <Modal title={`${selected.firstName} ${selected.lastName}`} onClose={() => setSelected(null)}>
          <div className="space-y-3 text-sm">
            <Row label="Email" value={selected.email} />
            <Row label="Role" value={<Badge label={selected.role} color={STATUS_COLORS[selected.role] || ''} />} />
            <Row label="Status" value={<Badge label={selected.status} color={STATUS_COLORS[selected.status] || ''} />} />
            <Row label="Balance" value={fmt(selected.wallet?.balanceNgn || 0)} />
            <Row label="Orders" value={selected._count.orders} />
            <Row label="Joined" value={fmtDate(selected.createdAt)} />
          </div>
        </Modal>
      )}

      {/* Wallet Adjust Modal */}
      {adjustModal && (
        <Modal title={`Adjust Wallet — ${adjustModal.firstName} ${adjustModal.lastName}`} onClose={() => { setAdjustModal(null); setAdjustAmount(''); setAdjustNote(''); }}>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Current balance: <strong>{fmt(adjustModal.wallet?.balanceNgn || 0)}</strong></p>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">Amount (₦) — use negative to debit</label>
              <input
                type="number"
                value={adjustAmount}
                onChange={e => setAdjustAmount(e.target.value)}
                placeholder="e.g. 5000 or -1000"
                className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">Note (required)</label>
              <input
                value={adjustNote}
                onChange={e => setAdjustNote(e.target.value)}
                placeholder="Reason for adjustment..."
                className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <button
              onClick={handleAdjust}
              disabled={saving}
              className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {saving ? 'Adjusting...' : 'Apply Adjustment'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── KYC Tab ──────────────────────────────────────────

function KycTab({ showToast }: { showToast: any }) {
  const [data, setData]         = useState<any>(null);
  const [loading, setLoading]   = useState(true);
  const [page, setPage]         = useState(1);
  const [status, setStatus]     = useState('PENDING');
  const [previewDoc, setPreviewDoc] = useState<any>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [notes, setNotes]       = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    adminApi.getKyc({ page, limit: 15, status })
      .then(r => setData(r.data))
      .catch(() => showToast('Failed to load KYC.', 'error'))
      .finally(() => setLoading(false));
  }, [page, status]);

  useEffect(() => { load(); }, [load]);

  const closePreview = () => {
    setPreviewOpen(false);
    setPreviewDoc(null);
    if (blobUrl) { URL.revokeObjectURL(blobUrl); setBlobUrl(null); }
  };

  const openPreview = async (doc: any) => {
    setPreviewOpen(true);
    setPreviewLoading(true);
    setPreviewDoc(null);
    setBlobUrl(null);
    setReviewing(null);
    setNotes('');
    try {
      // Step 1: fetch metadata
      const meta = await adminApi.getKycDoc(doc.id);
      setPreviewDoc({ ...meta.data });

      // Step 2: fetch file blob separately so metadata still shows on file error
      try {
        const token = useAuthStore.getState().accessToken;
        const resp  = await fetch(`/api/v1/admin/kyc/${doc.id}/serve`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (resp.ok) {
          const blob = await resp.blob();
          setBlobUrl(URL.createObjectURL(blob));
        } else {
          const body = await resp.json().catch(() => ({ message: resp.statusText }));
          console.error('File serve error:', resp.status, body);
          setBlobUrl(null); // show "file not available" state in viewer
        }
      } catch (fileErr) {
        console.error('File fetch threw:', fileErr);
        setBlobUrl(null);
      }
    } catch (metaErr) {
      console.error('KYC metadata error:', metaErr);
      showToast('Failed to load document.', 'error');
      setPreviewOpen(false);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleReview = async (id: string, action: 'APPROVED' | 'REJECTED') => {
    setSubmitting(true);
    try {
      await adminApi.reviewKyc(id, action, notes);
      showToast(`Document ${action.toLowerCase()}.`);
      closePreview();
      setNotes('');
      load();
    } catch { showToast('Review failed.', 'error'); }
    finally { setSubmitting(false); }
  };

  const isImage = (mime: string) => mime?.startsWith('image/');
  const isPdf   = (mime: string) => mime === 'application/pdf';

  const DOC_TYPE_LABELS: Record<string, string> = {
    NATIONAL_ID: 'National ID', PASSPORT: 'Passport', DRIVERS_LICENSE: "Driver's License",
    UTILITY_BILL: 'Utility Bill', BANK_STATEMENT: 'Bank Statement',
    CERTIFICATE_OF_INCORPORATION: 'Certificate of Incorporation', OTHER: 'Other',
  };

  return (
    <div className="space-y-4">
      {/* Filter */}
      <div className="flex gap-2">
        {['PENDING', 'APPROVED', 'REJECTED'].map(s => (
          <button key={s} onClick={() => { setStatus(s); setPage(1); }}
            className={cn('px-4 py-2 rounded-lg text-sm font-medium transition',
              status === s ? 'bg-primary text-primary-foreground' : 'border border-border hover:bg-accent'
            )}>
            {s}
          </button>
        ))}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : (
          <div className="divide-y divide-border">
            {data?.docs?.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-12">No {status.toLowerCase()} documents.</p>
            )}
            {data?.docs?.map((doc: any) => {
              const user = doc.organization?.users?.[0];
              return (
                <div key={doc.id} className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">{user?.firstName} {user?.lastName}</p>
                      <p className="text-sm text-muted-foreground">{user?.email}</p>
                      <div className="flex items-center gap-3 mt-2 flex-wrap">
                        <Badge label={DOC_TYPE_LABELS[doc.documentType] || doc.documentType} color="bg-muted text-muted-foreground" />
                        <Badge label={doc.status} color={STATUS_COLORS[doc.status] || ''} />
                        <span className="text-xs text-muted-foreground">{fmtDate(doc.createdAt)}</span>
                      </div>
                      {doc.reviewNotes && (
                        <p className="text-xs text-muted-foreground mt-1 italic">Note: {doc.reviewNotes}</p>
                      )}
                    </div>
                    <button onClick={() => openPreview(doc)}
                      className="flex-shrink-0 flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium hover:bg-accent transition">
                      <Eye className="w-4 h-4" /> Preview
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {data && <div className="p-4 border-t border-border"><Pagination page={page} pages={data.pages} onPage={setPage} /></div>}
      </div>

      {/* ── KYC Preview Modal ── */}
      {previewOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closePreview} />

          {/* Panel */}
          <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">

            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h2 className="font-semibold text-foreground">KYC Document Review</h2>
                  {previewDoc && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {DOC_TYPE_LABELS[previewDoc.documentType] || previewDoc.documentType} · {previewDoc.user?.firstName} {previewDoc.user?.lastName}
                    </p>
                  )}
                </div>
              </div>
              <button onClick={closePreview} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-accent transition text-muted-foreground hover:text-foreground">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {previewLoading ? (
              <div className="flex-1 flex items-center justify-center py-20">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Loading document…</p>
                </div>
              </div>
            ) : previewDoc ? (
              <div className="flex-1 flex overflow-hidden min-h-0">

                {/* Left — Document Viewer */}
                <div className="flex-1 bg-muted/30 flex flex-col overflow-hidden border-r border-border">
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-card flex-shrink-0">
                    <span className="text-xs font-medium text-muted-foreground truncate">{previewDoc.fileName}</span>
                    <a href={blobUrl || '#'} target="_blank" rel="noreferrer"
                      className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline flex-shrink-0 ml-3">
                      <FileText className="w-3.5 h-3.5" /> Open full
                    </a>
                  </div>
                  <div className="flex-1 overflow-auto flex items-center justify-center p-4">
                    {!blobUrl ? (
                      <div className="text-center space-y-3">
                        <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto">
                          <AlertCircle className="w-8 h-8 text-amber-500" />
                        </div>
                        <p className="text-sm font-medium text-foreground">File not available</p>
                        <p className="text-xs text-muted-foreground max-w-xs">The file may have been lost when the container was restarted.<br/>Ask the user to re-upload their document.</p>
                      </div>
                    ) : isImage(previewDoc.mimeType) ? (
                      <img
                        src={blobUrl}
                        alt={previewDoc.fileName}
                        className="max-w-full max-h-full object-contain rounded-xl shadow-lg border border-border"
                      />
                    ) : isPdf(previewDoc.mimeType) ? (
                      <iframe
                        src={blobUrl}
                        title={previewDoc.fileName}
                        className="w-full h-full min-h-[400px] rounded-xl border border-border bg-white"
                      />
                    ) : (
                      <div className="text-center space-y-3">
                        <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto">
                          <FileText className="w-8 h-8 text-muted-foreground" />
                        </div>
                        <p className="text-sm text-muted-foreground">Preview not available for this file type</p>
                        <a href={previewDoc.fileUrl} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90">
                          Download File
                        </a>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right — Details + Review */}
                <div className="w-80 flex flex-col overflow-y-auto flex-shrink-0">

                  {/* Submission details */}
                  <div className="p-5 space-y-4 border-b border-border">
                    <h3 className="text-sm font-semibold text-foreground">Submission Details</h3>
                    <div className="space-y-3">
                      {[
                        { label: 'Submitted by',   value: `${previewDoc.user?.firstName} ${previewDoc.user?.lastName}` },
                        { label: 'Email',           value: previewDoc.user?.email },
                        { label: 'Document type',   value: DOC_TYPE_LABELS[previewDoc.documentType] || previewDoc.documentType },
                        { label: 'File name',       value: previewDoc.fileName },
                        { label: 'File size',       value: `${(previewDoc.fileSize / 1024).toFixed(1)} KB` },
                        { label: 'File type',       value: previewDoc.mimeType },
                        { label: 'Submitted',       value: fmtDate(previewDoc.createdAt) },
                      ].map(({ label, value }) => (
                        <div key={label}>
                          <p className="text-xs text-muted-foreground">{label}</p>
                          <p className="text-sm font-medium text-foreground break-all">{value}</p>
                        </div>
                      ))}
                    </div>

                    {/* Current status badge */}
                    <div className="pt-1">
                      <p className="text-xs text-muted-foreground mb-1.5">Current status</p>
                      <Badge label={previewDoc.status} color={STATUS_COLORS[previewDoc.status] || ''} />
                    </div>

                    {previewDoc.reviewNotes && (
                      <div className="bg-muted/50 rounded-xl p-3">
                        <p className="text-xs font-medium text-muted-foreground mb-1">Review notes</p>
                        <p className="text-sm text-foreground">{previewDoc.reviewNotes}</p>
                      </div>
                    )}
                  </div>

                  {/* Review actions */}
                  {previewDoc.status === 'PENDING' && (
                    <div className="p-5 space-y-3">
                      <h3 className="text-sm font-semibold text-foreground">Review Decision</h3>
                      <textarea
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        placeholder="Add review notes (optional)…"
                        rows={3}
                        className="w-full px-3 py-2 border border-input rounded-xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                      />
                      <button
                        onClick={() => handleReview(previewDoc.id, 'APPROVED')}
                        disabled={submitting}
                        className="w-full flex items-center justify-center gap-2 py-2.5 bg-green-500 text-white rounded-xl text-sm font-semibold hover:bg-green-600 disabled:opacity-50 transition">
                        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                        Approve Document
                      </button>
                      <button
                        onClick={() => handleReview(previewDoc.id, 'REJECTED')}
                        disabled={submitting}
                        className="w-full flex items-center justify-center gap-2 py-2.5 bg-destructive text-destructive-foreground rounded-xl text-sm font-semibold hover:bg-destructive/90 disabled:opacity-50 transition">
                        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                        Reject Document
                      </button>
                    </div>
                  )}

                  {previewDoc.status !== 'PENDING' && (
                    <div className="p-5">
                      <div className={cn('rounded-xl p-4 text-sm font-medium text-center',
                        previewDoc.status === 'APPROVED' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
                      )}>
                        {previewDoc.status === 'APPROVED' ? '✓ Document Approved' : '✗ Document Rejected'}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}


// ─── Orders Tab ───────────────────────────────────────

function OrdersTab() {
  const [data, setData]         = useState<any>(null);
  const [loading, setLoading]   = useState(true);
  const [page, setPage]         = useState(1);
  const [search, setSearch]     = useState('');
  const [status, setStatus]     = useState('');
  const [productType, setProductType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [detail, setDetail]     = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast]       = useState<{ msg: string; ok: boolean } | null>(null);

  const activeFilters = [status, productType, dateFrom, dateTo].filter(Boolean).length;

  const showToastMsg = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const load = useCallback(() => {
    setLoading(true);
    adminApi.getOrders({ page, limit: 15, search: search || undefined, status: status || undefined, productType: productType || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined })
      .then(r => setData(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page, search, status, productType, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (id: string) => {
    setDetailLoading(true);
    setDetail({ id, loading: true });
    try {
      const res = await adminApi.getOrderDetail(id);
      setDetail(res.data);
    } catch { setDetail(null); }
    finally { setDetailLoading(false); }
  };

  const handleStatusUpdate = async (orderId: string, newStatus: string) => {
    setActionLoading(orderId + newStatus);
    try {
      await adminApi.updateOrderStatus(orderId, newStatus);
      showToastMsg(`Order moved to ${newStatus.replace(/_/g,' ')}`);
      load();
      if (detail?.id === orderId) openDetail(orderId);
    } catch (e: any) {
      showToastMsg(e.response?.data?.message || 'Action failed', false);
    } finally { setActionLoading(null); }
  };

  const handleIssue = async (orderId: string) => {
    setActionLoading(orderId + 'ISSUE');
    try {
      await adminApi.adminIssueOrder(orderId);
      showToastMsg('Certificate issued successfully! 🎉');
      load();
      setDetail(null);
    } catch (e: any) {
      showToastMsg(e.response?.data?.message || 'Issuance failed', false);
    } finally { setActionLoading(null); }
  };

  const PRODUCT_TYPES = ['DV','DV_MULTIDOMAIN','DV_WILDCARD','OV','OV_MULTIDOMAIN','OV_WILDCARD','EV','EV_MULTIDOMAIN'];
  const STATUSES = ['PENDING_PAYMENT','PAID','PENDING_VALIDATION','VALIDATING','PENDING_ISSUANCE','ISSUED','CANCELLED','REFUNDED'];

  // What actions are available per status
  const getActions = (o: any) => {
    const acts: { label: string; key: string; color: string; onClick: () => void }[] = [];
    if (o.status === 'PENDING_ISSUANCE') {
      acts.push({ label: '🎓 Issue', key: 'ISSUE', color: 'bg-green-600 hover:bg-green-700 text-white', onClick: () => handleIssue(o.id) });
    }
    if (o.status === 'PAID') {
      acts.push({ label: 'Start Validation', key: 'PENDING_VALIDATION', color: 'bg-blue-600 hover:bg-blue-700 text-white', onClick: () => handleStatusUpdate(o.id, 'PENDING_VALIDATION') });
    }
    if (o.status === 'PENDING_VALIDATION') {
      acts.push({ label: 'Mark Validating', key: 'VALIDATING', color: 'bg-purple-600 hover:bg-purple-700 text-white', onClick: () => handleStatusUpdate(o.id, 'VALIDATING') });
    }
    if (o.status === 'VALIDATING') {
      acts.push({ label: 'Ready to Issue', key: 'PENDING_ISSUANCE', color: 'bg-cyan-600 hover:bg-cyan-700 text-white', onClick: () => handleStatusUpdate(o.id, 'PENDING_ISSUANCE') });
    }
    if (['PAID','PENDING_VALIDATION','VALIDATING','PENDING_ISSUANCE'].includes(o.status)) {
      acts.push({ label: 'Cancel', key: 'CANCEL', color: 'border border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20', onClick: () => handleStatusUpdate(o.id, 'CANCELLED') });
    }
    return acts;
  };

  return (
    <div className="space-y-4">
      {/* Toast */}
      {toast && (
        <div className={cn('fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition',
          toast.ok ? 'bg-green-600 text-white' : 'bg-destructive text-destructive-foreground')}>
          {toast.msg}
        </div>
      )}

      {/* Order detail modal */}
      {detail && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setDetail(null)} />
          <div className="fixed inset-y-0 right-0 w-full max-w-lg bg-card border-l border-border z-50 overflow-y-auto">
            <div className="sticky top-0 bg-card border-b border-border px-5 py-4 flex items-center justify-between">
              <h3 className="font-semibold text-foreground">Order Detail</h3>
              <button onClick={() => setDetail(null)} className="text-muted-foreground hover:text-foreground transition">✕</button>
            </div>
            {detailLoading || detail.loading ? (
              <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
            ) : (
              <div className="p-5 space-y-5">
                {/* Order info */}
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Order</p>
                  <p className="font-mono text-sm font-semibold text-primary">{detail.orderNumber}</p>
                  <Badge label={detail.status} color={STATUS_COLORS[detail.status] || ''} />
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-xs text-muted-foreground mb-0.5">Customer</p><p className="font-medium">{detail.user?.firstName} {detail.user?.lastName}</p><p className="text-xs text-muted-foreground">{detail.user?.email}</p></div>
                  <div><p className="text-xs text-muted-foreground mb-0.5">Product</p><p className="font-medium">{detail.product?.name}</p><p className="text-xs text-muted-foreground">{detail.product?.type}</p></div>
                  <div><p className="text-xs text-muted-foreground mb-0.5">Domain</p><p className="font-mono text-xs">{detail.commonName || '—'}</p></div>
                  <div><p className="text-xs text-muted-foreground mb-0.5">Validity</p><p>{detail.validity?.replace(/_/g,' ')}</p></div>
                  <div><p className="text-xs text-muted-foreground mb-0.5">Price</p><p className="font-semibold text-green-600">₦{Number(detail.priceNgn || 0).toLocaleString('en-NG')}</p></div>
                  <div><p className="text-xs text-muted-foreground mb-0.5">Created</p><p>{detail.createdAt ? fmtDate(detail.createdAt) : '—'}</p></div>
                </div>

                {/* SANs */}
                {detail.sans?.length > 0 && (
                  <div><p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-2">SANs</p>
                    <div className="flex flex-wrap gap-1.5">
                      {detail.sans.map((s: string) => <span key={s} className="px-2 py-0.5 bg-muted rounded text-xs font-mono">{s}</span>)}
                    </div>
                  </div>
                )}

                {/* Certificate info */}
                {detail.certificate && (
                  <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 rounded-xl p-4 space-y-2">
                    <p className="text-xs font-semibold text-green-700 dark:text-green-400 uppercase tracking-wider">Certificate Issued</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div><p className="text-muted-foreground">Serial</p><p className="font-mono truncate">{detail.certificate.serialNumber}</p></div>
                      <div><p className="text-muted-foreground">Expires</p><p>{fmtDate(detail.certificate.expiresAt)}</p></div>
                    </div>
                  </div>
                )}

                {/* Actions */}
                {getActions(detail).length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Actions</p>
                    <div className="flex flex-wrap gap-2">
                      {getActions(detail).map(a => (
                        <button key={a.key} onClick={a.onClick}
                          disabled={!!actionLoading}
                          className={cn('px-3 py-2 rounded-lg text-xs font-medium transition flex items-center gap-1.5 disabled:opacity-50', a.color)}>
                          {actionLoading === detail.id + a.key ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                          {a.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* Search + filter bar */}
      <div className="space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { setPage(1); load(); } }}
              placeholder="Search customer, domain, order number…"
              className="w-full pl-9 pr-4 py-2 border border-input rounded-xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <button onClick={() => { setPage(1); load(); }}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition">
            Search
          </button>
          <button onClick={() => setShowFilters(s => !s)}
            className={cn('flex items-center gap-2 px-3 py-2 border rounded-xl text-sm transition',
              showFilters || activeFilters > 0 ? 'border-primary text-primary bg-primary/5' : 'border-border hover:bg-accent'
            )}>
            <SlidersHorizontal className="w-4 h-4" />
            {activeFilters > 0 && <span className="w-4 h-4 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">{activeFilters}</span>}
          </button>
        </div>
        {showFilters && (
          <div className="bg-muted/40 border border-border rounded-xl p-3 grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1">Status</label>
              <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}
                className="w-full px-2 py-1.5 border border-input rounded-lg bg-background text-xs focus:outline-none">
                <option value="">All</option>
                {STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1">Product Type</label>
              <select value={productType} onChange={e => { setProductType(e.target.value); setPage(1); }}
                className="w-full px-2 py-1.5 border border-input rounded-lg bg-background text-xs focus:outline-none">
                <option value="">All</option>
                {PRODUCT_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g,' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1">From</label>
              <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }}
                className="w-full px-2 py-1.5 border border-input rounded-lg bg-background text-xs focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1">To</label>
              <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }}
                className="w-full px-2 py-1.5 border border-input rounded-lg bg-background text-xs focus:outline-none" />
            </div>
            {activeFilters > 0 && (
              <div className="col-span-full flex justify-end">
                <button onClick={() => { setStatus(''); setProductType(''); setDateFrom(''); setDateTo(''); setPage(1); }}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition">
                  <X className="w-3 h-3" /> Clear
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : !data?.orders?.length ? (
          <div className="text-center py-12 text-muted-foreground text-sm">No orders found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  {['Order #', 'Customer', 'Product', 'Domain', 'Price', 'Status', 'Date', 'Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.orders.map((o: any) => (
                  <tr key={o.id} className="hover:bg-muted/30 transition">
                    <td className="px-4 py-3">
                      <button onClick={() => openDetail(o.id)}
                        className="font-mono text-xs text-primary hover:underline">{o.orderNumber}</button>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground whitespace-nowrap">{o.user.firstName} {o.user.lastName}</p>
                      <p className="text-xs text-muted-foreground">{o.user.email}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{o.product?.name}</td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs max-w-[140px] truncate">{o.commonName || '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{o.priceNgn ? `₦${Number(o.priceNgn).toLocaleString('en-NG')}` : '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap"><Badge label={o.status} color={STATUS_COLORS[o.status] || ''} /></td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{fmtDate(o.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {getActions(o).slice(0, 1).map(a => (
                          <button key={a.key} onClick={a.onClick}
                            disabled={!!actionLoading}
                            className={cn('px-2.5 py-1 rounded-lg text-xs font-medium transition flex items-center gap-1 disabled:opacity-50', a.color)}>
                            {actionLoading === o.id + a.key ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                            {a.label}
                          </button>
                        ))}
                        <button onClick={() => openDetail(o.id)}
                          className="px-2 py-1 rounded-lg text-xs border border-border hover:bg-accent transition">
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && <div className="p-4 border-t border-border"><Pagination page={page} pages={data.pages} onPage={setPage} /></div>}
      </div>
    </div>
  );
}


// ─── Audit Tab ────────────────────────────────────────

const AUDIT_ACTION_COLORS: Record<string, string> = {
  USER_LOGIN:        'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300',
  USER_LOGOUT:       'bg-gray-50 text-gray-600 dark:bg-gray-900 dark:text-gray-400',
  USER_REGISTER:     'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  USER_2FA_ENABLED:  'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
  USER_2FA_DISABLED: 'bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
  PASSWORD_CHANGED:  'bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300',
  KYC_SUBMITTED:     'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  KYC_APPROVED:      'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300',
  KYC_REJECTED:      'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
  ORDER_CREATED:     'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300',
  ORDER_CANCELLED:   'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
  WALLET_FUNDED:     'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300',
  WALLET_ADJUSTED:   'bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
  CERT_DOWNLOADED:   'bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300',
  CERT_CONVERTED:    'bg-cyan-50 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300',
  ADMIN_ACTION:      'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
};

const AUDIT_ACTIONS = [
  'USER_LOGIN','USER_LOGOUT','USER_REGISTER','USER_2FA_ENABLED','USER_2FA_DISABLED',
  'PASSWORD_CHANGED','KYC_SUBMITTED','KYC_APPROVED','KYC_REJECTED',
  'ORDER_CREATED','ORDER_CANCELLED','WALLET_FUNDED','WALLET_ADJUSTED',
  'CERT_DOWNLOADED','CERT_CONVERTED','ADMIN_ACTION',
];

function AuditTab() {
  const [data, setData]         = useState<any>(null);
  const [loading, setLoading]   = useState(true);
  const [page, setPage]         = useState(1);
  const [search, setSearch]     = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const params: any = { page, limit: 25 };
    if (search)       params.search   = search;
    if (actionFilter) params.action   = actionFilter;
    if (dateFrom)     params.dateFrom = dateFrom;
    if (dateTo)       params.dateTo   = dateTo;
    adminApi.getAuditLogs(params)
      .then(r => setData(r.data || r))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page, search, actionFilter, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    load();
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="flex gap-3 flex-wrap">
          <div className="flex-1 min-w-48">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (setPage(1), load())}
              placeholder="Search by user email or name..."
              className="w-full px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <select
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">All Actions</option>
            {AUDIT_ACTIONS.map(a => (
              <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-3 flex-wrap items-center">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">From</span>
            <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              className="px-3 py-1.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">To</span>
            <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              className="px-3 py-1.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          {(search || actionFilter || dateFrom || dateTo) && (
            <button
              onClick={() => { setSearch(''); setActionFilter(''); setDateFrom(''); setDateTo(''); setPage(1); }}
              className="flex items-center gap-1 px-3 py-1.5 text-xs text-muted-foreground border border-border rounded-lg hover:bg-accent transition"
            >
              <X className="w-3 h-3" /> Clear filters
            </button>
          )}
          <span className="text-xs text-muted-foreground ml-auto">
            {data?.total ?? 0} total entries
          </span>
        </div>
      </div>

      {/* Log Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : !data?.logs?.length ? (
          <div className="text-center py-12">
            <Activity className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No audit logs found</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {data.logs.map((log: any) => {
              const color = AUDIT_ACTION_COLORS[log.action] || 'bg-muted text-muted-foreground';
              const isExpanded = expanded === log.id;
              return (
                <div key={log.id}
                  className="px-5 py-3.5 hover:bg-accent/30 transition cursor-pointer"
                  onClick={() => setExpanded(isExpanded ? null : log.id)}
                >
                  <div className="flex items-center gap-3">
                    <span className={cn('px-2 py-0.5 text-xs font-medium rounded-full whitespace-nowrap flex-shrink-0', color)}>
                      {log.action.replace(/_/g, ' ')}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-foreground font-medium truncate">
                        {log.user ? `${log.user.firstName} ${log.user.lastName}` : 'System'}
                      </span>
                      <span className="text-xs text-muted-foreground ml-2">{log.user?.email}</span>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">
                      {fmtDate(log.createdAt)}
                    </span>
                    <ChevronDown className={cn('w-3.5 h-3.5 text-muted-foreground transition-transform flex-shrink-0', isExpanded && 'rotate-180')} />
                  </div>
                  {isExpanded && log.metadata && (
                    <div className="mt-3 p-3 bg-muted rounded-lg">
                      <p className="text-xs font-medium text-muted-foreground mb-1">Metadata</p>
                      <pre className="text-xs text-foreground font-mono whitespace-pre-wrap break-all">
                        {JSON.stringify(log.metadata, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {data && data.pages > 1 && (
          <div className="p-4 border-t border-border">
            <Pagination page={page} pages={data.pages} onPage={setPage} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Reusable Modal ───────────────────────────────────

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="font-semibold text-foreground">{title}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition">✕</button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}

// ─── Products Tab ─────────────────────────────────────

function ProductsTab({ showToast }: { showToast: any }) {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [editModal, setEditModal] = useState<any>(null);
  const [priceModal, setPriceModal] = useState<any>(null);
  const [createModal, setCreateModal] = useState(false);
  const [saving, setSaving] = useState(false);

  // Create form
  const [form, setForm] = useState({
    name: '', type: 'DV', description: '',
    maxSans: 1, supportsWildcard: false,
    prices: [{ validity: 'ONE_YEAR', priceNgn: '' }],
  });

  // Price form
  const [priceForm, setPriceForm] = useState({ validity: 'ONE_YEAR', priceNgn: '' });

  const load = useCallback(() => {
    setLoading(true);
    productsApi.listAll()
      .then(r => setProducts(r.data || []))
      .catch(() => showToast('Failed to load products.', 'error'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async (id: string) => {
    try {
      await productsApi.toggle(id);
      showToast('Product status updated.');
      load();
    } catch { showToast('Failed to toggle product.', 'error'); }
  };

  const handleCreate = async () => {
    setSaving(true);
    try {
      const prices = form.prices
        .filter(p => p.priceNgn)
        .map(p => ({ validity: p.validity, priceNgn: Number(p.priceNgn) }));
      await productsApi.create({ ...form, maxSans: Number(form.maxSans), prices });
      showToast('Product created.');
      setCreateModal(false);
      setForm({ name: '', type: 'DV', description: '', maxSans: 1, supportsWildcard: false, prices: [{ validity: 'ONE_YEAR', priceNgn: '' }] });
      load();
    } catch (e: any) {
      showToast(e?.response?.data?.message || 'Failed to create product.', 'error');
    } finally { setSaving(false); }
  };

  const handleUpdatePrice = async () => {
    if (!priceForm.priceNgn) { showToast('Price is required.', 'error'); return; }
    setSaving(true);
    try {
      await productsApi.upsertPrice(priceModal.id, priceForm.validity, Number(priceForm.priceNgn));
      showToast('Price updated.');
      setPriceModal(null);
      load();
    } catch (e: any) {
      showToast(e?.response?.data?.message || 'Failed to update price.', 'error');
    } finally { setSaving(false); }
  };

  const CERT_TYPES = ['DV','DV_MULTIDOMAIN','DV_WILDCARD','OV','OV_MULTIDOMAIN','OV_WILDCARD','EV','EV_MULTIDOMAIN'];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{products.length} product{products.length !== 1 ? 's' : ''} total</p>
        <button
          onClick={() => setCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition"
        >
          <Plus className="w-4 h-4" /> Add Product
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : (
        <div className="space-y-3">
          {products.map(p => (
            <div key={p.id} className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-foreground">{p.name}</h3>
                    <Badge label={p.type} color="bg-muted text-muted-foreground" />
                    <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium',
                      p.isActive ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                    )}>
                      {p.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{p.description}</p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {p.prices.map((price: any) => (
                      <span key={price.validity} className="text-xs px-2 py-1 bg-muted rounded-lg text-foreground">
                        {VALIDITY_LABELS[price.validity]}: {fmt(Number(price.priceNgn))}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => { setPriceModal(p); setPriceForm({ validity: 'ONE_YEAR', priceNgn: '' }); }}
                    className="p-2 border border-border rounded-lg hover:bg-accent transition" title="Edit Prices">
                    <Edit3 className="w-4 h-4 text-muted-foreground" />
                  </button>
                  <button onClick={() => handleToggle(p.id)}
                    className="p-2 border border-border rounded-lg hover:bg-accent transition" title="Toggle Active">
                    {p.isActive
                      ? <ToggleRight className="w-4 h-4 text-green-600" />
                      : <ToggleLeft className="w-4 h-4 text-muted-foreground" />
                    }
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Product Modal */}
      {createModal && (
        <Modal title="Add New Product" onClose={() => setCreateModal(false)}>
          <div className="space-y-4 max-h-96 overflow-y-auto">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">Product Name</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">Type</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                {CERT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">Description</label>
              <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">Max SANs</label>
                <input type="number" value={form.maxSans} onChange={e => setForm(f => ({ ...f, maxSans: Number(e.target.value) }))}
                  className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div className="flex items-end pb-2.5">
                <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                  <input type="checkbox" checked={form.supportsWildcard} onChange={e => setForm(f => ({ ...f, supportsWildcard: e.target.checked }))} />
                  Supports Wildcard
                </label>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Pricing</label>
              {form.prices.map((price, i) => (
                <div key={i} className="flex gap-2 mb-2">
                  <select value={price.validity} onChange={e => setForm(f => ({ ...f, prices: f.prices.map((p, j) => j === i ? { ...p, validity: e.target.value } : p) }))}
                    className="flex-1 px-3 py-2 border border-input rounded-lg bg-background text-xs focus:outline-none focus:ring-2 focus:ring-ring">
                    {['ONE_YEAR','TWO_YEARS','THREE_YEARS'].map(v => <option key={v} value={v}>{VALIDITY_LABELS[v]}</option>)}
                  </select>
                  <input type="number" placeholder="Price (₦)" value={price.priceNgn}
                    onChange={e => setForm(f => ({ ...f, prices: f.prices.map((p, j) => j === i ? { ...p, priceNgn: e.target.value } : p) }))}
                    className="flex-1 px-3 py-2 border border-input rounded-lg bg-background text-xs focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
              ))}
              <button onClick={() => setForm(f => ({ ...f, prices: [...f.prices, { validity: 'TWO_YEARS', priceNgn: '' }] }))}
                className="text-xs text-primary hover:underline">+ Add another validity</button>
            </div>
            <button onClick={handleCreate} disabled={saving}
              className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition flex items-center justify-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {saving ? 'Creating...' : 'Create Product'}
            </button>
          </div>
        </Modal>
      )}

      {/* Edit Price Modal */}
      {priceModal && (
        <Modal title={`Edit Prices — ${priceModal.name}`} onClose={() => setPriceModal(null)}>
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Current Prices</p>
              {priceModal.prices.map((price: any) => (
                <div key={price.validity} className="flex justify-between text-sm py-1 border-b border-border">
                  <span>{VALIDITY_LABELS[price.validity]}</span>
                  <span className="font-medium">{fmt(Number(price.priceNgn))}</span>
                </div>
              ))}
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">Validity Period</label>
              <select value={priceForm.validity} onChange={e => setPriceForm(f => ({ ...f, validity: e.target.value }))}
                className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                {['ONE_YEAR','TWO_YEARS','THREE_YEARS'].map(v => <option key={v} value={v}>{VALIDITY_LABELS[v]}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">New Price (₦)</label>
              <input type="number" value={priceForm.priceNgn} onChange={e => setPriceForm(f => ({ ...f, priceNgn: e.target.value }))}
                placeholder="e.g. 15000"
                className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <button onClick={handleUpdatePrice} disabled={saving}
              className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition flex items-center justify-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Update Price'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Admin Certificates Tab ───────────────────────────

function CertificatesTab({ showToast }: { showToast: any }) {
  const [data, setData]         = useState<any>(null);
  const [loading, setLoading]   = useState(true);
  const [page, setPage]         = useState(1);
  const [search, setSearch]     = useState('');
  const [status, setStatus]     = useState('');
  const [productType, setProductType] = useState('');
  const [expiryFrom, setExpiryFrom]   = useState('');
  const [expiryTo, setExpiryTo]       = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokeModal, setRevokeModal] = useState<{ id: string; cn: string } | null>(null);
  const [revokeReason, setRevokeReason] = useState('');

  const activeFilters = [status, productType, expiryFrom, expiryTo].filter(Boolean).length;

  const PRODUCT_TYPES = ['DV','DV_MULTIDOMAIN','DV_WILDCARD','OV','OV_MULTIDOMAIN','OV_WILDCARD','EV','EV_MULTIDOMAIN'];

  const load = useCallback(() => {
    setLoading(true);
    adminApi.getCertificates({
      page, limit: 15,
      search:      search      || undefined,
      status:      status      || undefined,
      productType: productType || undefined,
      expiryFrom:  expiryFrom  || undefined,
      expiryTo:    expiryTo    || undefined,
    })
      .then(r => setData(r.data))
      .catch(() => showToast('Failed to load certificates.', 'error'))
      .finally(() => setLoading(false));
  }, [page, search, status, productType, expiryFrom, expiryTo]);

  useEffect(() => { load(); }, [load]);

  const handleRevoke = async () => {
    if (!revokeModal) return;
    setRevoking(revokeModal.id);
    try {
      await adminApi.revokeCertificate(revokeModal.id, revokeReason);
      showToast(`Certificate for "${revokeModal.cn}" revoked.`);
      setRevokeModal(null);
      setRevokeReason('');
      load();
    } catch (e: any) {
      showToast(e?.response?.data?.message || 'Revocation failed.', 'error');
    } finally {
      setRevoking(null);
    }
  };

  const fmtExpiry = (days: number, isExpired: boolean, revokedAt: string | null) => {
    if (revokedAt) return <span className="text-gray-500 text-xs">Revoked</span>;
    if (isExpired) return <span className="text-red-600 dark:text-red-400 text-xs font-medium">Expired</span>;
    if (days <= 7)  return <span className="text-red-600 dark:text-red-400 text-xs font-semibold">{days}d</span>;
    if (days <= 30) return <span className="text-orange-600 dark:text-orange-400 text-xs font-semibold">{days}d</span>;
    if (days <= 90) return <span className="text-yellow-600 dark:text-yellow-400 text-xs">{days}d</span>;
    return <span className="text-green-600 dark:text-green-400 text-xs">{days}d</span>;
  };

  return (
    <div className="space-y-4">
      {/* Revoke confirmation modal */}
      {revokeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="font-semibold text-foreground text-lg">Revoke Certificate</h3>
            <p className="text-sm text-muted-foreground">
              You are about to revoke the certificate for <strong className="text-foreground">{revokeModal.cn}</strong>.
              This action is <strong>irreversible</strong>. The certificate owner will be notified.
            </p>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">
                Reason <span className="text-destructive">*</span>
              </label>
              <textarea
                value={revokeReason}
                onChange={e => setRevokeReason(e.target.value)}
                rows={3}
                placeholder="Describe the reason for revocation…"
                className="w-full px-3 py-2 border border-input rounded-xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => { setRevokeModal(null); setRevokeReason(''); }}
                className="flex-1 py-2.5 border border-border rounded-xl text-sm hover:bg-accent transition">
                Cancel
              </button>
              <button
                onClick={handleRevoke}
                disabled={!revokeReason.trim() || revoking !== null}
                className="flex-1 py-2.5 bg-destructive text-destructive-foreground rounded-xl text-sm font-medium hover:bg-destructive/90 disabled:opacity-50 transition flex items-center justify-center gap-2"
              >
                {revoking ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Revoke Certificate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search + Filters */}
      <div className="space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { setPage(1); load(); } }}
              placeholder="Search by domain, serial, customer…"
              className="w-full pl-9 pr-4 py-2 border border-input rounded-xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <button onClick={() => { setPage(1); load(); }}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition">
            Search
          </button>
          <button onClick={() => setShowFilters(s => !s)}
            className={cn('flex items-center gap-2 px-3 py-2 border rounded-xl text-sm transition',
              showFilters || activeFilters > 0 ? 'border-primary text-primary bg-primary/5' : 'border-border hover:bg-accent'
            )}>
            <SlidersHorizontal className="w-4 h-4" />
            {activeFilters > 0 && <span className="w-4 h-4 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">{activeFilters}</span>}
          </button>
        </div>

        {showFilters && (
          <div className="bg-muted/40 border border-border rounded-xl p-3 grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1">Status</label>
              <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}
                className="w-full px-2 py-1.5 border border-input rounded-lg bg-background text-xs focus:outline-none">
                <option value="">All</option>
                <option value="active">Active</option>
                <option value="expired">Expired</option>
                <option value="revoked">Revoked</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1">Product Type</label>
              <select value={productType} onChange={e => { setProductType(e.target.value); setPage(1); }}
                className="w-full px-2 py-1.5 border border-input rounded-lg bg-background text-xs focus:outline-none">
                <option value="">All</option>
                {PRODUCT_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g,' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1">Expiry From</label>
              <input type="date" value={expiryFrom} onChange={e => { setExpiryFrom(e.target.value); setPage(1); }}
                className="w-full px-2 py-1.5 border border-input rounded-lg bg-background text-xs focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider block mb-1">Expiry To</label>
              <input type="date" value={expiryTo} onChange={e => { setExpiryTo(e.target.value); setPage(1); }}
                className="w-full px-2 py-1.5 border border-input rounded-lg bg-background text-xs focus:outline-none" />
            </div>
            {activeFilters > 0 && (
              <div className="col-span-full flex justify-end">
                <button onClick={() => { setStatus(''); setProductType(''); setExpiryFrom(''); setExpiryTo(''); setPage(1); }}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition">
                  <X className="w-3 h-3" /> Clear
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : !data?.certificates?.length ? (
          <div className="text-center py-12 text-muted-foreground text-sm">No certificates found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  {['Customer', 'Domain / CN', 'Product', 'Serial', 'Issued', 'Expires', 'Days Left', 'Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.certificates.map((c: any) => (
                  <tr key={c.id} className={cn('hover:bg-muted/30 transition', c.revokedAt && 'opacity-60')}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground whitespace-nowrap">
                        {c.order.user.firstName} {c.order.user.lastName}
                      </p>
                      <p className="text-xs text-muted-foreground">{c.order.user.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{c.commonName}</p>
                      <p className="font-mono text-xs text-muted-foreground">{c.order.orderNumber}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{c.order.product.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground max-w-[100px] truncate" title={c.serialNumber}>
                      {c.serialNumber || '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{fmtDate(c.issuedAt)}</td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{fmtDate(c.expiresAt)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {fmtExpiry(c.daysUntilExpiry, c.isExpired, c.revokedAt)}
                    </td>
                    <td className="px-4 py-3">
                      {!c.revokedAt ? (
                        <button
                          onClick={() => setRevokeModal({ id: c.id, cn: c.commonName })}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium border border-destructive/40 text-destructive rounded-lg hover:bg-destructive/10 transition"
                        >
                          <XCircle className="w-3.5 h-3.5" /> Revoke
                        </button>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">Revoked {fmtDate(c.revokedAt)}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && <div className="p-4 border-t border-border"><Pagination page={page} pages={data.pages} onPage={setPage} /></div>}
      </div>
    </div>
  );
}

// ─── Analytics Tab (Module 17) ────────────────────────

const pctColor = (p: number) => p >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
const pctLabel = (p: number) => `${p >= 0 ? '+' : ''}${p}% vs last month`;

const STATUS_PALETTE: Record<string, string> = {
  ISSUED: '#22c55e', PAID: '#3b82f6', PENDING_PAYMENT: '#eab308',
  PENDING_VALIDATION: '#f97316', VALIDATING: '#a855f7',
  PENDING_ISSUANCE: '#06b6d4', CANCELLED: '#ef4444', REFUNDED: '#6b7280', EXPIRED: '#dc2626',
};
const CHART_COLORS = ['#6366f1','#22c55e','#f59e0b','#ef4444','#3b82f6','#a855f7','#14b8a6','#f97316'];

function GrowthCard({ label, current, pct, format }: { label: string; current: number; pct: number; format?: 'money' | 'number' }) {
  const value = format === 'money' ? fmt(current) : current.toLocaleString();
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">{label}</p>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      <p className={`text-xs mt-1 font-medium ${pctColor(pct)}`}>{pctLabel(pct)}</p>
    </div>
  );
}

function AnalyticsTab() {
  const [period, setPeriod]         = useState<'week' | 'month' | 'year'>('month');
  const [revenue, setRevenue]       = useState<any[]>([]);
  const [products, setProducts]     = useState<any[]>([]);
  const [statusBreak, setStatusBreak] = useState<any[]>([]);
  const [growth, setGrowth]         = useState<any>(null);
  const [loading, setLoading]       = useState(true);

  const load = useCallback(async (p: 'week' | 'month' | 'year' = period) => {
    setLoading(true);
    try {
      const [rev, prod, status, grow] = await Promise.all([
        adminApi.getRevenueChart(p),
        adminApi.getProductBreakdown(),
        adminApi.getOrderStatusBreakdown(),
        adminApi.getGrowthStats(),
      ]);
      setRevenue(rev.data || []);
      setProducts((prod.data || []).slice(0, 8));
      setStatusBreak(status.data || []);
      setGrowth(grow.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const totalOrders = statusBreak.reduce((s: number, r: any) => s + r.count, 0);

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">

      {/* Period toggle */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Reports & Analytics</h2>
        <div className="flex gap-1 bg-muted p-1 rounded-lg">
          {(['week', 'month', 'year'] as const).map(p => (
            <button key={p} onClick={() => { setPeriod(p); load(p); }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition capitalize ${
                period === p ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}>
              {p === 'week' ? '7 Days' : p === 'month' ? '30 Days' : '12 Months'}
            </button>
          ))}
        </div>
      </div>

      {/* Growth KPIs */}
      {growth && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <GrowthCard label="New Users"        current={growth.users.current}   pct={growth.users.pct} />
          <GrowthCard label="New Orders"       current={growth.orders.current}  pct={growth.orders.pct} />
          <GrowthCard label="Revenue"          current={growth.revenue.current} pct={growth.revenue.pct} format="money" />
          <GrowthCard label="Certs Issued"     current={growth.certs.current}   pct={growth.certs.pct} />
        </div>
      )}

      {/* Revenue + Orders area chart */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="font-semibold text-foreground mb-4">Revenue & Orders Over Time</h3>
        {revenue.length === 0 ? (
          <p className="text-center text-muted-foreground text-sm py-8">No data for this period.</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={revenue} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <defs>
                <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradOrders" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
              <YAxis yAxisId="left"  tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                tickFormatter={(v: number) => v >= 1000 ? `₦${(v/1000).toFixed(0)}k` : `₦${v}`} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
              <Tooltip
                contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                formatter={(value: any, name: string) => [
                  name === 'Revenue' ? fmt(value) : value,
                  name,
                ]}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area yAxisId="left"  type="monotone" dataKey="revenue" name="Revenue" stroke="#6366f1" fill="url(#gradRevenue)" strokeWidth={2} dot={false} />
              <Area yAxisId="right" type="monotone" dataKey="orders"  name="Orders"  stroke="#22c55e" fill="url(#gradOrders)"  strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Product breakdown bar chart */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold text-foreground mb-4">Orders by Product</h3>
          {products.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-8">No data yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={products} layout="vertical" margin={{ top: 0, right: 30, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} width={90} />
                <Tooltip
                  contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                  formatter={(v: any, n: string) => [n === 'Revenue' ? fmt(v) : v, n]}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="count"   name="Orders"  fill="#6366f1" radius={[0, 4, 4, 0]} />
                <Bar dataKey="revenue" name="Revenue" fill="#22c55e" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Order status pie chart */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold text-foreground mb-4">Orders by Status</h3>
          {statusBreak.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-8">No data yet.</p>
          ) : (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="55%" height={220}>
                <PieChart>
                  <Pie data={statusBreak} dataKey="count" nameKey="status"
                    cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={2}>
                    {statusBreak.map((entry: any, i: number) => (
                      <Cell key={entry.status} fill={STATUS_PALETTE[entry.status] || CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                    formatter={(v: any) => [`${v} (${totalOrders ? Math.round((v/totalOrders)*100) : 0}%)`, 'Orders']}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-1.5">
                {statusBreak.map((entry: any, i: number) => (
                  <div key={entry.status} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ background: STATUS_PALETTE[entry.status] || CHART_COLORS[i % CHART_COLORS.length] }} />
                      <span className="text-muted-foreground">{entry.status.replace(/_/g,' ')}</span>
                    </div>
                    <span className="font-medium text-foreground">{entry.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Product revenue table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="font-semibold text-foreground">Product Performance</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                {['Product', 'Type', 'Orders', 'Revenue', 'Avg. Price'].map(h => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {products.map((p: any, i: number) => (
                <tr key={p.name} className="hover:bg-muted/30 transition">
                  <td className="px-5 py-3 font-medium text-foreground">{p.name}</td>
                  <td className="px-5 py-3 text-muted-foreground">{p.type.replace(/_/g,' ')}</td>
                  <td className="px-5 py-3 text-foreground">{p.count}</td>
                  <td className="px-5 py-3 text-foreground">{fmt(p.revenue)}</td>
                  <td className="px-5 py-3 text-muted-foreground">{p.count > 0 ? fmt(Math.round(p.revenue / p.count)) : '—'}</td>
                </tr>
              ))}
              {products.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-muted-foreground text-sm">No orders yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}

// ─── Invoice Settings Tab ─────────────────────────────

const DEFAULT_SETTINGS = {
  companyName: 'CertPortal Ltd.', companyAddress: '', companyCity: '', companyState: '',
  companyCountry: 'Nigeria', companyPhone: '', companyEmail: '', companyWebsite: '',
  companyLogo: '', invoicePrefix: 'INV-', currency: 'NGN', currencySymbol: '₦',
  taxLabel: 'VAT', taxRate: 0, paymentTerms: 'Due on receipt', dueDays: 0,
  footerNote: 'Thank you for your business.', bankName: '', bankAccount: '', bankSort: '',
  accentColor: '#0ea5e9',
};

// ─── Stable form components (defined outside to prevent focus loss) ──

function InvoiceField({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-foreground">{label}</label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function InvoiceInput({
  value, onChange, placeholder, type = 'text'
}: {
  value: string | number;
  onChange: (val: string | number) => void;
  placeholder?: string;
  type?: string;
}) {
  // Local state so typing is smooth — syncs to parent on blur
  const [local, setLocal] = useState(String(value ?? ''));

  // Keep in sync if parent value changes externally (e.g. initial load)
  useEffect(() => { setLocal(String(value ?? '')); }, [value]);

  return (
    <input
      type={type}
      value={local}
      onChange={e => setLocal(e.target.value)}
      onBlur={() => onChange(type === 'number' ? Number(local) : local)}
      placeholder={placeholder}
      className="w-full px-3 py-2 border border-input rounded-xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
    />
  );
}

function InvoiceSettingsTab({ showToast }: { showToast: any }) {
  const [settings, setSettings] = useState<any>(DEFAULT_SETTINGS);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [preview, setPreview]   = useState(false);
  const [activeSection, setActiveSection] = useState<'company' | 'invoice' | 'payment' | 'appearance'>('company');

  useEffect(() => {
    adminApi.getInvoiceSettings()
      .then(r => setSettings({ ...DEFAULT_SETTINGS, ...r.data }))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const set = (key: string, value: any) => setSettings((s: any) => ({ ...s, [key]: value }));

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500_000) { showToast('Logo must be under 500KB', 'error'); return; }
    const reader = new FileReader();
    reader.onload = () => set('companyLogo', reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await adminApi.saveInvoiceSettings(settings);
      showToast('Invoice settings saved successfully!');
    } catch {
      showToast('Failed to save settings', 'error');
    } finally { setSaving(false); }
  };

  const accent = settings.accentColor || '#0ea5e9';

  const sections = [
    { id: 'company',    label: 'Company Info',  icon: '🏢' },
    { id: 'invoice',    label: 'Invoice Config', icon: '🧾' },
    { id: 'payment',    label: 'Payment Details',icon: '💳' },
    { id: 'appearance', label: 'Appearance',     icon: '🎨' },
  ] as const;

  // Field and Input defined as stable components above

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Invoice Settings</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Customize how invoices and receipts appear to customers</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setPreview(s => !s)}
            className="flex items-center gap-2 px-4 py-2 border border-border rounded-xl text-sm font-medium hover:bg-accent transition">
            <Eye className="w-4 h-4" /> {preview ? 'Hide Preview' : 'Live Preview'}
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>

      <div className={cn('gap-6', preview ? 'grid grid-cols-1 lg:grid-cols-2' : '')}>
        {/* Settings panel */}
        <div className="space-y-4">
          {/* Section nav */}
          <div className="flex gap-1 bg-muted p-1 rounded-xl overflow-x-auto">
            {sections.map(s => (
              <button key={s.id} onClick={() => setActiveSection(s.id)}
                className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition flex-shrink-0',
                  activeSection === s.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}>
                <span>{s.icon}</span>{s.label}
              </button>
            ))}
          </div>

          {/* ── Company Info ── */}
          {activeSection === 'company' && (
            <div className="bg-card border border-border rounded-2xl p-5 space-y-5">
              <h3 className="font-semibold text-foreground text-sm">Company Information</h3>

              {/* Logo upload */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Company Logo</label>
                <div className="flex items-center gap-4">
                  <div className="w-20 h-16 rounded-xl border border-border bg-muted flex items-center justify-center overflow-hidden">
                    {settings.companyLogo
                      ? <img src={settings.companyLogo} alt="logo" className="w-full h-full object-contain p-1" />
                      : <span className="text-2xl font-bold" style={{ color: accent }}>{(settings.companyName || 'C')[0]}</span>
                    }
                  </div>
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-2 px-3 py-2 border border-border rounded-xl text-sm cursor-pointer hover:bg-accent transition">
                      <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                      Upload Logo
                    </label>
                    {settings.companyLogo && (
                      <button onClick={() => set('companyLogo', '')}
                        className="text-xs text-destructive hover:underline">Remove</button>
                    )}
                    <p className="text-xs text-muted-foreground">PNG, JPG · max 500KB</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <InvoiceField label="Company Name"><InvoiceInput value={settings.companyName ?? ''} onChange={v => set('companyName', v)} placeholder="Your Company Ltd." /></InvoiceField>
                <InvoiceField label="Address Line"><InvoiceInput value={settings.companyAddress ?? ''} onChange={v => set('companyAddress', v)} placeholder="1 Business Street" /></InvoiceField>
                <div className="grid grid-cols-2 gap-3">
                  <InvoiceField label="City"><InvoiceInput value={settings.companyCity ?? ''} onChange={v => set('companyCity', v)} placeholder="Lagos" /></InvoiceField>
                  <InvoiceField label="State"><InvoiceInput value={settings.companyState ?? ''} onChange={v => set('companyState', v)} placeholder="Lagos State" /></InvoiceField>
                </div>
                <InvoiceField label="Country"><InvoiceInput value={settings.companyCountry ?? ''} onChange={v => set('companyCountry', v)} placeholder="Nigeria" /></InvoiceField>
                <div className="grid grid-cols-2 gap-3">
                  <InvoiceField label="Phone"><InvoiceInput value={settings.companyPhone ?? ''} onChange={v => set('companyPhone', v)} placeholder="+234 800 000 0000" /></InvoiceField>
                  <InvoiceField label="Email"><InvoiceInput value={settings.companyEmail ?? ''} onChange={v => set('companyEmail', v)} placeholder="billing@company.com" /></InvoiceField>
                </div>
                <InvoiceField label="Website" hint="Optional — shown in invoice footer">
                  <InvoiceInput value={settings.companyWebsite ?? ''} onChange={v => set('companyWebsite', v)} placeholder="https://yourcompany.com" />
                </InvoiceField>
              </div>
            </div>
          )}

          {/* ── Invoice Config ── */}
          {activeSection === 'invoice' && (
            <div className="bg-card border border-border rounded-2xl p-5 space-y-5">
              <h3 className="font-semibold text-foreground text-sm">Invoice Configuration</h3>
              <div className="grid grid-cols-2 gap-4">
                <InvoiceField label="Invoice Number Prefix" hint="e.g. INV-, CERT-, #">
                  <InvoiceInput value={settings.invoicePrefix ?? ''} onChange={v => set('invoicePrefix', v)} placeholder="INV-" />
                </InvoiceField>
                <InvoiceField label="Currency Symbol">
                  <InvoiceInput value={settings.currencySymbol ?? ''} onChange={v => set('currencySymbol', v)} placeholder="₦" />
                </InvoiceField>
                <InvoiceField label="Tax / VAT Label">
                  <InvoiceInput value={settings.taxLabel ?? ''} onChange={v => set('taxLabel', v)} placeholder="VAT" />
                </InvoiceField>
                <InvoiceField label="Tax Rate (%)" hint="Set 0 to disable">
                  <InvoiceInput value={settings.taxRate ?? ''} onChange={v => set('taxRate', v)} placeholder="0" type="number" />
                </InvoiceField>
              </div>
              <InvoiceField label="Payment Terms">
                <select value={settings.paymentTerms}
                  onChange={e => set('paymentTerms', e.target.value)}
                  className="w-full px-3 py-2 border border-input rounded-xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                  {['Due on receipt','Net 7','Net 14','Net 30','Net 60'].map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </InvoiceField>
              <InvoiceField label="Due Days" hint="0 = due upon receipt">
                <InvoiceInput value={settings.dueDays ?? ''} onChange={v => set('dueDays', v)} placeholder="0" type="number" />
              </InvoiceField>
              <InvoiceField label="Invoice Footer Note">
                <textarea value={settings.footerNote}
                  onChange={e => set('footerNote', e.target.value)}
                  rows={3} placeholder="Thank you for your business…"
                  className="w-full px-3 py-2 border border-input rounded-xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
              </InvoiceField>
            </div>
          )}

          {/* ── Payment Details ── */}
          {activeSection === 'payment' && (
            <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
              <h3 className="font-semibold text-foreground text-sm">Bank / Payment Details</h3>
              <p className="text-xs text-muted-foreground">These appear on invoices to help customers make bank transfers.</p>
              <InvoiceField label="Bank Name"><InvoiceInput value={settings.bankName ?? ''} onChange={v => set('bankName', v)} placeholder="First Bank Nigeria" /></InvoiceField>
              <InvoiceField label="Account Number"><InvoiceInput value={settings.bankAccount ?? ''} onChange={v => set('bankAccount', v)} placeholder="0123456789" /></InvoiceField>
              <InvoiceField label="Sort Code / Branch"><InvoiceInput value={settings.bankSort ?? ''} onChange={v => set('bankSort', v)} placeholder="011151003" /></InvoiceField>
            </div>
          )}

          {/* ── Appearance ── */}
          {activeSection === 'appearance' && (
            <div className="bg-card border border-border rounded-2xl p-5 space-y-5">
              <h3 className="font-semibold text-foreground text-sm">Invoice Appearance</h3>
              <InvoiceField label="Accent Color" hint="Used for the invoice header, table headers, and total line">
                <div className="flex items-center gap-3">
                  <input type="color" value={settings.accentColor}
                    onChange={e => set('accentColor', e.target.value)}
                    className="w-12 h-10 rounded-lg border border-border cursor-pointer bg-background" />
                  <InvoiceInput value={settings.accentColor ?? ''} onChange={v => set('accentColor', v)} placeholder="#0ea5e9" />
                </div>
              </InvoiceField>
              <div className="grid grid-cols-4 gap-2">
                {['#0ea5e9','#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#111827'].map(c => (
                  <button key={c} onClick={() => set('accentColor', c)}
                    className={cn('h-10 rounded-lg border-2 transition', settings.accentColor === c ? 'border-foreground scale-105' : 'border-transparent')}
                    style={{ background: c }} title={c} />
                ))}
              </div>
              <div className="bg-muted/40 rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-2 font-medium">Preview accent</p>
                <div className="h-6 rounded-lg" style={{ background: accent }} />
                <p className="text-xs font-mono text-muted-foreground mt-2">{accent}</p>
              </div>
            </div>
          )}
        </div>

        {/* Live Preview */}
        {preview && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Invoice Preview</p>
            <div className="border border-border rounded-2xl overflow-hidden bg-white" style={{ height: '700px' }}>
              <InvoicePreview settings={settings} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Invoice Live Preview ─────────────────────────────

function InvoicePreview({ settings }: { settings: any }) {
  const accent  = settings.accentColor || '#0ea5e9';
  const sym     = settings.currencySymbol || '₦';
  const fmt     = (n: number) => `${sym}${n.toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
  const today   = new Date().toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' });
  const subtotal = 25000; // Sample amount for preview
  const tax      = settings.taxRate > 0 ? +(subtotal * settings.taxRate / 100).toFixed(2) : 0;
  const total    = subtotal + tax;
  const invNum   = `${settings.invoicePrefix}PREVIEW01`;

  return (
    <div className="overflow-auto h-full">
      <div style={{ fontFamily: 'sans-serif', color: '#111827', background: '#fff', padding: '32px', fontSize: '12px', lineHeight: 1.5, minWidth: '500px' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px', paddingBottom: '20px', borderBottom: `2px solid ${accent}` }}>
          <div>
            {settings.companyLogo
              ? <img src={settings.companyLogo} alt="logo" style={{ maxHeight: '48px', maxWidth: '140px', objectFit: 'contain' }} />
              : <div style={{ width: '40px', height: '40px', background: accent, borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '18px', fontWeight: 900 }}>{(settings.companyName || 'C')[0]}</div>
            }
            <div style={{ fontWeight: 700, fontSize: '14px', marginTop: '8px' }}>{settings.companyName || 'Your Company'}</div>
            <div style={{ color: '#6b7280', fontSize: '11px', lineHeight: 1.8, marginTop: '2px' }}>
              {settings.companyAddress}{settings.companyCity ? `, ${settings.companyCity}` : ''}<br/>
              {settings.companyEmail}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '28px', fontWeight: 900, letterSpacing: '2px', textTransform: 'uppercase', color: accent }}>Invoice</div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#374151', marginTop: '4px' }}>{invNum}</div>
            <div style={{ fontSize: '11px', color: '#6b7280' }}>Issued: {today}</div>
          </div>
        </div>

        {/* Meta */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '14px 18px', marginBottom: '24px' }}>
          {[
            { label: 'Invoice Date', value: today },
            { label: 'Due Date',     value: settings.dueDays === 0 ? 'Upon Receipt' : today },
            { label: 'Status',       value: '✓ Paid' },
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#9ca3af', marginBottom: '3px' }}>{label}</div>
              <div style={{ fontSize: '12px', fontWeight: 600 }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Bill To / From */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
          <div>
            <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#9ca3af', marginBottom: '6px' }}>Billed To</div>
            <div style={{ fontWeight: 700, fontSize: '13px' }}>John Doe</div>
            <div style={{ color: '#6b7280', fontSize: '11px' }}>john@example.com</div>
          </div>
          <div>
            <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: '#9ca3af', marginBottom: '6px' }}>From</div>
            <div style={{ fontWeight: 700, fontSize: '13px' }}>{settings.companyName || 'Your Company'}</div>
            <div style={{ color: '#6b7280', fontSize: '11px' }}>{settings.companyEmail}</div>
          </div>
        </div>

        {/* Line Items */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px' }}>
          <thead>
            <tr style={{ background: accent, color: '#fff' }}>
              {['Description', 'Unit Cost', 'Qty', 'Line Total'].map((h, i) => (
                <th key={h} style={{ padding: '8px 12px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', textAlign: i === 0 ? 'left' : 'right' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
              <td style={{ padding: '12px', fontWeight: 600 }}>SSL/TLS Certificate — example.com (1 Year DV) <span style={{fontSize:'10px',color:'#9ca3af'}}>[sample]</span></td>
              <td style={{ padding: '12px', textAlign: 'right' }}>{fmt(subtotal)}</td>
              <td style={{ padding: '12px', textAlign: 'right' }}>1</td>
              <td style={{ padding: '12px', textAlign: 'right' }}>{fmt(subtotal)}</td>
            </tr>
          </tbody>
        </table>

        {/* Totals */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
          <div style={{ width: '220px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: '12px', color: '#374151', borderBottom: '1px solid #f3f4f6' }}>
              <span>Subtotal</span><span>{fmt(subtotal)}</span>
            </div>
            {settings.taxRate > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: '11px', color: '#6b7280', borderBottom: '1px solid #f3f4f6' }}>
                <span>{settings.taxLabel} ({settings.taxRate}%)</span><span>{fmt(tax)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 5px', fontSize: '15px', fontWeight: 800, borderTop: `2px solid ${accent}`, color: '#111827' }}>
              <span>Invoice Total</span><span>{fmt(total)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 700, color: '#15803d' }}>
              <span>Balance Due</span><span>{fmt(0)}</span>
            </div>
          </div>
        </div>

        {/* Payment Details */}
        {(settings.bankName || settings.bankAccount) && (
          <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '10px', padding: '14px 18px', marginBottom: '20px' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '1px', color: accent, marginBottom: '8px' }}>Payment Information</div>
            <div style={{ fontSize: '11px', color: '#374151', lineHeight: 1.9 }}>
              {settings.bankName    && <div><strong>Bank:</strong> {settings.bankName}</div>}
              {settings.bankAccount && <div><strong>Account:</strong> {settings.bankAccount}</div>}
              {settings.bankSort    && <div><strong>Sort Code:</strong> {settings.bankSort}</div>}
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '14px', fontSize: '10px', color: '#9ca3af', textAlign: 'center', lineHeight: 1.9 }}>
          <p>{settings.footerNote}</p>
          <p style={{ marginTop: '4px' }}>Invoice ID: preview-only · {settings.companyWebsite}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Admin Management Tab (SUPER_ADMIN only) ──────────

function AdminManagementTab({ showToast, currentUser }: { showToast: any; currentUser: any }) {
  const [users, setUsers]         = useState<any[]>([]);
  const [admins, setAdmins]       = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [roleModal, setRoleModal] = useState<any>(null);
  const [newRole, setNewRole]     = useState('');
  const [saving, setSaving]       = useState(false);

  const loadAdmins = useCallback(() => {
    setLoading(true);
    Promise.all([
      adminApi.getUsers({ page: 1, limit: 100, role: 'ADMIN' }),
      adminApi.getUsers({ page: 1, limit: 100, role: 'SUPER_ADMIN' }),
      search ? adminApi.getUsers({ page: 1, limit: 20, search, role: 'CUSTOMER' }) : Promise.resolve({ data: { users: [] } }),
    ]).then(([adminRes, superRes, searchRes]) => {
      const adminUsers = adminRes.data?.users || [];
      const superUsers = superRes.data?.users || [];
      setAdmins([...superUsers, ...adminUsers]);
      setUsers(search ? (searchRes.data?.users || []) : []);
    }).catch(() => showToast('Failed to load users.', 'error'))
      .finally(() => setLoading(false));
  }, [search]);

  useEffect(() => { loadAdmins(); }, [loadAdmins]);

  const handleRoleChange = async () => {
    if (!roleModal || !newRole) return;
    // Prevent demoting yourself
    if (roleModal.id === currentUser?.id && newRole !== 'SUPER_ADMIN') {
      showToast('You cannot change your own role.', 'error'); return;
    }
    setSaving(true);
    try {
      await adminApi.updateUserRole(roleModal.id, newRole);
      showToast(`${roleModal.firstName} ${roleModal.lastName} is now ${newRole.replace('_', ' ')}.`);
      setRoleModal(null);
      loadAdmins();
    } catch (e: any) {
      showToast(e?.response?.data?.message || 'Failed to update role.', 'error');
    } finally { setSaving(false); }
  };

  const ROLE_META: Record<string, { label: string; color: string; bg: string }> = {
    SUPER_ADMIN: { label: 'Super Admin', color: 'text-purple-700 dark:text-purple-300', bg: 'bg-purple-100 dark:bg-purple-900' },
    ADMIN:       { label: 'Admin',       color: 'text-blue-700 dark:text-blue-300',     bg: 'bg-blue-100 dark:bg-blue-900' },
    CUSTOMER:    { label: 'Customer',    color: 'text-gray-700 dark:text-gray-300',     bg: 'bg-gray-100 dark:bg-gray-800' },
  };

  const RoleBadge = ({ role }: { role: string }) => {
    const m = ROLE_META[role] || ROLE_META.CUSTOMER;
    return <span className={cn('px-2 py-0.5 rounded-full text-xs font-semibold', m.bg, m.color)}>{m.label}</span>;
  };

  const AdminRow = ({ u }: { u: any }) => (
    <tr className="hover:bg-muted/30 transition">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm flex-shrink-0">
            {u.firstName?.[0]}{u.lastName?.[0]}
          </div>
          <div>
            <p className="font-medium text-foreground text-sm">{u.firstName} {u.lastName}
              {u.id === currentUser?.id && <span className="ml-1.5 text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">You</span>}
            </p>
            <p className="text-xs text-muted-foreground">{u.email}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
      <td className="px-4 py-3 text-xs text-muted-foreground">{fmtDate(u.createdAt)}</td>
      <td className="px-4 py-3">
        {u.id !== currentUser?.id && (
          <button type="button" onClick={() => { setRoleModal(u); setNewRole(u.role); }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-accent transition">
            <Shield className="w-3.5 h-3.5" /> Change Role
          </button>
        )}
      </td>
    </tr>
  );

  return (
    <div className="space-y-6">
      {/* Current Admins */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h3 className="font-semibold text-foreground">Current Admins</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{admins.length} admin{admins.length !== 1 ? 's' : ''} with elevated access</p>
          </div>
        </div>
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
        ) : admins.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">No admins found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  {['Admin', 'Role', 'Added', 'Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {admins.map((u: any) => <AdminRow key={u.id} u={u} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Promote a user */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h3 className="font-semibold text-foreground">Promote a User</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Search for a customer and grant them admin access</p>
          </div>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input value={searchInput} onChange={e => setSearchInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && setSearch(searchInput)}
                placeholder="Search by name or email..."
                className="pl-8 pr-3 py-2 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring w-64" />
            </div>
            <button type="button" onClick={() => setSearch(searchInput)}
              className="px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition">
              Search
            </button>
          </div>
        </div>
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
        ) : users.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">
            {search ? 'No customers found matching your search.' : 'Search for a user above to promote them.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  {['User', 'Role', 'Joined', 'Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.slice(0, 10).map((u: any) => <AdminRow key={u.id} u={u} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Role change modal */}
      {roleModal && (
        <Modal title={`Change Role — ${roleModal.firstName} ${roleModal.lastName}`} onClose={() => setRoleModal(null)}>
          <div className="space-y-5">
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                {roleModal.firstName?.[0]}{roleModal.lastName?.[0]}
              </div>
              <div>
                <p className="font-medium text-foreground text-sm">{roleModal.firstName} {roleModal.lastName}</p>
                <p className="text-xs text-muted-foreground">{roleModal.email}</p>
              </div>
              <div className="ml-auto"><RoleBadge role={roleModal.role} /></div>
            </div>

            <div>
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Select New Role</label>
              <div className="space-y-2">
                {(['CUSTOMER', 'ADMIN', 'SUPER_ADMIN'] as const).map(role => {
                  const m = ROLE_META[role];
                  const descriptions: Record<string, string> = {
                    CUSTOMER:    'Standard user — no admin access',
                    ADMIN:       'Can manage users, KYC, orders and certificates',
                    SUPER_ADMIN: 'Full access including admin management',
                  };
                  return (
                    <label key={role} className={cn(
                      'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition',
                      newRole === role ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent'
                    )}>
                      <input type="radio" name="role" value={role} checked={newRole === role}
                        onChange={() => setNewRole(role)} className="sr-only" />
                      <div className={cn('w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0',
                        newRole === role ? 'border-primary' : 'border-muted-foreground')}>
                        {newRole === role && <div className="w-2 h-2 rounded-full bg-primary" />}
                      </div>
                      <div className="flex-1">
                        <span className={cn('text-sm font-medium', m.color)}>{m.label}</span>
                        <p className="text-xs text-muted-foreground">{descriptions[role]}</p>
                      </div>
                      <RoleBadge role={role} />
                    </label>
                  );
                })}
              </div>
            </div>

            {newRole !== roleModal.role && (
              <div className="p-3 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <p className="text-xs text-yellow-800 dark:text-yellow-200 font-medium">
                  ⚠️ Changing from <strong>{ROLE_META[roleModal.role]?.label}</strong> to <strong>{ROLE_META[newRole]?.label}</strong>
                  {newRole === 'CUSTOMER' ? ' will remove all admin access immediately.' : ' will grant elevated privileges.'}
                </p>
              </div>
            )}

            <button type="button" onClick={handleRoleChange}
              disabled={saving || newRole === roleModal.role}
              className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition flex items-center justify-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
              {saving ? 'Updating...' : 'Apply Role Change'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
