import { useState, useCallback, DragEvent, ChangeEvent } from 'react';
import {
  RefreshCw, Upload, Download, FileText, ShieldCheck,
  AlertCircle, CheckCircle2, Loader2, Eye, EyeOff, Info, X
} from 'lucide-react';
import { conversionApi } from '@/api/conversion.api';
import { cn } from '@/lib/utils';

// ─── PRD 6.1 Format Definitions ──────────────────────

const FORMATS = [
  {
    id: 'PFX',
    label: 'PFX / PKCS#12',
    ext: '.pfx',
    desc: 'Windows servers, IIS, Azure. Bundles cert + key into one file.',
    requiresKey: true,
    color: 'border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800',
    textColor: 'text-blue-700 dark:text-blue-300',
  },
  {
    id: 'P7B',
    label: 'P7B / PKCS#7',
    ext: '.p7b',
    desc: 'Java keystores, Tomcat, Windows. Certificate chain only.',
    requiresKey: false,
    color: 'border-purple-200 bg-purple-50 dark:bg-purple-950 dark:border-purple-800',
    textColor: 'text-purple-700 dark:text-purple-300',
  },
  {
    id: 'PEM',
    label: 'PEM',
    ext: '.pem',
    desc: 'Apache, Nginx, Linux servers. Base64-encoded text format.',
    requiresKey: false,
    color: 'border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800',
    textColor: 'text-green-700 dark:text-green-300',
  },
  {
    id: 'DER',
    label: 'DER',
    ext: '.der',
    desc: 'Java, Android. Binary encoding of the certificate.',
    requiresKey: false,
    color: 'border-orange-200 bg-orange-50 dark:bg-orange-950 dark:border-orange-800',
    textColor: 'text-orange-700 dark:text-orange-300',
  },
  {
    id: 'CRT',
    label: 'CRT',
    ext: '.crt',
    desc: 'Linux/Unix servers. PEM format with .crt extension.',
    requiresKey: false,
    color: 'border-teal-200 bg-teal-50 dark:bg-teal-950 dark:border-teal-800',
    textColor: 'text-teal-700 dark:text-teal-300',
  },
  {
    id: 'CER',
    label: 'CER',
    ext: '.cer',
    desc: 'Windows, browsers. DER binary format with .cer extension.',
    requiresKey: false,
    color: 'border-pink-200 bg-pink-50 dark:bg-pink-950 dark:border-pink-800',
    textColor: 'text-pink-700 dark:text-pink-300',
  },
] as const;

type FormatId = typeof FORMATS[number]['id'];

// ─── Textarea with file-drop support ─────────────────

function PemTextarea({
  label, value, onChange, placeholder, required = false, rows = 6,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; required?: boolean; rows?: number;
}) {
  const [isDragging, setIsDragging] = useState(false);

  const onDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => onChange(ev.target?.result as string);
    reader.readAsText(file);
  }, [onChange]);

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => onChange(ev.target?.result as string);
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {label} {required && <span className="text-destructive">*</span>}
        </label>
        {value && (
          <button onClick={() => onChange('')} className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1 transition">
            <X className="w-3 h-3" /> Clear
          </button>
        )}
      </div>
      <div
        className={cn(
          'relative rounded-xl border-2 border-dashed transition',
          isDragging ? 'border-primary bg-primary/5' : 'border-border',
        )}
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
      >
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          rows={rows}
          placeholder={placeholder || `Paste PEM content or drag & drop a file here…`}
          className="w-full px-4 py-3 bg-transparent text-xs font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none resize-none rounded-xl"
        />
        {!value && (
          <label className="absolute bottom-3 right-3 cursor-pointer">
            <input type="file" accept=".pem,.crt,.cer,.der,.key,.txt" onChange={onFile} className="hidden" />
            <span className="flex items-center gap-1 text-xs text-primary hover:underline">
              <Upload className="w-3 h-3" /> Upload file
            </span>
          </label>
        )}
      </div>
    </div>
  );
}

// ─── Certificate Info Card ────────────────────────────

