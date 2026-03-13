import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ShieldCheck, ShieldAlert, ShieldOff, Upload, Trash2,
  Eye, Clock, CheckCircle2, XCircle, AlertTriangle,
  Loader2, FileText, Image, Info, RefreshCw
} from 'lucide-react';
import { kycApi } from '@/api/kyc.api';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────

interface KycDocument {
  id: string;
  type: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewNotes?: string;
  createdAt: string;
  reviewedAt?: string;
}

// ─── Config ───────────────────────────────────────────

const DOCUMENT_TYPES = [
  { value: 'NATIONAL_ID', label: 'National ID Card', category: 'Identity', required: true },
  { value: 'PASSPORT', label: 'International Passport', category: 'Identity', required: false },
  { value: 'DRIVERS_LICENSE', label: "Driver's License", category: 'Identity', required: false },
  { value: 'UTILITY_BILL', label: 'Utility Bill', category: 'Address', required: true },
  { value: 'BANK_STATEMENT', label: 'Bank Statement', category: 'Address', required: false },
  { value: 'CAC_CERTIFICATE', label: 'CAC Certificate', category: 'Business', required: false },
  { value: 'CAC_FORM_CO7', label: 'CAC Form CO7', category: 'Business', required: false },
  { value: 'OTHER', label: 'Other Document', category: 'Other', required: false },
];

