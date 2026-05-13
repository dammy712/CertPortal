import { Outlet, Navigate, NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck, ShieldQuestion, LayoutDashboard, FileText, RefreshCw,
  Wallet, User, Settings, LogOut, Moon, Sun, Bell, Menu, X,
  BadgeCheck, Package, CheckCircle2,
} from 'lucide-react';
import { NotificationBell } from '@/components/NotificationBell';
import { cn } from '@/lib/utils';
import { certificateApi } from '@/api/certificate.api';
import { kycApi } from '@/api/kyc.api';
import { notificationApi } from '@/api/notification.api';

// ─── Nav group types ──────────────────────────────────

interface NavItem {
  to: string;
  icon: any;
  label: string;
  badge?: number | string | null;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

// ─── Sidebar Nav Item ─────────────────────────────────

function SidebarNavItem({ item, onClick }: { item: NavItem; onClick: () => void }) {
  return (
    <NavLink
      to={item.to}
      onClick={onClick}
      className={({ isActive }) => cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
        isActive
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:text-foreground hover:bg-accent'
      )}
    >
      {({ isActive }) => (
        <>
          <item.icon className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1 truncate">{item.label}</span>
          {item.badge != null && item.badge !== 0 && (
            <span className={cn(
              'text-xs px-1.5 py-0.5 rounded-full font-semibold min-w-[18px] text-center',
              isActive
                ? 'bg-primary-foreground/20 text-primary-foreground'
                : 'bg-primary/10 text-primary'
            )}>
              {item.badge}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

// ─── Main Layout ──────────────────────────────────────

export default function DashboardLayout() {
  const { isAuthenticated, user, clearAuth } = useAuthStore();
  const { isDark, toggle } = useThemeStore();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Live badge state
  const [pendingOrderCount, setPendingOrderCount] = useState(0);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [kycStatus, setKycStatus] = useState<string>('');

  const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(user?.role || '');

  // Fetch live badge data
  const fetchBadgeData = useCallback(async () => {
    try {
      const [ordersRes, notifRes, kycRes] = await Promise.allSettled([
        certificateApi.getOrders({ page: 1, limit: 50, status: 'pending' }),
        notificationApi.getUnreadCount(),
        isAdmin ? Promise.resolve(null) : kycApi.getStatus(),
      ]);

      if (ordersRes.status === 'fulfilled') {
        setPendingOrderCount(ordersRes.value?.data?.length || 0);
      }
      if (notifRes.status === 'fulfilled') {
        setUnreadNotifCount(notifRes.value?.data?.count || 0);
      }
      if (kycRes.status === 'fulfilled' && kycRes.value) {
        setKycStatus(kycRes.value?.data?.kycStatus || '');
      }
    } catch {}
  }, [isAdmin]);

  useEffect(() => {
    fetchBadgeData();
    // Refresh every 60 seconds
    const interval = setInterval(fetchBadgeData, 60000);
    return () => clearInterval(interval);
  }, [fetchBadgeData]);

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  const handleLogout = () => {
    clearAuth();
    navigate('/login');
  };

  // KYC badge — show checkmark if approved, warning if not
  const kycBadge = isAdmin ? null : kycStatus === 'APPROVED' ? '✓' : kycStatus === 'PENDING' || kycStatus === 'UNDER_REVIEW' ? '…' : null;

  // ─── Nav groups ───────────────────────────────────────
  const mainGroup: NavGroup = {
    label: 'Main',
    items: [
      { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/orders', icon: FileText, label: 'Orders', badge: pendingOrderCount || null },
      { to: '/wallet', icon: Wallet, label: 'Wallet' },
      { to: '/certificates', icon: ShieldCheck, label: 'Certificates' },
      { to: '/notifications', icon: Bell, label: 'Notifications', badge: unreadNotifCount || null },
    ],
  };

  const toolsGroup: NavGroup = {
    label: 'Tools',
    items: [
      { to: '/products', icon: Package, label: 'Browse Products' },
      { to: '/convert', icon: RefreshCw, label: 'Convert Certificate' },
      { to: '/verify', icon: ShieldQuestion, label: 'Verify Certificate' },
      { to: '/kyc', icon: BadgeCheck, label: 'KYC Verification', badge: kycBadge },
    ],
  };

  const accountGroup: NavGroup = {
    label: 'Account',
    items: [
      { to: '/profile', icon: User, label: 'Profile & Settings' },
    ],
  };

  const adminGroup: NavGroup = {
    label: 'Admin',
    items: [
      { to: '/admin', icon: Settings, label: 'Admin Panel' },
    ],
  };

  const navGroups = [
    mainGroup,
    toolsGroup,
    accountGroup,
    ...(isAdmin ? [adminGroup] : []),
  ];

  return (
    <div className="min-h-screen bg-background flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        'fixed lg:static inset-y-0 left-0 z-30 w-64 bg-card border-r border-border',
        'flex flex-col transition-transform duration-200',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      )}>
        {/* Logo */}
        <div className="p-6 border-b border-border flex items-center gap-3">
          <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-lg text-foreground">CertPortal</span>
          <button
            onClick={() => setSidebarOpen(false)}
            className="ml-auto lg:hidden text-muted-foreground hover:text-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Grouped Nav */}
        <nav className="flex-1 p-3 overflow-y-auto space-y-4">
          {navGroups.map((group) => (
            <div key={group.label}>
              <p className="px-3 mb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <SidebarNavItem
                    key={item.to}
                    item={item}
                    onClick={() => setSidebarOpen(false)}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* KYC Status strip */}
        {!isAdmin && kycStatus && kycStatus !== 'APPROVED' && (
          <div className="mx-3 mb-2 px-3 py-2 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0" />
            <p className="text-xs text-yellow-700 dark:text-yellow-300">
              KYC {kycStatus === 'PENDING' || kycStatus === 'UNDER_REVIEW' ? 'under review' : 'not verified'}
            </p>
          </div>
        )}

        {/* User info */}
        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-3 px-3 py-2 mb-1">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-semibold text-primary">
                {user?.firstName?.[0]}{user?.lastName?.[0]}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-16 border-b border-border bg-card flex items-center justify-between px-4 lg:px-6 sticky top-0 z-10">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden text-muted-foreground hover:text-foreground"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2 ml-auto">
            <NotificationBell />
            <button
              onClick={toggle}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
            >
              {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
