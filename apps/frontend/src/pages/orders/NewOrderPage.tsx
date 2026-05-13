import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ShieldCheck, ChevronRight, ChevronLeft,
  Loader2, CheckCircle2, AlertCircle, Upload,
  Info, Wallet, RotateCcw
} from 'lucide-react';
import { certificateApi } from '@/api/certificate.api';
import { walletApi } from '@/api/wallet.api';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────

interface Product {
  id: string;
  name: string;
  type: string;
  description: string;
  maxSans: number;
  supportsWildcard: boolean;
  prices: Array<{ validity: string; priceNgn: number }>;
}

const VALIDITY_LABELS: Record<string, string> = {
  ONE_YEAR: '1 Year',
  TWO_YEARS: '2 Years',
  THREE_YEARS: '3 Years',
};

const TYPE_BADGES: Record<string, string> = {
  DV: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  DV_MULTIDOMAIN: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  DV_WILDCARD: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  OV: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  OV_MULTIDOMAIN: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  OV_WILDCARD: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  EV: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  EV_MULTIDOMAIN: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
};

const formatNgn = (amount: number) =>
  `₦${Number(amount).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;

// ─── Form Persistence ─────────────────────────────────

const STORAGE_KEY = 'certportal_new_order_draft';
const DRAFT_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

interface DraftData {
  step: number;
  selectedProduct: Product | null;
  selectedValidity: string;
  selectedPrice: number;
  csrData: any | null;
  step2: {
    csr: string;
    formData: {
      commonName: string;
      orgName: string;
      organizationalUnit: string;
      country: string;
      state: string;
      locality: string;
      email: string;
      sans: string;
    };
  };
  savedAt: number;
}

const saveDraft = (data: Omit<DraftData, 'savedAt'>) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...data, savedAt: Date.now() }));
  } catch {}
};

const loadDraft = (): DraftData | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const draft: DraftData = JSON.parse(raw);
    // Expire after TTL
    if (Date.now() - draft.savedAt > DRAFT_TTL_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return draft;
  } catch {
    return null;
  }
};

const clearDraft = () => {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
};

// ─── Step Indicator ───────────────────────────────────

const STEPS = ['Select Product', 'Submit CSR', 'Review', 'Confirm'];

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center mb-8">
      {STEPS.map((step, i) => (
        <div key={step} className="flex items-center">
          <div className="flex flex-col items-center">
            <div className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all',
              i < current ? 'bg-primary text-primary-foreground' :
              i === current ? 'bg-primary text-primary-foreground ring-4 ring-primary/20' :
              'bg-muted text-muted-foreground'
            )}>
              {i < current ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
            </div>
            <span className={cn(
              'text-xs mt-1 hidden sm:block',
              i === current ? 'text-foreground font-medium' : 'text-muted-foreground'
            )}>
              {step}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={cn(
              'w-12 sm:w-20 h-0.5 mx-1 mb-4 sm:mb-0',
              i < current ? 'bg-primary' : 'bg-muted'
            )} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Step 1: Select Product ───────────────────────────

function Step1({ onNext, preselectedId, initialProduct, initialValidity }: {
  onNext: (product: Product, validity: string, price: number) => void;
  preselectedId?: string | null;
  initialProduct?: Product | null;
  initialValidity?: string;
}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(initialProduct || null);
  const [selectedValidity, setSelectedValidity] = useState(initialValidity || 'ONE_YEAR');

  useEffect(() => {
    certificateApi.getProducts().then((res) => {
      const list = res.data as Product[];
      setProducts(list);
      if (!initialProduct && preselectedId) {
        const found = list.find(p => p.id === preselectedId);
        if (found) setSelectedProduct(found);
      }
      setIsLoading(false);
    }).catch(() => setIsLoading(false));
  }, [preselectedId, initialProduct]);

  const selectedPrice = selectedProduct?.prices.find((p) => p.validity === selectedValidity);

  if (isLoading) return (
    <div className="flex items-center justify-center p-12">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Choose Certificate Type</h2>
        <p className="text-sm text-muted-foreground mt-1">Select the SSL/TLS certificate that fits your needs</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {products.map((product) => (
          <button
            key={product.id}
            onClick={() => setSelectedProduct(product)}
            className={cn(
              'text-left p-4 rounded-xl border-2 transition-all',
              selectedProduct?.id === product.id
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50 hover:bg-accent/50'
            )}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="w-9 h-9 bg-primary/10 rounded-lg flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-primary" />
              </div>
              <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', TYPE_BADGES[product.type] || 'bg-gray-100 text-gray-700')}>
                {product.type.replace(/_/g, ' ')}
              </span>
            </div>
            <h3 className="font-semibold text-foreground text-sm">{product.name}</h3>
            <p className="text-xs text-muted-foreground mt-1">{product.description}</p>
            <p className="text-sm font-bold text-primary mt-2">
              from {formatNgn(Math.min(...product.prices.map((p) => Number(p.priceNgn))))}
            </p>
          </button>
        ))}
      </div>

      {selectedProduct && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <h3 className="font-semibold text-foreground">Select Validity Period</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {selectedProduct.prices.map((price) => (
              <button
                key={price.validity}
                onClick={() => setSelectedValidity(price.validity)}
                className={cn(
                  'p-3 rounded-lg border-2 text-center transition-all',
                  selectedValidity === price.validity
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/30'
                )}
              >
                <p className="text-sm font-medium text-foreground">{VALIDITY_LABELS[price.validity]}</p>
                <p className="text-xs text-primary font-bold mt-1">{formatNgn(Number(price.priceNgn))}</p>
              </button>
            ))}
          </div>

          <button
            onClick={() => onNext(selectedProduct, selectedValidity, Number(selectedPrice?.priceNgn || 0))}
            className="w-full flex items-center justify-center gap-2 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition"
          >
            Continue <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Step 2: CSR & Details ────────────────────────────

function Step2({ product, onNext, onBack, initialCsr, initialFormData, onDraftChange }: {
  product: Product;
  onNext: (data: any) => void;
  onBack: () => void;
  initialCsr?: string;
  initialFormData?: any;
  onDraftChange: (csr: string, formData: any) => void;
}) {
  const [csr, setCsr] = useState(initialCsr || '');
  const [isDecoding, setIsDecoding] = useState(false);
  const [decoded, setDecoded] = useState<any>(null);
  const [formData, setFormData] = useState(initialFormData || {
    commonName: '',
    orgName: '',
    organizationalUnit: '',
    country: '',
    state: '',
    locality: '',
    email: '',
    sans: '',
  });
  const [error, setError] = useState('');

  // Save draft whenever csr or formData changes
  useEffect(() => {
    onDraftChange(csr, formData);
  }, [csr, formData]);

  const handleDecodeCSR = async () => {
    if (!csr.trim()) { setError('Please paste your CSR first.'); return; }
    setIsDecoding(true);
    setError('');
    try {
      const result = await certificateApi.decodeCSR(csr);
      const d = result.data;
      setDecoded(d);
      const newFormData = {
        commonName: d.commonName || '',
        orgName: d.organization || '',
        organizationalUnit: d.organizationalUnit || '',
        country: d.country || '',
        state: d.state || '',
        locality: d.locality || '',
        email: d.email || '',
        sans: (d.sans || []).join(', '),
      };
      setFormData(newFormData);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to decode CSR.');
    } finally {
      setIsDecoding(false);
    }
  };

  const handleNext = () => {
    if (!csr.trim()) { setError('CSR is required.'); return; }
    if (!formData.commonName.trim()) { setError('Common Name (domain) is required.'); return; }
    setError('');
    onNext({
      csr,
      ...formData,
      sans: formData.sans ? formData.sans.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
    });
  };

  const needsOrgInfo = ['OV', 'OV_MULTIDOMAIN', 'OV_WILDCARD', 'EV', 'EV_MULTIDOMAIN'].includes(product.type);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Certificate Signing Request</h2>
        <p className="text-sm text-muted-foreground mt-1">Paste your CSR and we'll decode it automatically</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1.5">
          Paste your CSR <span className="text-destructive">*</span>
        </label>
        <textarea
          value={csr}
          onChange={(e) => setCsr(e.target.value)}
          placeholder="-----BEGIN CERTIFICATE REQUEST-----&#10;MIICvDCCAaQCAQAwdzELMAkGA1UEBhMCVVMx...&#10;-----END CERTIFICATE REQUEST-----"
          rows={6}
          className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-foreground text-sm font-mono placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition resize-none"
        />
        <button
          onClick={handleDecodeCSR}
          disabled={isDecoding || !csr.trim()}
          className="mt-2 flex items-center gap-2 px-4 py-2 text-sm border border-primary text-primary rounded-lg hover:bg-primary/10 disabled:opacity-50 transition"
        >
          {isDecoding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {isDecoding ? 'Decoding...' : 'Decode CSR'}
        </button>
        {decoded && (
          <div className="mt-2 flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
            <CheckCircle2 className="w-4 h-4" />
            CSR decoded — fields populated below
          </div>
        )}
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Certificate Details</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Common Name (Domain) <span className="text-destructive">*</span>
            </label>
            <input
              value={formData.commonName}
              onChange={(e) => setFormData({ ...formData, commonName: e.target.value })}
              placeholder={product.supportsWildcard ? '*.yourdomain.com' : 'yourdomain.com'}
              className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring transition"
            />
          </div>

          {(product.maxSans > 1) && (
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-foreground mb-1.5">Additional Domains (SANs)</label>
              <input
                value={formData.sans}
                onChange={(e) => setFormData({ ...formData, sans: e.target.value })}
                placeholder="www.domain.com, app.domain.com, api.domain.com"
                className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring transition"
              />
              <p className="mt-1 text-xs text-muted-foreground">Separate multiple domains with commas</p>
            </div>
          )}

          {needsOrgInfo && (
            <>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-foreground mb-1.5">Organization Name</label>
                <input
                  value={formData.orgName}
                  onChange={(e) => setFormData({ ...formData, orgName: e.target.value })}
                  placeholder="Your Company Ltd"
                  className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring transition"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Organizational Unit</label>
                <input
                  value={formData.organizationalUnit}
                  onChange={(e) => setFormData({ ...formData, organizationalUnit: e.target.value })}
                  placeholder="IT Department"
                  className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring transition"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Country Code</label>
            <input
              value={formData.country}
              onChange={(e) => setFormData({ ...formData, country: e.target.value.toUpperCase().slice(0, 2) })}
              placeholder="NG"
              maxLength={2}
              className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring transition"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">State / Province</label>
            <input
              value={formData.state}
              onChange={(e) => setFormData({ ...formData, state: e.target.value })}
              placeholder="Lagos"
              className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring transition"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">City / Locality</label>
            <input
              value={formData.locality}
              onChange={(e) => setFormData({ ...formData, locality: e.target.value })}
              placeholder="Lagos Island"
              className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring transition"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Email Address</label>
            <input
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="admin@yourdomain.com"
              type="email"
              className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring transition"
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button onClick={onBack} className="flex-1 flex items-center justify-center gap-2 py-3 border border-border rounded-lg text-sm hover:bg-accent transition">
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        <button onClick={handleNext} className="flex-1 flex items-center justify-center gap-2 py-3 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition">
          Review Order <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ─── Step 3: Review & Confirm ─────────────────────────

function Step3({ product, validity, price, csrData, onConfirm, onBack, isSubmitting }: {
  product: Product;
  validity: string;
  price: number;
  csrData: any;
  onConfirm: () => void;
  onBack: () => void;
  isSubmitting: boolean;
}) {
  const [walletBalance, setWalletBalance] = useState<number>(0);

  useEffect(() => {
    walletApi.getWallet().then((res) => {
      setWalletBalance(Number(res.data.balanceNgn));
    }).catch(() => {});
  }, []);

  const hasSufficientBalance = walletBalance >= price;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Review Your Order</h2>
        <p className="text-sm text-muted-foreground mt-1">Please confirm all details before placing your order</p>
      </div>

      <div className="bg-card border border-border rounded-xl divide-y divide-border">
        <div className="p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">Certificate Details</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {[
              { label: 'Product', value: product.name },
              { label: 'Validity', value: VALIDITY_LABELS[validity] },
              { label: 'Common Name', value: csrData.commonName },
              { label: 'Country', value: csrData.country || '—' },
              { label: 'State', value: csrData.state || '—' },
              { label: 'City', value: csrData.locality || '—' },
              ...(csrData.orgName ? [{ label: 'Organization', value: csrData.orgName }] : []),
              ...(csrData.sans?.length > 0 ? [{ label: 'SANs', value: csrData.sans.join(', ') }] : []),
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-muted-foreground">{label}</p>
                <p className="font-medium text-foreground truncate">{value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">Payment</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Certificate Price</span>
              <span className="font-medium">{formatNgn(price)}</span>
            </div>
            <div className="flex justify-between border-t border-border pt-2 mt-2">
              <span className="font-semibold text-foreground">Total</span>
              <span className="font-bold text-foreground">{formatNgn(price)}</span>
            </div>
          </div>
        </div>

        <div className={cn('p-4', !hasSufficientBalance && 'bg-destructive/5')}>
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Wallet className={cn('w-4 h-4', hasSufficientBalance ? 'text-green-500' : 'text-destructive')} />
              <span className="text-muted-foreground">Wallet Balance</span>
            </div>
            <span className={cn('font-bold', hasSufficientBalance ? 'text-green-600 dark:text-green-400' : 'text-destructive')}>
              {formatNgn(walletBalance)}
            </span>
          </div>
          {!hasSufficientBalance && (
            <div className="mt-2 flex items-start gap-2 text-xs text-destructive">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              Insufficient balance. Please fund your wallet first.
            </div>
          )}
          {hasSufficientBalance && (
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Info className="w-3.5 h-3.5 flex-shrink-0" />
              Balance after payment: {formatNgn(walletBalance - price)}
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={onBack} className="flex-1 flex items-center justify-center gap-2 py-3 border border-border rounded-lg text-sm hover:bg-accent transition">
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        <button
          onClick={onConfirm}
          disabled={isSubmitting || !hasSufficientBalance}
          className="flex-1 flex items-center justify-center gap-2 py-3 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition"
        >
          {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
          {isSubmitting ? 'Placing Order...' : 'Place Order'}
        </button>
      </div>
    </div>
  );
}

// ─── Main New Order Page ──────────────────────────────

export default function NewOrderPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedProductId = searchParams.get('product');

  // Load draft on mount
  const draft = loadDraft();

  const [step, setStep] = useState(draft?.step ?? 0);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(draft?.selectedProduct ?? null);
  const [selectedValidity, setSelectedValidity] = useState(draft?.selectedValidity ?? 'ONE_YEAR');
  const [selectedPrice, setSelectedPrice] = useState(draft?.selectedPrice ?? 0);
  const [csrData, setCsrData] = useState<any>(draft?.csrData ?? null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [draftRestored, setDraftRestored] = useState(!!draft);

  // Step 2 draft state
  const [step2Draft, setStep2Draft] = useState(draft?.step2 ?? { csr: '', formData: {} });

  // Save draft whenever key state changes
  const persistDraft = useCallback(() => {
    saveDraft({
      step,
      selectedProduct,
      selectedValidity,
      selectedPrice,
      csrData,
      step2: step2Draft,
    });
  }, [step, selectedProduct, selectedValidity, selectedPrice, csrData, step2Draft]);

  useEffect(() => {
    persistDraft();
  }, [persistDraft]);

  const handleStep1Next = (product: Product, validity: string, price: number) => {
    setSelectedProduct(product);
    setSelectedValidity(validity);
    setSelectedPrice(price);
    setStep(1);
  };

  const handleStep2Next = (data: any) => {
    setCsrData(data);
    setStep(2);
  };

  const handleStep2DraftChange = (csr: string, formData: any) => {
    setStep2Draft({ csr, formData });
  };

  const handleConfirm = async () => {
    if (!selectedProduct || !csrData) return;
    setIsSubmitting(true);
    setError('');
    try {
      const result = await certificateApi.createOrder({
        productId: selectedProduct.id,
        validity: selectedValidity,
        ...csrData,
      });
      // Clear draft on successful order
      clearDraft();
      navigate(`/orders/${result.data.id}?new=true`);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to place order. Please try again.');
      setIsSubmitting(false);
    }
  };

  const handleClearDraft = () => {
    clearDraft();
    setStep(0);
    setSelectedProduct(null);
    setSelectedValidity('ONE_YEAR');
    setSelectedPrice(0);
    setCsrData(null);
    setStep2Draft({ csr: '', formData: {} });
    setDraftRestored(false);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">New Certificate Order</h1>
          <p className="text-sm text-muted-foreground mt-1">Follow the steps to order your SSL/TLS certificate</p>
        </div>
      </div>

      {/* Draft restored banner */}
      {draftRestored && (
        <div className="mb-4 flex items-center justify-between gap-3 px-4 py-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-xl text-sm">
          <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
            <RotateCcw className="w-4 h-4 flex-shrink-0" />
            Your previous progress has been restored automatically.
          </div>
          <button
            onClick={handleClearDraft}
            className="text-xs text-blue-500 hover:text-blue-700 dark:hover:text-blue-200 underline whitespace-nowrap"
          >
            Start fresh
          </button>
        </div>
      )}

      <div className="bg-card border border-border rounded-2xl p-6">
        <StepIndicator current={step} />

        {error && (
          <div className="mb-6 flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {step === 0 && (
          <Step1
            onNext={handleStep1Next}
            preselectedId={preselectedProductId}
            initialProduct={selectedProduct}
            initialValidity={selectedValidity}
          />
        )}
        {step === 1 && selectedProduct && (
          <Step2
            product={selectedProduct}
            onNext={handleStep2Next}
            onBack={() => setStep(0)}
            initialCsr={step2Draft.csr}
            initialFormData={step2Draft.formData && Object.keys(step2Draft.formData).length > 0 ? step2Draft.formData : undefined}
            onDraftChange={handleStep2DraftChange}
          />
        )}
        {step === 2 && selectedProduct && csrData && (
          <Step3
            product={selectedProduct}
            validity={selectedValidity}
            price={selectedPrice}
            csrData={csrData}
            onConfirm={handleConfirm}
            onBack={() => setStep(1)}
            isSubmitting={isSubmitting}
          />
        )}
      </div>
    </div>
  );
}
