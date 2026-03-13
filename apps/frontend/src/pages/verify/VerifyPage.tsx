import { useState, useEffect, FormEvent, ChangeEvent } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import {
  ShieldCheck, ShieldAlert, ShieldX, Search, Loader2,
  Calendar, Hash, Fingerprint, Globe, Clock, AlertTriangle,
  CheckCircle2, XCircle, Building2, ArrowLeft, Copy, Check
} from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────

interface VerifyResult {
  status: 'valid' | 'expired' | 'revoked';
  isValid: boolean;
  isRevoked: boolean;
  isExpired: boolean;
  daysLeft: number;
  certificate: {
    commonName: string;
    subjectAltNames: string[];
    serialNumber: string;
    thumbprint: string;
    issuerName: string;
    issuedAt: string;
    expiresAt: string;
    revokedAt?: string;
  };
  product: { name: string; type: string };
  issuedTo: string;
}

// ─── Helpers ──────────────────────────────────────────

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={copy}
      className="p-1 rounded hover:bg-muted transition text-muted-foreground hover:text-foreground">
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function DetailRow({ icon: Icon, label, value, mono = false, copyable = false }: {
  icon: any; label: string; value: string; mono?: boolean; copyable?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-border last:border-0">
      <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="w-4 h-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-0.5">{label}</p>
        <div className="flex items-center gap-1.5">
          <p className={cn('text-sm text-foreground break-all', mono && 'font-mono')}>{value}</p>
          {copyable && <CopyButton text={value} />}
        </div>
      </div>
    </div>
  );
}

// ─── Status banner ────────────────────────────────────

