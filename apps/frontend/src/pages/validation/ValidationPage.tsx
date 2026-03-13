import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, CheckCircle2, Clock, XCircle, RefreshCw,
  Globe, Server, Mail, FileText, Copy, Loader2,
  AlertCircle, ChevronDown, ChevronUp, ExternalLink, Info
} from 'lucide-react';
import { validationApi } from '@/api/validation.api';
import { certificateApi } from '@/api/certificate.api';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────

interface Validation {
  id: string;
  domain: string;
  method: string;
  status: string;
  token: string;
  dnsRecord?: string;
  httpFilePath?: string;
  httpFileContent?: string;
  validationEmail?: string;
  attempts: number;
  lastCheckedAt?: string;
  validatedAt?: string;
  expiresAt?: string;
  instructions: any;
}

// ─── Helpers ──────────────────────────────────────────

const METHOD_CONFIG = {
  DNS_TXT:   { label: 'DNS TXT Record',   icon: Server, color: 'text-blue-500',   bg: 'bg-blue-50 dark:bg-blue-950' },
  DNS_CNAME: { label: 'DNS CNAME Record', icon: Server, color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-950' },
  HTTP_FILE: { label: 'HTTP File Upload', icon: Globe,  color: 'text-green-500',  bg: 'bg-green-50 dark:bg-green-950' },
  EMAIL:     { label: 'Email Validation', icon: Mail,   color: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-950' },
};

const STATUS_CONFIG = {
  PENDING:     { label: 'Pending',    color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300', icon: Clock },
  IN_PROGRESS: { label: 'Checking',  color: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',         icon: RefreshCw },
  VALIDATED:   { label: 'Validated', color: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',     icon: CheckCircle2 },
  FAILED:      { label: 'Failed',    color: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',             icon: XCircle },
  EXPIRED:     { label: 'Expired',   color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',         icon: AlertCircle },
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="flex-shrink-0 text-muted-foreground hover:text-foreground transition"
    >
      {copied ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
    </button>
  );
}

// ─── Method Selector ──────────────────────────────────

function MethodSelector({ onSelect, isLoading }: {
  onSelect: (method: string, email?: string) => void;
  isLoading: boolean;
}) {
  const [selected, setSelected] = useState('DNS_TXT');
  const [email, setEmail] = useState('');

  const methods = [
    { value: 'DNS_TXT',   label: 'DNS TXT Record',   desc: 'Add a TXT record to your DNS. Recommended.',     recommended: true },
    { value: 'DNS_CNAME', label: 'DNS CNAME Record',  desc: 'Add a CNAME record to your DNS.',                recommended: false },
    { value: 'HTTP_FILE', label: 'HTTP File Upload',  desc: 'Upload a file to your web server.',              recommended: false },
    { value: 'EMAIL',     label: 'Email Validation',  desc: 'Receive a verification email at your domain.',   recommended: false },
  ];

  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-5">
      <div>
        <h3 className="font-semibold text-foreground">Choose Validation Method</h3>
        <p className="text-sm text-muted-foreground mt-1">Select how you want to prove ownership of this domain</p>
      </div>

      <div className="space-y-3">
        {methods.map((m) => (
          <button
            key={m.value}
            onClick={() => setSelected(m.value)}
            className={cn(
              'w-full text-left p-4 rounded-xl border-2 transition-all',
              selected === m.value
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/30 hover:bg-accent/50'
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">{m.label}</span>
              {m.recommended && (
                <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 rounded-full font-medium">
                  Recommended
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">{m.desc}</p>
          </button>
        ))}
      </div>

      {selected === 'EMAIL' && (
        <div>
          <label className="block text-sm font-medium text-foreground mb-1.5">Validation Email</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@yourdomain.com"
            className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring transition"
          />
          <p className="mt-1 text-xs text-muted-foreground">Must be admin@, webmaster@, hostmaster@, postmaster@ or administrator@</p>
        </div>
      )}

      <button
        onClick={() => onSelect(selected, email || undefined)}
        disabled={isLoading}
        className="w-full flex items-center justify-center gap-2 py-3 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition"
      >
        {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
        {isLoading ? 'Initializing...' : 'Start Validation'}
      </button>
    </div>
  );
}

// ─── DNS Instructions ─────────────────────────────────

function DnsInstructions({ validation }: { validation: Validation }) {
  const inst = validation.instructions;
  const record = inst?.record;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
        <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-blue-700 dark:text-blue-300">
          Add this record to your DNS provider. Changes usually propagate within 5–30 minutes.
        </p>
      </div>

      {record && (
        <div className="bg-muted rounded-xl overflow-hidden">
          <div className="px-4 py-2 bg-muted border-b border-border">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">DNS Record to Add</p>
          </div>
          <div className="divide-y divide-border">
            {[
              { label: 'Type',  value: record.type },
              { label: 'Name',  value: record.name },
              { label: 'Value', value: record.value },
              { label: 'TTL',   value: record.ttl },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center gap-4 px-4 py-3">
                <span className="text-xs font-medium text-muted-foreground w-12 flex-shrink-0">{label}</span>
                <code className="flex-1 text-sm font-mono text-foreground break-all">{value}</code>
                <CopyButton text={value} />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">Steps:</p>
        {inst?.steps?.map((step: string, i: number) => (
          <div key={i} className="flex items-start gap-3 text-sm text-muted-foreground">
            <span className="w-5 h-5 rounded-full bg-muted-foreground/20 text-foreground text-xs flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
            {step}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── HTTP File Instructions ───────────────────────────

function HttpInstructions({ validation }: { validation: Validation }) {
  const inst = validation.instructions;
  const file = inst?.file;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
        <Info className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-green-700 dark:text-green-300">
          Upload the file below to your web server's root directory.
        </p>
      </div>

      {file && (
        <>
          <div>
            <p className="text-sm font-medium text-foreground mb-2">File Path</p>
            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
              <code className="flex-1 text-sm font-mono text-foreground">{file.path}</code>
              <CopyButton text={file.path} />
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-foreground mb-2">File Content</p>
            <div className="relative">
              <pre className="p-3 bg-muted rounded-lg text-sm font-mono text-foreground whitespace-pre-wrap break-all">
                {file.content}
              </pre>
              <div className="absolute top-2 right-2">
                <CopyButton text={file.content} />
              </div>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-foreground mb-2">Verify URL</p>
            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
              <code className="flex-1 text-sm font-mono text-foreground break-all">{file.url}</code>
              <a href={file.url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>
        </>
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">Steps:</p>
        {inst?.steps?.map((step: string, i: number) => (
          <div key={i} className="flex items-start gap-3 text-sm text-muted-foreground">
            <span className="w-5 h-5 rounded-full bg-muted-foreground/20 text-foreground text-xs flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
            {step}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Email Instructions ───────────────────────────────

function EmailInstructions({ validation }: { validation: Validation }) {
  const inst = validation.instructions;
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 p-3 bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 rounded-lg">
        <Mail className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-orange-700 dark:text-orange-300">Email sent to:</p>
          <p className="text-sm text-orange-600 dark:text-orange-400 font-mono mt-0.5">{inst?.email}</p>
        </div>
      </div>
      <div className="space-y-2">
        {inst?.steps?.map((step: string, i: number) => (
          <div key={i} className="flex items-start gap-3 text-sm text-muted-foreground">
            <span className="w-5 h-5 rounded-full bg-muted-foreground/20 text-foreground text-xs flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
            {step}
          </div>
        ))}
      </div>
      {inst?.note && (
        <p className="text-xs text-muted-foreground italic">{inst.note}</p>
      )}
    </div>
  );
}

// ─── Validation Card ──────────────────────────────────

function ValidationCard({ validation, onCheck }: {
  validation: Validation;
  onCheck: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(validation.status !== 'VALIDATED');
  const [isChecking, setIsChecking] = useState(false);
  const [checkMessage, setCheckMessage] = useState('');

  const statusCfg = STATUS_CONFIG[validation.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.PENDING;
  const methodCfg = METHOD_CONFIG[validation.method as keyof typeof METHOD_CONFIG];
  const StatusIcon = statusCfg.icon;
  const MethodIcon = methodCfg?.icon || Globe;

  const handleCheck = async () => {
    setIsChecking(true);
    setCheckMessage('');
    try {
      const result = await validationApi.check(validation.id);
      setCheckMessage(result.data?.message || result.message);
      onCheck(validation.id);
    } catch (err: any) {
      setCheckMessage(err?.response?.data?.message || 'Check failed.');
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-4 p-4 cursor-pointer hover:bg-accent/30 transition"
        onClick={() => setExpanded(!expanded)}
      >
        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', methodCfg?.bg)}>
          <MethodIcon className={cn('w-5 h-5', methodCfg?.color)} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground font-mono">{validation.domain}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{methodCfg?.label}</p>
        </div>
        <span className={cn('inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium flex-shrink-0', statusCfg.color)}>
          <StatusIcon className="w-3 h-3" />
          {statusCfg.label}
        </span>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </div>

      {/* Body */}
      {expanded && (
        <div className="p-4 pt-0 border-t border-border space-y-4">
          {/* Instructions */}
          {validation.status !== 'VALIDATED' && (
            <>
              {(validation.method === 'DNS_TXT' || validation.method === 'DNS_CNAME') && (
                <DnsInstructions validation={validation} />
              )}
              {validation.method === 'HTTP_FILE' && (
                <HttpInstructions validation={validation} />
              )}
              {validation.method === 'EMAIL' && (
                <EmailInstructions validation={validation} />
              )}
            </>
          )}

          {validation.status === 'VALIDATED' && (
            <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <p className="text-sm text-green-700 dark:text-green-300 font-medium">
                Domain validated successfully on {validation.validatedAt
                  ? new Date(validation.validatedAt).toLocaleDateString()
                  : '—'}
              </p>
            </div>
          )}

          {/* Check result message */}
          {checkMessage && (
            <div className={cn(
              'flex items-center gap-2 p-3 rounded-lg text-sm',
              checkMessage.toLowerCase().includes('found') || checkMessage.toLowerCase().includes('success')
                ? 'bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300'
                : 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
            )}>
              <Info className="w-4 h-4 flex-shrink-0" />
              {checkMessage}
            </div>
          )}

          {/* Actions */}
          {validation.status !== 'VALIDATED' && validation.method !== 'EMAIL' && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-muted-foreground">
                {validation.attempts > 0 && `Checked ${validation.attempts} time${validation.attempts !== 1 ? 's' : ''}`}
              </p>
              <button
                onClick={handleCheck}
                disabled={isChecking}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition"
              >
                {isChecking ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                {isChecking ? 'Checking...' : 'Check Validation'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Validation Page ─────────────────────────────

export default function ValidationPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const [order, setOrder] = useState<any>(null);
  const [validations, setValidations] = useState<Validation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    if (!orderId) return;
    try {
      const [orderRes, valRes] = await Promise.all([
        certificateApi.getOrderById(orderId),
        validationApi.getByOrder(orderId).catch(() => ({ data: [] })),
      ]);
      setOrder(orderRes.data);
      setValidations(valRes.data || []);
    } catch (err) {
      setError('Failed to load validation data.');
    } finally {
      setIsLoading(false);
    }
  }, [orderId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleInitialize = async (method: string, email?: string) => {
    if (!orderId) return;
    setIsInitializing(true);
    setError('');
    try {
      await validationApi.initialize(orderId, method, email);
      await loadData();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to initialize validation.');
    } finally {
      setIsInitializing(false);
    }
  };

  const handleCheck = async (_id: string) => {
    await loadData();
  };

  const hasActiveValidation = validations.some((v) => ['PENDING', 'IN_PROGRESS', 'VALIDATED'].includes(v.status));
  const allValidated = validations.length > 0 && validations.every((v) => v.status === 'VALIDATED');

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to={`/orders/${orderId}`} className="text-muted-foreground hover:text-foreground transition">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-foreground">Domain Validation</h1>
          {order && (
            <p className="text-sm text-muted-foreground font-mono mt-0.5">{order.commonName}</p>
          )}
        </div>
      </div>

      {/* All validated banner */}
      {allValidated && (
        <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-xl">
          <CheckCircle2 className="w-6 h-6 text-green-500 flex-shrink-0" />
          <div>
            <p className="font-semibold text-green-700 dark:text-green-300">All domains validated! 🎉</p>
            <p className="text-sm text-green-600 dark:text-green-400 mt-0.5">Your certificate is now being issued. You'll be notified when it's ready.</p>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Method selector — shown when no active validation */}
      {!hasActiveValidation && (
        <MethodSelector onSelect={handleInitialize} isLoading={isInitializing} />
      )}

      {/* Active validations */}
      {validations.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-foreground">Validation Records</h3>
            {!allValidated && (
              <button
                onClick={() => { setValidations([]); }}
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                Start over with different method
              </button>
            )}
          </div>
          {validations.map((v) => (
            <ValidationCard key={v.id} validation={v} onCheck={handleCheck} />
          ))}
        </div>
      )}
    </div>
  );
}
