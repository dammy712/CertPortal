import { useState, useEffect, useCallback } from 'react';
import {
  Wallet, Receipt, Plus, ArrowDownCircle, ArrowUpCircle,
  RefreshCw, ExternalLink, Loader2, CheckCircle2,
  AlertCircle, Filter, FileDown
} from 'lucide-react';
import { walletApi } from '@/api/wallet.api';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────

interface Transaction {
  id: string;
  type: string;
  amountNgn: number;
  balanceBefore: number;
  balanceAfter: number;
  description: string;
  reference: string;
  paystackStatus?: string;
  createdAt: string;
}

interface WalletData {
  id: string;
  balanceNgn: number;
  transactions: Transaction[];
}

// ─── Helpers ──────────────────────────────────────────

const formatNgn = (amount: number) =>
  `₦${Number(amount).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;

const formatDate = (date: string) =>
  new Date(date).toLocaleDateString('en-NG', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

const txTypeLabel: Record<string, string> = {
  WALLET_FUNDING: 'Wallet Funding',
  CERTIFICATE_PURCHASE: 'Certificate Purchase',
  REFUND: 'Refund',
  ADMIN_ADJUSTMENT: 'Admin Adjustment',
};

const txTypeColor: Record<string, string> = {
  WALLET_FUNDING: 'text-green-600 dark:text-green-400',
  CERTIFICATE_PURCHASE: 'text-red-600 dark:text-red-400',
  REFUND: 'text-blue-600 dark:text-blue-400',
  ADMIN_ADJUSTMENT: 'text-purple-600 dark:text-purple-400',
};

const txIcon = (type: string) => {
  if (type === 'WALLET_FUNDING' || type === 'REFUND') {
    return <ArrowDownCircle className="w-4 h-4 text-green-500" />;
  }
  return <ArrowUpCircle className="w-4 h-4 text-red-500" />;
};

// ─── Fund Modal ───────────────────────────────────────

const QUICK_AMOUNTS = [1000, 5000, 10000, 25000, 50000, 100000];

function FundModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [amount, setAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [paymentUrl, setPaymentUrl] = useState('');
  const [reference, setReference] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [devMode, setDevMode] = useState(false);

  const handleFund = async () => {
    const numAmount = Number(amount);
    if (!numAmount || numAmount < 100) {
      setError('Minimum amount is ₦100');
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      const result = await walletApi.fundWallet(numAmount);
      const data = result.data;
      setReference(data.reference);

      if (data.devMode) {
        setDevMode(true);
      } else if (data.authorizationUrl) {
        setPaymentUrl(data.authorizationUrl);
        window.open(data.authorizationUrl, '_blank');
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to initialize payment.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!reference) return;
    setVerifying(true);
    setError('');
    try {
      await walletApi.verifyPayment(reference);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Verification failed. Please try again.');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <StatementExport />

      <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl">
        <div className="p-6 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Fund Wallet</h2>
          <p className="text-sm text-muted-foreground mt-1">Add money to your CertPortal wallet</p>
        </div>

        <div className="p-6 space-y-5">
          {/* Quick amounts */}
          {!paymentUrl && !devMode && (
            <>
              <div>
                <label className="block text-sm font-medium text-foreground mb-3">Quick Select</label>
                <div className="grid grid-cols-3 gap-2">
                  {QUICK_AMOUNTS.map((a) => (
                    <button
                      key={a}
                      onClick={() => setAmount(String(a))}
                      className={cn(
                        'py-2 text-sm rounded-lg border transition',
                        amount === String(a)
                          ? 'border-primary bg-primary/10 text-primary font-medium'
                          : 'border-border text-muted-foreground hover:bg-accent'
                      )}
                    >
                      {formatNgn(a)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Or enter amount
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">₦</span>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    min="100"
                    className="w-full pl-8 pr-4 py-2.5 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring transition"
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Minimum: ₦100</p>
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}
            </>
          )}

          {/* Dev mode - auto approve */}
          {devMode && (
            <div className="space-y-4">
              <div className="p-4 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg">
                <p className="text-sm font-medium text-amber-700 dark:text-amber-300 mb-1">
                  🔧 Development Mode
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  No Paystack key configured. Click "Confirm Payment" to simulate a successful payment.
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                Amount: <span className="font-semibold text-foreground">{formatNgn(Number(amount))}</span>
              </p>
              {error && (
                <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}
            </div>
          )}

          {/* Paystack redirect */}
          {paymentUrl && !devMode && (
            <div className="space-y-4">
              <div className="p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  A Paystack payment page has opened in a new tab. Complete your payment there, then click "I've Paid" below.
                </p>
              </div>
              <button
                onClick={() => window.open(paymentUrl, '_blank')}
                className="flex items-center gap-2 text-sm text-primary hover:underline"
              >
                <ExternalLink className="w-4 h-4" />
                Reopen payment page
              </button>
              {error && (
                <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-6 pt-0 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 text-sm border border-border rounded-lg hover:bg-accent transition"
          >
            Cancel
          </button>

          {!paymentUrl && !devMode ? (
            <button
              onClick={handleFund}
              disabled={isLoading || !amount}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition"
            >
              {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              {isLoading ? 'Initializing...' : 'Proceed to Pay'}
            </button>
          ) : (
            <button
              onClick={handleVerify}
              disabled={verifying}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition"
            >
              {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {verifying ? 'Verifying...' : devMode ? 'Confirm Payment' : "I've Paid"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Wallet Page ─────────────────────────────────

// ─── Statement Export Component ─────────────────────────
function StatementExport() {
  const [from, setFrom]           = useState('');
  const [to, setTo]               = useState('');
  const [downloading, setDownloading] = useState(false);
  const [showPanel, setShowPanel] = useState(false);

  const handleExport = async () => {
    setDownloading(true);
    try {
      await walletApi.downloadStatement(from || undefined, to || undefined);
    } catch {
      // silent
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileDown className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Account Statement</span>
        </div>
        <button onClick={() => setShowPanel((s: boolean) => !s)}
          className="text-xs text-primary hover:underline font-medium">
          {showPanel ? 'Hide' : 'Export CSV'}
        </button>
      </div>
      {showPanel && (
        <div className="px-4 pb-4 border-t border-border pt-3 flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">From</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="px-3 py-1.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">To</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="px-3 py-1.5 border border-input rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <button onClick={handleExport} disabled={downloading}
            className="flex items-center gap-2 px-4 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition">
            {downloading
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <FileDown className="w-3.5 h-3.5" />}
            {downloading ? 'Exporting…' : 'Download CSV'}
          </button>
          <p className="text-xs text-muted-foreground">Leave dates blank to export all transactions.</p>
        </div>
      )}
    </div>
  );
}

export default function WalletPage() {
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showFundModal, setShowFundModal] = useState(false);
  const [filter, setFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ total: 0, totalPages: 1 });

  const loadWallet = useCallback(async () => {
    try {
      const result = await walletApi.getWallet();
      setWallet(result.data);
    } catch (err) {
      console.error('Failed to load wallet:', err);
    }
  }, []);

  const loadTransactions = useCallback(async () => {
    try {
      const type = filter === 'ALL' ? undefined : filter;
      const result = await walletApi.getTransactions(page, 20, type);
      setTransactions(result.data);
      setMeta(result.meta);
    } catch (err) {
      console.error('Failed to load transactions:', err);
    }
  }, [filter, page]);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      await Promise.all([loadWallet(), loadTransactions()]);
      setIsLoading(false);
    };
    load();
  }, [loadWallet, loadTransactions]);

  // Check for payment return
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('status');
    const ref = params.get('ref');
    if (status === 'success' && ref) {
      walletApi.verifyPayment(ref).then(() => {
        loadWallet();
        loadTransactions();
        window.history.replaceState({}, '', '/wallet');
      }).catch(console.error);
    }
  }, [loadWallet, loadTransactions]);

  const handleFundSuccess = () => {
    loadWallet();
    loadTransactions();
  };

  const filters = ['ALL', 'WALLET_FUNDING', 'CERTIFICATE_PURCHASE', 'REFUND', 'ADMIN_ADJUSTMENT'];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Wallet</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your funds and transactions</p>
        </div>
        <button
          onClick={() => setShowFundModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition"
        >
          <Plus className="w-4 h-4" />
          Fund Wallet
        </button>
      </div>

      {/* Balance Card */}
      <div className="bg-gradient-to-br from-primary to-blue-700 rounded-2xl p-6 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-32 translate-x-32" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-24 -translate-x-24" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-4">
            <Wallet className="w-5 h-5 text-white/70" />
            <span className="text-sm text-white/70">Available Balance</span>
          </div>
          <p className="text-4xl font-bold tracking-tight">
            {formatNgn(Number(wallet?.balanceNgn || 0))}
          </p>
          <div className="mt-4 flex items-center gap-2">
            <button
              onClick={() => setShowFundModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-sm transition"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Funds
            </button>
            <button
              onClick={() => { loadWallet(); loadTransactions(); }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-sm transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Funded', value: formatNgn(transactions.filter(t => t.type === 'WALLET_FUNDING').reduce((sum, t) => sum + Number(t.amountNgn), 0)), color: 'text-green-500' },
          { label: 'Total Spent', value: formatNgn(transactions.filter(t => t.type === 'CERTIFICATE_PURCHASE').reduce((sum, t) => sum + Number(t.amountNgn), 0)), color: 'text-red-500' },
          { label: 'Total Refunds', value: formatNgn(transactions.filter(t => t.type === 'REFUND').reduce((sum, t) => sum + Number(t.amountNgn), 0)), color: 'text-blue-500' },
          { label: 'Transactions', value: String(meta.total), color: 'text-purple-500' },
        ].map((stat) => (
          <div key={stat.label} className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground">{stat.label}</p>
            <p className={`text-lg font-bold mt-1 ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Transactions */}
      <div className="bg-card border border-border rounded-xl">
        <div className="p-5 border-b border-border">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="font-semibold text-foreground">Transaction History</h2>
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <select
                value={filter}
                onChange={(e) => { setFilter(e.target.value); setPage(1); }}
                className="text-sm border border-input bg-background text-foreground rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {filters.map((f) => (
                  <option key={f} value={f}>
                    {f === 'ALL' ? 'All Types' : txTypeLabel[f] || f}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {transactions.length === 0 ? (
          <div className="p-12 text-center">
            <Wallet className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">No transactions yet</p>
            <button
              onClick={() => setShowFundModal(true)}
              className="mt-3 text-sm text-primary hover:underline"
            >
              Fund your wallet to get started
            </button>
          </div>
        ) : (
          <>
            <div className="divide-y divide-border">
              {transactions.map((tx) => (
                <div key={tx.id} className="flex items-center gap-4 p-4 hover:bg-accent/50 transition">
                  <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                    {txIcon(tx.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {tx.description || txTypeLabel[tx.type] || tx.type}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatDate(tx.createdAt)} · Ref: {tx.reference}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-right">
                      <p className={`text-sm font-semibold ${txTypeColor[tx.type] || 'text-foreground'}`}>
                        {tx.type === 'CERTIFICATE_PURCHASE' ? '-' : '+'}{formatNgn(Number(tx.amountNgn))}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Bal: {formatNgn(Number(tx.balanceAfter))}
                      </p>
                    </div>
                    <button
                      onClick={() => walletApi.getInvoice(tx.id)}
                      title="Download Receipt"
                      className="p-1.5 rounded-lg border border-border hover:bg-accent transition text-muted-foreground hover:text-foreground"
                    >
                      <Receipt className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {meta.totalPages > 1 && (
              <div className="p-4 border-t border-border flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Page {page} of {meta.totalPages} · {meta.total} total
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-accent disabled:opacity-50 transition"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
                    disabled={page === meta.totalPages}
                    className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-accent disabled:opacity-50 transition"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Fund Modal */}
      {showFundModal && (
        <FundModal
          onClose={() => setShowFundModal(false)}
          onSuccess={handleFundSuccess}
        />
      )}
    </div>
  );
}
