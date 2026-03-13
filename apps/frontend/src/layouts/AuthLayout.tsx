import { Outlet, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { ShieldCheck } from 'lucide-react';

export default function AuthLayout() {
  const { isAuthenticated } = useAuthStore();

  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary rounded-2xl mb-4 shadow-lg">
            <ShieldCheck className="w-9 h-9 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">CertPortal</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Secure SSL/TLS Certificate Management
          </p>
        </div>

        {/* Card */}
        <div className="bg-card rounded-2xl shadow-xl border border-border p-8">
          <Outlet />
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          © {new Date().getFullYear()} CertPortal. All rights reserved.
        </p>
      </div>
    </div>
  );
}