const kycStatusConfig = {
  NOT_STARTED: { label: 'Not Started', color: 'text-muted-foreground', bg: 'bg-muted', icon: ShieldOff },
  PENDING: { label: 'Pending Review', color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-50 dark:bg-yellow-950', icon: Clock },
  UNDER_REVIEW: { label: 'Under Review', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950', icon: RefreshCw },
  APPROVED: { label: 'Verified', color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-950', icon: ShieldCheck },
  REJECTED: { label: 'Action Required', color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-950', icon: ShieldAlert },
};

const docStatusConfig = {
  PENDING: { label: 'Pending Review', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300', icon: Clock },
  APPROVED: { label: 'Approved', color: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300', icon: CheckCircle2 },
  REJECTED: { label: 'Rejected', color: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300', icon: XCircle },
};

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDate = (date: string) =>
  new Date(date).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });

// ─── Upload Modal ─────────────────────────────────────

function UploadModal({
  onClose,
  onSuccess,
  existingTypes,
}: {
  onClose: () => void;
  onSuccess: () => void;
  existingTypes: string[];
}) {
  const [documentType, setDocumentType] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const availableTypes = DOCUMENT_TYPES.filter(
    (t) => !existingTypes.includes(t.value) || t.value === documentType
  );

  const handleFile = (f: File) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowed.includes(f.type)) { setError('Only JPG, PNG, WEBP and PDF files allowed.'); return; }
    if (f.size > 10 * 1024 * 1024) { setError('File must be under 10MB.'); return; }
    setError('');
    setFile(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  };

  const handleUpload = async () => {
    if (!documentType) { setError('Please select a document type.'); return; }
    if (!file) { setError('Please select a file.'); return; }
    setIsUploading(true);
    setError('');
    try {
      await kycApi.uploadDocument(documentType, file);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl">
        <div className="p-6 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Upload Document</h2>
          <p className="text-sm text-muted-foreground mt-1">Upload a clear, legible copy of your document</p>
        </div>

        <div className="p-6 space-y-4">
          {/* Document type */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Document Type</label>
            <select
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Select document type...</option>
              {['Identity', 'Address', 'Business', 'Other'].map((cat) => {
                const catTypes = availableTypes.filter((t) => t.category === cat);
                if (!catTypes.length) return null;
                return (
                  <optgroup key={cat} label={cat}>
                    {catTypes.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all',
              isDragging ? 'border-primary bg-primary/5' :
              file ? 'border-green-400 bg-green-50 dark:bg-green-950' :
              'border-border hover:border-primary/50 hover:bg-accent/50'
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.webp,.pdf"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              className="hidden"
            />
            {file ? (
              <div className="flex items-center justify-center gap-3">
                {file.type === 'application/pdf'
                  ? <FileText className="w-8 h-8 text-green-500" />
                  : <Image className="w-8 h-8 text-green-500" />
                }
                <div className="text-left">
                  <p className="text-sm font-medium text-foreground">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
                </div>
              </div>
            ) : (
              <div>
                <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-foreground font-medium">Drop file here or click to browse</p>
                <p className="text-xs text-muted-foreground mt-1">JPG, PNG, WEBP or PDF · Max 10MB</p>
              </div>
            )}
          </div>

          {/* Tips */}
          <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
            <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-blue-700 dark:text-blue-300">
              Ensure the document is clear, fully visible, and not expired. Documents with glare or blurry text will be rejected.
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}
        </div>

        <div className="p-6 pt-0 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm border border-border rounded-lg hover:bg-accent transition">
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={isUploading || !file || !documentType}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 transition"
          >
            {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {isUploading ? 'Uploading...' : 'Upload Document'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Document Card ────────────────────────────────────

function DocumentCard({ doc, onDelete, onView }: {
  doc: KycDocument;
  onDelete: (id: string) => void;
  onView: (id: string) => void;
}) {
  const [isDeleting, setIsDeleting] = useState(false);
  const statusCfg = docStatusConfig[doc.status];
  const StatusIcon = statusCfg.icon;
  const docLabel = DOCUMENT_TYPES.find((t) => t.value === doc.documentType)?.label || doc.documentType;

  const handleDelete = async () => {
    if (!window.confirm('Delete this document?')) return;
    setIsDeleting(true);
    try {
      await kycApi.deleteDocument(doc.id);
      onDelete(doc.id);
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Delete failed.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-4 flex items-start gap-4">
      <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center flex-shrink-0">
        {doc.mimeType === 'application/pdf'
          ? <FileText className="w-5 h-5 text-muted-foreground" />
          : <Image className="w-5 h-5 text-muted-foreground" />
        }
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-foreground">{docLabel}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{doc.fileName} · {formatBytes(doc.fileSize)}</p>
          </div>
          <span className={cn('inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium flex-shrink-0', statusCfg.color)}>
            <StatusIcon className="w-3 h-3" />
            {statusCfg.label}
          </span>
        </div>

        {doc.reviewNotes && doc.status === 'REJECTED' && (
          <div className="mt-2 p-2 bg-destructive/10 rounded-lg">
            <p className="text-xs text-destructive">{doc.reviewNotes}</p>
          </div>
        )}

        <div className="flex items-center gap-3 mt-3">
          <p className="text-xs text-muted-foreground">Uploaded {formatDate(doc.createdAt)}</p>
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={() => onView(doc.id)}
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <Eye className="w-3.5 h-3.5" /> View
            </button>
            {doc.status !== 'APPROVED' && (
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex items-center gap-1 text-xs text-destructive hover:underline disabled:opacity-50"
              >
                {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Delete
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main KYC Page ────────────────────────────────────

export default function KycPage() {
  const [kycStatus, setKycStatus] = useState<string>('NOT_STARTED');
  const [documents, setDocuments] = useState<KycDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);

  const loadKyc = useCallback(async () => {
    try {
      const result = await kycApi.getStatus();
      setKycStatus(result.data.kycStatus);
      setDocuments(result.data.documents);
    } catch (err) {
      console.error('Failed to load KYC:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadKyc(); }, [loadKyc]);

  const handleView = async (id: string) => {
    try {
      const result = await kycApi.getDocumentUrl(id);
      window.open(result.data.url, '_blank');
    } catch (err) {
      console.error('Failed to get document URL:', err);
    }
  };

  const handleDelete = (id: string) => {
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  };

  const existingTypes = documents
    .filter((d) => d.status !== 'REJECTED')
    .map((d) => d.documentType);

  const statusCfg = kycStatusConfig[kycStatus as keyof typeof kycStatusConfig] || kycStatusConfig.NOT_STARTED;
  const StatusIcon = statusCfg.icon;

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">KYC Verification</h1>
          <p className="text-sm text-muted-foreground mt-1">Required for OV and EV certificate orders</p>
        </div>
        <button
          onClick={() => setShowUploadModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition"
        >
          <Upload className="w-4 h-4" />
          Upload Document
        </button>
      </div>

      {/* KYC Status Banner */}
      <div className={cn('rounded-xl p-5 flex items-start gap-4', statusCfg.bg)}>
        <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-background/50')}>
          <StatusIcon className={cn('w-6 h-6', statusCfg.color)} />
        </div>
        <div>
          <p className={cn('font-semibold', statusCfg.color)}>{statusCfg.label}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {kycStatus === 'NOT_STARTED' && 'Upload your identity and address documents to get started.'}
            {kycStatus === 'PENDING' && 'Your documents have been submitted and are awaiting review. This usually takes 1-2 business days.'}
            {kycStatus === 'UNDER_REVIEW' && 'Our team is currently reviewing your documents.'}
            {kycStatus === 'APPROVED' && 'Your identity has been verified. You can now place OV and EV certificate orders.'}
            {kycStatus === 'REJECTED' && 'Some documents were rejected. Please review the feedback below and resubmit.'}
          </p>
        </div>
      </div>

      {/* Required Documents Checklist */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="font-semibold text-foreground mb-4">Required Documents</h3>
        <div className="space-y-3">
          {[
            { label: 'Government-issued ID', desc: 'National ID, Passport, or Driver\'s License', types: ['NATIONAL_ID', 'PASSPORT', 'DRIVERS_LICENSE'] },
            { label: 'Proof of Address', desc: 'Utility Bill or Bank Statement (last 3 months)', types: ['UTILITY_BILL', 'BANK_STATEMENT'] },
          ].map((req) => {
            const submitted = documents.some((d) => req.types.includes(d.documentType));
            const approved = documents.some((d) => req.types.includes(d.documentType) && d.status === 'APPROVED');
            return (
              <div key={req.label} className="flex items-center gap-3">
                <div className={cn(
                  'w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0',
                  approved ? 'bg-green-500' : submitted ? 'bg-yellow-500' : 'bg-muted'
                )}>
                  {approved
                    ? <CheckCircle2 className="w-4 h-4 text-white" />
                    : submitted
                    ? <Clock className="w-3.5 h-3.5 text-white" />
                    : <span className="w-2 h-2 bg-muted-foreground rounded-full" />
                  }
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{req.label}</p>
                  <p className="text-xs text-muted-foreground">{req.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Uploaded Documents */}
      <div>
        <h3 className="font-semibold text-foreground mb-3">
          Uploaded Documents {documents.length > 0 && `(${documents.length})`}
        </h3>

        {documents.length === 0 ? (
          <div className="bg-card border border-dashed border-border rounded-xl p-8 text-center">
            <FileText className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">No documents uploaded yet</p>
            <button
              onClick={() => setShowUploadModal(true)}
              className="mt-3 text-sm text-primary hover:underline"
            >
              Upload your first document
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {documents.map((doc) => (
              <DocumentCard
                key={doc.id}
                doc={doc}
                onDelete={handleDelete}
                onView={handleView}
              />
            ))}
          </div>
        )}
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <UploadModal
          onClose={() => setShowUploadModal(false)}
          onSuccess={loadKyc}
          existingTypes={existingTypes}
        />
      )}
    </div>
  );
}
