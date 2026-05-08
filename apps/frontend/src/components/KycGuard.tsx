import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { kycApi } from '@/api/kyc.api';
import { Loader2 } from 'lucide-react';

/**
 * Route guard that redirects to /kyc-required if the user's
 * KYC is not fully approved. Admins bypass this check.
 */
export default function KycGuard() {
  const { user } = useAuthStore();
  const [kycStatus, setKycStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(user?.role || '');

  useEffect(() => {
    if (isAdmin) {
      setLoading(false);
      return;
    }

    kycApi
      .getStatus()
      .then((res) => setKycStatus(res.data?.kycStatus || 'NOT_STARTED'))
      .catch(() => setKycStatus('NOT_STARTED'))
      .finally(() => setLoading(false));
  }, [isAdmin]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Admins always have access
  if (isAdmin) return <Outlet />;

  // Only APPROVED users can access protected routes
  if (kycStatus === 'APPROVED') return <Outlet />;

  // Everyone else goes to the KYC required holding page
  return <Navigate to="/kyc-required" replace />;
}
