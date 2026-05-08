import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { kycApi } from '@/api/kyc.api';
import {
  ShieldCheck, ShieldOff, Clock, Upload,
  LogOut, RefreshCw, CheckCircle2, AlertTriangle,
} from 'lucide-react';

const steps = [
  { icon: Upload, label: 'Submit Documents', desc: 'Upload your ID and proof of address' },
  { icon: Clock, label: 'Admin Review', desc: 'Our team reviews your documents' },
  { icon: CheckCircle2, label: 'Get Approved', desc: 'Access the full platform' },
];

const statusConfig: Record<string, { icon: any; color: string; title: string; message: string }> = {
  NOT_STARTED: {
    icon: ShieldOff,
    color: 'text-muted-foreground',
    title: 'KYC Verification Required',
    message: 'To access CertPortal, you must complete identity verification. Please upload your documents to get started.',
  },
  PENDING: {
    icon: Clock,
    color: 'text-yellow-500',
    title: 'Documents Under Review',
    message: 'Your documents have been submitted and are currently being reviewed by our team. You will be notified once approved.',
  },
  UNDER_REVIEW: {
    icon: RefreshCw,
    color: 'text-blue-500',
    title: 'Verification In Progress',
    message: 'Our team is actively reviewing your documents. This usually takes 1–2 business days.',
  },
  REJECTED: {
    icon: AlertTriangle,
    color: 'text-red-500',
    title: 'Action Required',
    message: 'One or more of your documents were not accepted. Please review the feedback and resubmit.',
  },
};

export default function KycRequiredPage() {
  const { user, clearAuth } = useAuthStore();
  const navigate = useNavigate();
  const [kycStatus, setKycStatus] = useState('NOT_STARTED');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    kycApi
      .getStatus()
      .then((res) => setKycStatus(res.data?.kycStatus || 'NOT_STARTED'))
      .catch(() => setKycStatus('NOT_STARTED'))
      .finally(() => setLoading(false));
  }, []);

  // If somehow approved, redirect to dashboard
  useEffect(() => {
    if (kycStatus === 'APPROVED') navigate('/dashboard', { replace: true });
  }, [kycStatus, navigate]);

  const handleLogout = () => {
    clearAuth();
    navigate('/login');
  };

  const config = statusConfig[kycStatus] || statusConfig.NOT_STARTED;
  const StatusIcon = config.icon;
  const canSubmit = kycStatus === 'NOT_STARTED' || kycStatus === 'REJECTED';

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      {/* Header */}
      <div className="w-full max-w-lg">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-foreground">CertPortal</span>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>

        {/* Main Card */}
        <div className="bg-card border border-border rounded-2xl p-8 shadow-sm">
          {/* Status Icon */}
          <div className="flex flex-col items-center text-center mb-6">
            <div className={`w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4 ${loading ? 'animate-pulse' : ''}`}>
              <StatusIcon className={`w-8 h-8 ${config.color}`} />
            </div>
            <h1 className="text-xl font-bold text-foreground">{config.title}</h1>
            <p className="text-sm text-muted-foreground mt-2 max-w-sm">{config.message}</p>
          </div>

          {/* Steps */}
          <div className="flex items-start justify-between gap-2 mb-8">
            {steps.map((step, i) => {
              const StepIcon = step.icon;
              const isComplete =
                (i === 0 && ['PENDING', 'UNDER_REVIEW', 'APPROVED'].includes(kycStatus)) ||
                (i === 1 && ['UNDER_REVIEW', 'APPROVED'].includes(kycStatus)) ||
                (i === 2 && kycStatus === 'APPROVED');
              return (
                <div key={i} className="flex flex-col items-center text-center flex-1">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 ${
                    isComplete ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  }`}>
                    <StepIcon className="w-4 h-4" />
                  </div>
                  <p className={`text-xs font-medium ${isComplete ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {step.label}
                  </p>
                  <p className="text-xs text-muted-foreground hidden sm:block">{step.desc}</p>
                </div>
              );
            })}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-3">
            {canSubmit && (
              <button
                onClick={() => navigate('/kyc')}
                className="w-full py-2.5 px-4 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                {kycStatus === 'REJECTED' ? 'Resubmit Documents' : 'Start KYC Verification'}
              </button>
            )}

            {['PENDING', 'UNDER_REVIEW'].includes(kycStatus) && (
              <button
                onClick={() => navigate('/kyc')}
                className="w-full py-2.5 px-4 border border-border rounded-lg text-sm font-medium text-foreground hover:bg-accent transition-colors"
              >
                View Submitted Documents
              </button>
            )}

            <button
              onClick={() => {
                setLoading(true);
                kycApi.getStatus()
                  .then((res) => setKycStatus(res.data?.kycStatus || 'NOT_STARTED'))
                  .catch(() => {})
                  .finally(() => setLoading(false));
              }}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Check approval status
            </button>
          </div>
        </div>

        {/* Footer note */}
        <p className="text-center text-xs text-muted-foreground mt-4">
          Logged in as <span className="font-medium text-foreground">{user?.firstName} {user?.lastName}</span> · {user?.email}
        </p>
      </div>
    </div>
  );
}
