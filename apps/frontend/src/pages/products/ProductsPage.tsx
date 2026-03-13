import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Loader2, CheckCircle2, XCircle, ChevronRight, Info } from 'lucide-react';
import { productsApi } from '@/api/products.api';
import { cn } from '@/lib/utils';

// ─── PRD Validation Matrix ────────────────────────────

const VALIDATION_INFO: Record<string, {
  domainVerification: string;
  orgVerification: string;
  trustLevel: string;
  issuanceSpeed: string;
  color: string;
  badge: string;
}> = {
  DV: {
    domainVerification: 'Required (automated)',
    orgVerification: 'Not required',
    trustLevel: 'Basic',
    issuanceSpeed: 'Minutes',
    color: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
    badge: 'Domain Validated',
  },
  DV_MULTIDOMAIN: {
    domainVerification: 'Required per domain (automated)',
    orgVerification: 'Not required',
    trustLevel: 'Basic',
    issuanceSpeed: 'Minutes',
    color: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
    badge: 'Domain Validated',
  },
  DV_WILDCARD: {
    domainVerification: 'Required (base domain, automated)',
    orgVerification: 'Not required',
    trustLevel: 'Basic',
    issuanceSpeed: 'Minutes',
    color: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
    badge: 'Domain Validated',
  },
  OV: {
    domainVerification: 'Required (automated)',
    orgVerification: 'Required — admin forwards to CA',
    trustLevel: 'Business',
    issuanceSpeed: '1–3 days',
    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    badge: 'Organization Validated',
  },
  OV_MULTIDOMAIN: {
    domainVerification: 'Required per domain',
    orgVerification: 'Required — admin-assisted CA verification',
    trustLevel: 'Business',
    issuanceSpeed: '1–3 days',
    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    badge: 'Organization Validated',
  },
  OV_WILDCARD: {
    domainVerification: 'Required (base domain)',
    orgVerification: 'Required — admin-assisted CA verification',
    trustLevel: 'Business',
    issuanceSpeed: '1–3 days',
    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
    badge: 'Organization Validated',
  },
  EV: {
    domainVerification: 'Required',
    orgVerification: 'Required — extended checks, admin-assisted',
    trustLevel: 'Extended',
    issuanceSpeed: '3–7 days',
    color: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
    badge: 'Extended Validation',
  },
  EV_MULTIDOMAIN: {
    domainVerification: 'Required per domain/SAN',
    orgVerification: 'Required — extended checks, admin-assisted',
    trustLevel: 'Extended',
    issuanceSpeed: '3–7 days',
    color: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
    badge: 'Extended Validation',
  },
};

const VALIDITY_LABELS: Record<string, string> = {
  ONE_YEAR: '1 Year',
  TWO_YEARS: '2 Years',
  THREE_YEARS: '3 Years',
};

const fmt = (n: number) => `₦${Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;

// ─── Product Card ─────────────────────────────────────

function ProductCard({ product, onOrder }: { product: any; onOrder: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const info = VALIDATION_INFO[product.type] || VALIDATION_INFO['DV'];
  const lowestPrice = Math.min(...product.prices.map((p: any) => Number(p.priceNgn)));

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="p-6">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="font-bold text-foreground text-lg">{product.name}</h3>
            <p className="text-sm text-muted-foreground mt-1">{product.description}</p>
          </div>
          <span className={cn('ml-3 px-2.5 py-1 rounded-full text-xs font-semibold flex-shrink-0', info.color)}>
            {info.badge}
          </span>
        </div>

        {/* Starting price */}
        <div className="flex items-baseline gap-1 mt-4 mb-4">
          <span className="text-xs text-muted-foreground">From</span>
          <span className="text-2xl font-bold text-foreground">{fmt(lowestPrice)}</span>
          <span className="text-xs text-muted-foreground">/yr</span>
        </div>

        {/* Key features */}
        <div className="space-y-2">
          {[
            { label: 'Trust Level', value: info.trustLevel },
            { label: 'Issuance Speed', value: info.issuanceSpeed },
            { label: 'Max SANs', value: product.maxSans > 1 ? `Up to ${product.maxSans}` : '1 domain' },
            { label: 'Wildcard', value: product.supportsWildcard ? 'Supported' : 'Not supported' },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{label}</span>
              <span className="font-medium text-foreground">{value}</span>
            </div>
          ))}
        </div>

        {/* Expand validation details */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 mt-4 text-xs text-primary hover:underline"
        >
          <Info className="w-3.5 h-3.5" />
          {expanded ? 'Hide' : 'View'} validation requirements
        </button>

        {expanded && (
          <div className="mt-3 p-3 bg-muted/50 rounded-xl space-y-2 text-xs">
            <div>
              <span className="font-medium text-foreground">Domain Verification: </span>
              <span className="text-muted-foreground">{info.domainVerification}</span>
            </div>
            <div>
              <span className="font-medium text-foreground">Organization Verification: </span>
              <span className="text-muted-foreground">{info.orgVerification}</span>
            </div>
          </div>
        )}
      </div>

      {/* Pricing tiers */}
      <div className="border-t border-border px-6 py-4 bg-muted/20">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Pricing</p>
        <div className="space-y-2">
          {product.prices.map((price: any) => (
            <div key={price.validity} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{VALIDITY_LABELS[price.validity]}</span>
              <span className="font-semibold text-foreground">{fmt(Number(price.priceNgn))}</span>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="px-6 pb-6 pt-4">
        <button
          onClick={() => onOrder(product.id)}
          className="w-full flex items-center justify-center gap-2 py-3 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 transition"
        >
          Order Now <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ─── Main Products Page ───────────────────────────────

export default function ProductsPage() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'DV' | 'OV' | 'EV'>('all');

  useEffect(() => {
    productsApi.list()
      .then(r => setProducts(r.data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = products.filter(p => {
    if (filter === 'all') return true;
    return p.type.startsWith(filter);
  });

  if (loading) return (
    <div className="flex justify-center items-center min-h-[400px]">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">SSL Certificate Products</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Choose the right certificate for your needs. All certificates include full chain download in PEM, DER, CER, and CRT formats.
        </p>
      </div>

      {/* Validation type info banner */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { type: 'DV', label: 'Domain Validated', desc: 'Automated issuance — minutes', color: 'border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800' },
          { type: 'OV', label: 'Organization Validated', desc: 'Identity verified — 1–3 days', color: 'border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800' },
          { type: 'EV', label: 'Extended Validation', desc: 'Highest trust — 3–7 days', color: 'border-purple-200 bg-purple-50 dark:bg-purple-950 dark:border-purple-800' },
        ].map(({ type, label, desc, color }) => (
          <div key={type} className={cn('border rounded-xl p-4 text-center', color)}>
            <p className="font-semibold text-sm text-foreground">{label}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {(['all', 'DV', 'OV', 'EV'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition',
              filter === f ? 'bg-primary text-primary-foreground' : 'border border-border hover:bg-accent'
            )}
          >
            {f === 'all' ? 'All Products' : `${f} Certificates`}
          </button>
        ))}
      </div>

      {/* Products grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <ShieldCheck className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No products available.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map(product => (
            <ProductCard
              key={product.id}
              product={product}
              onOrder={(id) => navigate(`/orders/new?product=${id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
