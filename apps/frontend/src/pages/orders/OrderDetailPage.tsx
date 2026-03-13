import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, ShieldCheck, Clock, XCircle, Download,
  Copy, CheckCircle2, AlertCircle, Loader2, RefreshCw,
  FileText, Globe, Building2, Calendar, ShieldAlert
} from 'lucide-react';
import { certificateApi } from '@/api/certificate.api';
import { cn } from '@/lib/utils';

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  PENDING_PAYMENT:    { label: 'Pending Payment',    color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300', icon: Clock },
  PAID:               { label: 'Paid',               color: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300', icon: CheckCircle2 },
  PENDING_VALIDATION: { label: 'Pending Validation', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300', icon: Clock },
  VALIDATING:         { label: 'Validating',         color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300', icon: RefreshCw },
  PENDING_ISSUANCE:   { label: 'Pending Issuance',   color: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300', icon: Clock },
  ISSUED:             { label: 'Issued',             color: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300', icon: ShieldCheck },
  CANCELLED:          { label: 'Cancelled',          color: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300', icon: XCircle },
  EXPIRED:            { label: 'Expired',            color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300', icon: AlertCircle },
};

const VALIDITY_LABELS: Record<string, string> = {
  ONE_YEAR: '1 Year', TWO_YEARS: '2 Years', THREE_YEARS: '3 Years',
};

const formatDate = (date: string) =>
  new Date(date).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const formatNgn = (amount: number) =>
  `₦${Number(amount).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={handleCopy} className="text-muted-foreground hover:text-foreground transition">
      {copied ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] || { label: status, color: 'bg-gray-100 text-gray-700', icon: Clock };
  const Icon = config.icon;
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium', config.color)}>
      <Icon className="w-4 h-4" />
      {config.label}
    </span>
  );
}

// Order progress timeline
const ORDER_STEPS = [
  { key: 'PAID', label: 'Order Placed', desc: 'Payment received' },
  { key: 'PENDING_VALIDATION', label: 'Domain Validation', desc: 'Verify domain ownership' },
  { key: 'PENDING_ISSUANCE', label: 'Certificate Issuance', desc: 'CA processing' },
  { key: 'ISSUED', label: 'Certificate Issued', desc: 'Ready to download' },
];

const stepOrder = ['PAID', 'PENDING_VALIDATION', 'VALIDATING', 'PENDING_ISSUANCE', 'ISSUED'];

function OrderTimeline({ status }: { status: string }) {
  if (status === 'CANCELLED') return null;
  const currentIdx = stepOrder.indexOf(status);

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h3 className="font-semibold text-foreground mb-4">Order Progress</h3>
      <div className="space-y-4">
        {ORDER_STEPS.map((step, i) => {
          const stepIdx = stepOrder.indexOf(step.key);
          const isDone = currentIdx > stepIdx;
          const isCurrent = step.key === status || (status === 'VALIDATING' && step.key === 'PENDING_VALIDATION');
          return (
            <div key={step.key} className="flex items-start gap-3">
              <div className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
                isDone ? 'bg-green-500' : isCurrent ? 'bg-primary' : 'bg-muted'
              )}>
                {isDone
                  ? <CheckCircle2 className="w-4 h-4 text-white" />
                  : isCurrent
                  ? <RefreshCw className="w-3.5 h-3.5 text-white animate-spin" />
                  : <span className="text-xs text-muted-foreground font-medium">{i + 1}</span>
                }
              </div>
              <div>
                <p className={cn('text-sm font-medium', isDone || isCurrent ? 'text-foreground' : 'text-muted-foreground')}>
                  {step.label}
                </p>
                <p className="text-xs text-muted-foreground">{step.desc}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCancelling, setIsCancelling] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    certificateApi.getOrderById(id).then((res) => {
      setOrder(res.data);
      setIsLoading(false);
    }).catch(() => {
      setError('Order not found.');
      setIsLoading(false);
    });
  }, [id]);

  const handleCancel = async () => {
    if (!id) return;
    setIsCancelling(true);
    try {
      await certificateApi.cancelOrder(id);
      setOrder((prev: any) => ({ ...prev, status: 'CANCELLED' }));
      setShowCancelConfirm(false);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to cancel order.');
    } finally {
      setIsCancelling(false);
    }
  };

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );

  if (error || !order) return (
    <div className="text-center py-12">
      <AlertCircle className="w-10 h-10 text-destructive mx-auto mb-3" />
      <p className="text-muted-foreground">{error || 'Order not found.'}</p>
      <Link to="/orders" className="mt-4 inline-block text-sm text-primary hover:underline">Back to Orders</Link>
    </div>
  );

  const canCancel = ['PAID', 'PENDING_VALIDATION', 'PENDING_PAYMENT'].includes(order.status);

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/orders')} className="text-muted-foreground hover:text-foreground transition">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-foreground font-mono">{order.orderNumber}</h1>
            <p className="text-sm text-muted-foreground">{order.product?.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={order.status} />
          {['PAID', 'PENDING_VALIDATION'].includes(order.status) && (
            <Link
              to={`/orders/${order.id}/validate`}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition"
            >
              <ShieldAlert className="w-4 h-4" /> Validate Domain
            </Link>
          )}
          {canCancel && (
            <button
              onClick={() => setShowCancelConfirm(true)}
              className="px-3 py-1.5 text-sm border border-destructive text-destructive rounded-lg hover:bg-destructive/10 transition"
            >
              Cancel Order
            </button>
          )}
        </div>
      </div>

      {/* Cancel confirm dialog */}
      {showCancelConfirm && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4">
          <p className="text-sm font-medium text-foreground mb-1">Cancel this order?</p>
          <p className="text-sm text-muted-foreground mb-4">
            Your payment of {formatNgn(order.priceNgn)} will be refunded to your wallet.
          </p>
          <div className="flex gap-3">
            <button onClick={() => setShowCancelConfirm(false)} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-accent transition">
              Keep Order
            </button>
            <button
              onClick={handleCancel}
              disabled={isCancelling}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 disabled:opacity-50 transition"
            >
              {isCancelling && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Yes, Cancel & Refund
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Main details */}
        <div className="lg:col-span-2 space-y-5">
          {/* Certificate Info */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
              <Globe className="w-4 h-4 text-primary" /> Domain Information
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              {[
                { label: 'Common Name', value: order.commonName },
                { label: 'Product', value: order.product?.name },
                { label: 'Validity', value: VALIDITY_LABELS[order.validity] || order.validity },
                { label: 'Amount Paid', value: formatNgn(order.priceNgn) },
                ...(order.country ? [{ label: 'Country', value: order.country }] : []),
                ...(order.state ? [{ label: 'State', value: order.state }] : []),
                ...(order.locality ? [{ label: 'City', value: order.locality }] : []),
                ...(order.email ? [{ label: 'Email', value: order.email }] : []),
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-muted-foreground text-xs">{label}</p>
                  <p className="font-medium text-foreground mt-0.5">{value}</p>
                </div>
              ))}
            </div>

            {order.sans?.length > 0 && (
              <div className="mt-4 pt-4 border-t border-border">
                <p className="text-xs text-muted-foreground mb-2">Subject Alternative Names</p>
                <div className="flex flex-wrap gap-2">
                  {order.sans.map((san: string) => (
                    <span key={san} className="px-2 py-1 bg-muted rounded text-xs font-mono">{san}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Organization Info (OV/EV) */}
          {order.orgName && (
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-primary" /> Organization
              </h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Organization</p>
                  <p className="font-medium text-foreground mt-0.5">{order.orgName}</p>
                </div>
                {order.organizationalUnit && (
                  <div>
                    <p className="text-xs text-muted-foreground">Unit</p>
                    <p className="font-medium text-foreground mt-0.5">{order.organizationalUnit}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* CSR */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" /> CSR
              </h3>
              <CopyButton text={order.csr} />
            </div>
            <pre className="text-xs font-mono bg-muted p-3 rounded-lg overflow-x-auto whitespace-pre-wrap break-all text-muted-foreground">
              {order.csr}
            </pre>
          </div>

          {/* Issued Certificate */}
          {order.certificate && (
            <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-xl p-5">
              <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-green-500" /> Issued Certificate
              </h3>
              <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                <div>
                  <p className="text-xs text-muted-foreground">Serial Number</p>
                  <p className="font-mono text-xs text-foreground mt-0.5">{order.certificate.serialNumber}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Expires</p>
                  <p className="font-medium text-foreground mt-0.5">{formatDate(order.certificate.expiresAt)}</p>
                </div>
              </div>
              <button className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition">
                <Download className="w-4 h-4" /> Download Certificate
              </button>
            </div>
          )}
        </div>

        {/* Right: Timeline & Dates */}
        <div className="space-y-5">
          <OrderTimeline status={order.status} />

          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" /> Timeline
            </h3>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Order Placed</p>
                <p className="font-medium text-foreground mt-0.5">{formatDate(order.createdAt)}</p>
              </div>
              {order.certificate?.expiresAt && (
                <div>
                  <p className="text-xs text-muted-foreground">Certificate Expires</p>
                  <p className="font-medium text-foreground mt-0.5">{formatDate(order.certificate.expiresAt)}</p>
                </div>
              )}
              {order.cancelledAt && (
                <div>
                  <p className="text-xs text-muted-foreground">Cancelled At</p>
                  <p className="font-medium text-destructive mt-0.5">{formatDate(order.cancelledAt)}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