function CertInfo({ info }: { info: any }) {
  return (
    <div className="bg-muted/40 border border-border rounded-xl p-4 space-y-2">
      <div className="flex items-center gap-2 mb-3">
        <ShieldCheck className="w-4 h-4 text-green-600" />
        <span className="text-sm font-semibold text-foreground">Certificate Details</span>
      </div>
      {[
        { label: 'Common Name', value: info.commonName },
        { label: 'Organization', value: info.organization || '—' },
        { label: 'Issuer', value: info.issuer },
        { label: 'Valid From', value: info.notBefore },
        { label: 'Valid To', value: info.notAfter },
        { label: 'Serial', value: info.serialNumber },
        { label: 'Key Algorithm', value: info.keyAlgorithm },
      ].map(({ label, value }) => (
        <div key={label} className="flex items-start justify-between gap-4 text-xs">
          <span className="text-muted-foreground shrink-0">{label}</span>
          <span className="font-medium text-foreground text-right break-all">{value}</span>
        </div>
      ))}
      {info.sans?.length > 0 && (
        <div className="pt-1">
          <p className="text-xs text-muted-foreground mb-1">Subject Alternative Names</p>
          <div className="flex flex-wrap gap-1">
            {info.sans.map((s: string) => (
              <span key={s} className="px-2 py-0.5 bg-muted text-xs rounded-full text-foreground">{s}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Conversion Page ─────────────────────────────

export default function ConversionPage() {
  const [certificate, setCertificate] = useState('');
  const [privateKey, setPrivateKey]   = useState('');
  const [chain, setChain]             = useState('');
  const [targetFormat, setTargetFormat] = useState<FormatId | null>(null);
  const [pfxPassword, setPfxPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [certInfo, setCertInfo]     = useState<any>(null);
  const [inspecting, setInspecting] = useState(false);
  const [inspectError, setInspectError] = useState('');

  const [converting, setConverting] = useState(false);
  const [convertError, setConvertError] = useState('');
  const [lastDownload, setLastDownload] = useState('');

  const selectedFormat = FORMATS.find(f => f.id === targetFormat);

  // ── Inspect cert on paste/change ──
  const handleCertChange = useCallback(async (val: string) => {
    setCertificate(val);
    setCertInfo(null);
    setInspectError('');
    if (!val.trim().includes('-----BEGIN')) return;
    setInspecting(true);
    try {
      const res = await conversionApi.inspect(val);
      setCertInfo(res.data);
    } catch (e: any) {
      setInspectError(e?.response?.data?.message || 'Could not parse certificate.');
    } finally {
      setInspecting(false);
    }
  }, []);

  // ── Convert & download ────────────────────────────
  const handleConvert = async () => {
    if (!certificate.trim()) { setConvertError('Please paste your certificate.'); return; }
    if (!targetFormat) { setConvertError('Please select a target format.'); return; }
    if (selectedFormat?.requiresKey && !privateKey.trim()) {
      setConvertError('Private key is required for PFX/PKCS#12 conversion.'); return;
    }

    setConverting(true);
    setConvertError('');
    setLastDownload('');

    try {
      const { blob, filename } = await conversionApi.convert({
        certificate,
        privateKey: privateKey || undefined,
        chain: chain || undefined,
        targetFormat,
        pfxPassword: targetFormat === 'PFX' ? pfxPassword : undefined,
      });

      // Trigger browser download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setLastDownload(filename);
    } catch (e: any) {
      const msg = e?.response?.data?.message || 'Conversion failed. Please check your inputs.';
      setConvertError(msg);
    } finally {
      setConverting(false);
    }
  };

  const handleReset = () => {
    setCertificate(''); setPrivateKey(''); setChain('');
    setTargetFormat(null); setPfxPassword('');
    setCertInfo(null); setInspectError('');
    setConvertError(''); setLastDownload('');
  };

  return (
    <div className="space-y-6 max-w-4xl">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Certificate Conversion</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Convert SSL/TLS certificates between formats. Private keys are never stored — all operations happen in secure temporary memory.
        </p>
      </div>

      {/* Security note */}
      <div className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-xl text-sm">
        <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
        <div className="text-blue-800 dark:text-blue-300">
          <strong>Privacy guaranteed:</strong> Your private key and certificate data are processed in-memory and immediately discarded. Nothing is saved to disk or logged.
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── Left: Inputs ── */}
        <div className="space-y-5">

          {/* Certificate */}
          <PemTextarea
            label="Certificate (PEM)"
            value={certificate}
            onChange={handleCertChange}
            placeholder="-----BEGIN CERTIFICATE-----&#10;MIIDXTCCAkWgAwIBAgI...&#10;-----END CERTIFICATE-----"
            required
          />

          {/* Live cert info */}
          {inspecting && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Parsing certificate…
            </div>
          )}
          {inspectError && (
            <div className="flex items-center gap-2 text-xs text-destructive">
              <AlertCircle className="w-3.5 h-3.5" /> {inspectError}
            </div>
          )}
          {certInfo && <CertInfo info={certInfo} />}

          {/* Private Key */}
          <PemTextarea
            label="Private Key (PEM)"
            value={privateKey}
            onChange={setPrivateKey}
            placeholder="-----BEGIN PRIVATE KEY-----&#10;(Required for PFX/PKCS#12 only)&#10;-----END PRIVATE KEY-----"
            rows={5}
          />

          {/* Chain */}
          <PemTextarea
            label="Intermediate Chain (PEM)"
            value={chain}
            onChange={setChain}
            placeholder="-----BEGIN CERTIFICATE-----&#10;(Optional — paste intermediate CA chain)&#10;-----END CERTIFICATE-----"
            rows={4}
          />
        </div>

        {/* ── Right: Format selection + convert ── */}
        <div className="space-y-5">

          {/* Format picker */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 block">
              Select Target Format <span className="text-destructive">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {FORMATS.map(fmt => (
                <button
                  key={fmt.id}
                  onClick={() => setTargetFormat(fmt.id)}
                  className={cn(
                    'text-left p-3 rounded-xl border-2 transition',
                    targetFormat === fmt.id
                      ? `${fmt.color} border-current`
                      : 'border-border hover:border-muted-foreground/40'
                  )}
                >
                  <div className={cn('font-bold text-sm', targetFormat === fmt.id ? fmt.textColor : 'text-foreground')}>
                    {fmt.label}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 leading-snug">{fmt.desc}</div>
                  {fmt.requiresKey && (
                    <span className="mt-1 inline-block text-xs font-medium text-amber-600 dark:text-amber-400">Requires private key</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* PFX Password */}
          {targetFormat === 'PFX' && (
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                PFX Password (optional)
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={pfxPassword}
                  onChange={e => setPfxPassword(e.target.value)}
                  placeholder="Leave blank for no password"
                  className="w-full px-3 py-2.5 pr-10 border border-input rounded-xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <button onClick={() => setShowPassword(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          {/* Errors */}
          {convertError && (
            <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-xl text-sm text-destructive">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {convertError}
            </div>
          )}

          {/* Success */}
          {lastDownload && (
            <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-xl text-sm text-green-700 dark:text-green-300">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span><strong>{lastDownload}</strong> downloaded successfully.</span>
            </div>
          )}

          {/* Convert button */}
          <button
            onClick={handleConvert}
            disabled={converting || !certificate.trim() || !targetFormat}
            className="w-full flex items-center justify-center gap-2 py-3.5 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {converting
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Converting…</>
              : <><Download className="w-4 h-4" /> Convert & Download {targetFormat ? `(.${targetFormat.toLowerCase()})` : ''}</>
            }
          </button>

          <button
            onClick={handleReset}
            className="w-full py-2.5 border border-border rounded-xl text-sm text-muted-foreground hover:bg-accent transition flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Reset All Fields
          </button>

          {/* Format guide */}
          <div className="p-4 border border-border rounded-xl space-y-2">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">Quick Format Guide</span>
            </div>
            {[
              { server: 'Apache / Nginx', fmt: 'PEM or CRT' },
              { server: 'IIS / Windows', fmt: 'PFX' },
              { server: 'Java / Tomcat', fmt: 'P7B or DER' },
              { server: 'Azure / AWS', fmt: 'PFX or PEM' },
              { server: 'Android / iOS', fmt: 'DER or PFX' },
            ].map(({ server, fmt }) => (
              <div key={server} className="flex justify-between text-xs">
                <span className="text-muted-foreground">{server}</span>
                <span className="font-medium text-foreground">{fmt}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