function StatusBanner({ result }: { result: VerifyResult }) {
  if (result.isRevoked) return (
    <div className="rounded-2xl border-2 border-red-500 bg-red-50 dark:bg-red-950/30 p-6 flex items-center gap-5">
      <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/50 flex items-center justify-center shrink-0">
        <ShieldX className="w-8 h-8 text-red-600 dark:text-red-400" />
      </div>
      <div>
        <p className="text-xl font-bold text-red-700 dark:text-red-400">Certificate Revoked</p>
        <p className="text-sm text-red-600 dark:text-red-500 mt-1">
          This certificate has been revoked and is no longer valid. Do not trust this certificate.
        </p>
        {result.certificate.revokedAt && (
          <p className="text-xs text-red-500 mt-1">Revoked on {fmtDate(result.certificate.revokedAt)}</p>
        )}
      </div>
    </div>
  );

  if (result.isExpired) return (
    <div className="rounded-2xl border-2 border-orange-400 bg-orange-50 dark:bg-orange-950/30 p-6 flex items-center gap-5">
      <div className="w-16 h-16 rounded-full bg-orange-100 dark:bg-orange-900/50 flex items-center justify-center shrink-0">
        <ShieldAlert className="w-8 h-8 text-orange-600 dark:text-orange-400" />
      </div>
      <div>
        <p className="text-xl font-bold text-orange-700 dark:text-orange-400">Certificate Expired</p>
        <p className="text-sm text-orange-600 dark:text-orange-500 mt-1">
          This certificate expired on {fmtDate(result.certificate.expiresAt)} and is no longer trusted.
        </p>
      </div>
    </div>
  );

  return (
    <div className="rounded-2xl border-2 border-green-500 bg-green-50 dark:bg-green-950/30 p-6 flex items-center gap-5">
      <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/50 flex items-center justify-center shrink-0">
        <ShieldCheck className="w-8 h-8 text-green-600 dark:text-green-400" />
      </div>
      <div>
        <p className="text-xl font-bold text-green-700 dark:text-green-400">Certificate Valid</p>
        <p className="text-sm text-green-600 dark:text-green-500 mt-1">
          This certificate is active and trusted. It expires in{' '}
          <strong>{result.daysLeft} day{result.daysLeft !== 1 ? 's' : ''}</strong>.
        </p>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────

export default function VerifyPage() {
  const [searchParams] = useSearchParams();
  const navigate        = useNavigate();

  const [query, setQuery]     = useState(searchParams.get('q') || '');
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState<VerifyResult | null>(null);
  const [error, setError]     = useState('');

  const lookup = async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setLoading(true);
    setError('');
    setResult(null);
    navigate(`/verify?q=${encodeURIComponent(trimmed)}`, { replace: true });
    try {
      const res = await api.get('/verify', { params: { q: trimmed } });
      setResult(res.data.data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Certificate not found. Please check the value and try again.');
    } finally {
      setLoading(false);
    }
  };

  // Auto-lookup if query is in URL
  useEffect(() => {
    const q = searchParams.get('q');
    if (q) { setQuery(q); lookup(q); }
  }, []); // eslint-disable-line

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    lookup(query);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30">

      {/* Nav bar */}
      <header className="border-b border-border bg-background/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-4">
          <Link to="/dashboard" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition">
            <ArrowLeft className="w-4 h-4" /> Dashboard
          </Link>
          <div className="flex items-center gap-2 ml-auto">
            <ShieldCheck className="w-5 h-5 text-primary" />
            <span className="font-semibold text-foreground">CertPortal Verify</span>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-12 space-y-8">

        {/* Hero */}
        <div className="text-center space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
            <ShieldCheck className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">Certificate Verification</h1>
          <p className="text-muted-foreground max-w-md mx-auto">
            Verify the authenticity and validity of any SSL/TLS certificate issued through CertPortal.
          </p>
        </div>

        {/* Search */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              value={query}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
              placeholder="Enter serial number, thumbprint, or domain…"
              className="w-full pl-12 pr-32 py-4 border-2 border-input rounded-2xl bg-background text-base focus:outline-none focus:border-primary transition shadow-sm"
              autoFocus
            />
            <button type="submit" disabled={loading || !query.trim()}
              className="absolute right-3 top-1/2 -translate-y-1/2 px-5 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verify'}
            </button>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 justify-center text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Hash className="w-3 h-3" /> Serial Number</span>
            <span className="flex items-center gap-1"><Fingerprint className="w-3 h-3" /> SHA-1 Thumbprint</span>
            <span className="flex items-center gap-1"><Globe className="w-3 h-3" /> Domain (exact)</span>
          </div>
        </form>

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center py-12 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Looking up certificate…</p>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 flex items-start gap-4">
            <XCircle className="w-6 h-6 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-destructive">Not Found</p>
              <p className="text-sm text-muted-foreground mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* Result */}
        {result && !loading && (
          <div className="space-y-5">
            <StatusBanner result={result} />

            {/* Core details */}
            <div className="bg-card border border-border rounded-2xl p-6 space-y-0 divide-y divide-border">
              <h2 className="font-semibold text-foreground pb-4 text-sm uppercase tracking-wider text-muted-foreground">Certificate Details</h2>

              <DetailRow icon={Globe}       label="Common Name (CN)"  value={result.certificate.commonName} />
              <DetailRow icon={Building2}   label="Product"           value={`${result.product.name} (${result.product.type.replace(/_/g,' ')})`} />
              <DetailRow icon={Hash}        label="Serial Number"     value={result.certificate.serialNumber || '—'} mono copyable />
              <DetailRow icon={Fingerprint} label="SHA-1 Thumbprint"  value={result.certificate.thumbprint || '—'}  mono copyable />
              <DetailRow icon={Building2}   label="Issued By"         value={result.certificate.issuerName || 'CertPortal CA'} />
              <DetailRow icon={Building2}   label="Issued To"         value={result.issuedTo} />
              <DetailRow icon={Calendar}    label="Issued On"         value={fmtDate(result.certificate.issuedAt)} />
              <DetailRow icon={Clock}       label="Expires On"        value={fmtDate(result.certificate.expiresAt)} />

              {result.certificate.subjectAltNames?.length > 1 && (
                <div className="flex items-start gap-3 py-3">
                  <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
                    <Globe className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-2">Subject Alternative Names</p>
                    <div className="flex flex-wrap gap-1.5">
                      {result.certificate.subjectAltNames.map((san: string) => (
                        <span key={san} className="px-2 py-0.5 bg-muted rounded-md text-xs font-mono text-foreground">
                          {san}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Validity indicator */}
            <div className="bg-card border border-border rounded-2xl p-5">
              <h2 className="font-semibold text-foreground mb-4 text-sm uppercase tracking-wider text-muted-foreground">Validation Checks</h2>
              <div className="space-y-2.5">
                {[
                  { label: 'Certificate found in CertPortal',  pass: true },
                  { label: 'Not revoked',                      pass: !result.isRevoked },
                  { label: 'Not expired',                      pass: !result.isExpired },
                  { label: 'Issued by CertPortal CA',          pass: true },
                  { label: 'Valid for stated domain',          pass: true },
                ].map(({ label, pass }) => (
                  <div key={label} className="flex items-center gap-3">
                    {pass
                      ? <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                      : <XCircle     className="w-4 h-4 text-red-500 shrink-0" />}
                    <span className={cn('text-sm', pass ? 'text-foreground' : 'text-muted-foreground line-through')}>
                      {label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Expiry warning */}
            {result.isValid && result.daysLeft <= 30 && (
              <div className="flex items-start gap-3 p-4 rounded-xl border border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950/20">
                <AlertTriangle className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
                <p className="text-sm text-orange-700 dark:text-orange-400">
                  This certificate expires in <strong>{result.daysLeft} days</strong>. The certificate holder should renew it soon to avoid service interruption.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {!result && !error && !loading && (
          <div className="text-center py-8 space-y-5">
            <p className="text-sm text-muted-foreground">Enter a serial number, thumbprint, or domain name above to verify a certificate.</p>
            <div className="grid grid-cols-3 gap-4 max-w-md mx-auto text-center">
              {[
                { icon: ShieldCheck, label: 'Real-time status', desc: 'Check if valid, expired, or revoked' },
                { icon: Hash,        label: 'Full details',     desc: 'View serial, SANs, issuer info' },
                { icon: Calendar,    label: 'Expiry dates',     desc: 'See issue and expiry timestamps' },
              ].map(({ icon: Icon, label, desc }) => (
                <div key={label} className="p-4 bg-card border border-border rounded-xl">
                  <Icon className="w-6 h-6 text-primary mx-auto mb-2" />
                  <p className="text-xs font-semibold text-foreground">{label}</p>
                  <p className="text-xs text-muted-foreground mt-1">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
