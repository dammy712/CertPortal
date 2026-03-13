import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Toaster } from '@/components/ui/toaster';
import { useThemeStore } from '@/stores/themeStore';
import { useEffect } from 'react';

// Layouts
import AuthLayout from '@/layouts/AuthLayout';
import DashboardLayout from '@/layouts/DashboardLayout';

// Pages - Auth
import LoginPage from '@/pages/auth/LoginPage';
import RegisterPage from '@/pages/auth/RegisterPage';
import ForgotPasswordPage  from '@/pages/auth/ForgotPasswordPage';
import ResetPasswordPage   from '@/pages/auth/ResetPasswordPage';
import VerifyEmailPage     from '@/pages/auth/VerifyEmailPage';

// Pages - Customer
import DashboardPage from '@/pages/dashboard/DashboardPage';
import SettingsPage from '@/pages/settings/SettingsPage';
import TwoFactorSetupPage from '@/pages/settings/TwoFactorSetupPage';
import WalletPage from '@/pages/wallet/WalletPage';
import OrdersPage from '@/pages/orders/OrdersPage';
import NewOrderPage from '@/pages/orders/NewOrderPage';
import OrderDetailPage from '@/pages/orders/OrderDetailPage';
import KycPage from '@/pages/kyc/KycPage';
import ValidationPage from '@/pages/validation/ValidationPage';
import CertificatesPage from '@/pages/certificates/CertificatesPage';
import NotificationsPage from '@/pages/notifications/NotificationsPage';
import ProfilePage from '@/pages/profile/ProfilePage';
import AdminPanel from '@/pages/admin/AdminPanel';
import ProductsPage from '@/pages/products/ProductsPage';
import ConversionPage from '@/pages/conversion/ConversionPage';
import VerifyPage     from '@/pages/verify/VerifyPage';

// Placeholder
const ComingSoon = ({ page }: { page: string }) => (
  <div className="flex items-center justify-center h-full min-h-[400px]">
    <div className="text-center">
      <div className="text-4xl mb-4">🔧</div>
      <h2 className="text-2xl font-semibold text-foreground mb-2">{page}</h2>
      <p className="text-muted-foreground text-sm">This module will be built in an upcoming session.</p>
    </div>
  </div>
);

export default function App() {
  const { isDark } = useThemeStore();

  useEffect(() => {
    if (isDark) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [isDark]);

  return (
    <ErrorBoundary>
    <BrowserRouter>
      <Routes>
        {/* Auth Routes */}
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password"       element={<ForgotPasswordPage />} />
          <Route path="/reset-password"        element={<ResetPasswordPage />} />
          <Route path="/verify-email/:token"   element={<VerifyEmailPage />} />
        </Route>

        {/* Protected Customer Routes */}
        <Route element={<DashboardLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/orders/new" element={<NewOrderPage />} />
          <Route path="/orders/:id" element={<OrderDetailPage />} />
          <Route path="/kyc" element={<KycPage />} />
          <Route path="/orders/:orderId/validate" element={<ValidationPage />} />
          <Route path="/certificates" element={<CertificatesPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/admin" element={<AdminPanel />} />
          <Route path="/convert" element={<ConversionPage />} />
          <Route path="/verify" element={<VerifyPage />} />
          <Route path="/wallet" element={<WalletPage />} />
          <Route path="/profile" element={<ComingSoon page="Profile" />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/settings/2fa" element={<TwoFactorSetupPage />} />
        </Route>

        {/* Redirects */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      <Toaster />
    </BrowserRouter>
    </ErrorBoundary>
  );
}
