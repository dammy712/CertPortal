import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Bell, ShieldCheck, ShieldAlert, CreditCard,
  Package, Info, CheckCheck, X, Loader2
} from 'lucide-react';
import { notificationApi } from '@/api/notification.api';
import { cn } from '@/lib/utils';

interface Notification {
  id: string; type: string; title: string;
  message: string; isRead: boolean; createdAt: string; metadata?: any;
}

const TYPE_CONFIG: Record<string, { icon: any; color: string; bg: string }> = {
  CERT_ISSUED:    { icon: ShieldCheck, color: 'text-green-500',  bg: 'bg-green-50 dark:bg-green-950' },
  CERT_EXPIRY_90: { icon: ShieldAlert, color: 'text-blue-500',   bg: 'bg-blue-50 dark:bg-blue-950' },
  CERT_EXPIRY_60: { icon: ShieldAlert, color: 'text-yellow-500', bg: 'bg-yellow-50 dark:bg-yellow-950' },
  CERT_EXPIRY_30: { icon: ShieldAlert, color: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-950' },
  CERT_EXPIRY_7:  { icon: ShieldAlert, color: 'text-red-500',    bg: 'bg-red-50 dark:bg-red-950' },
  ORDER_UPDATE:   { icon: Package,     color: 'text-blue-500',   bg: 'bg-blue-50 dark:bg-blue-950' },
  KYC_UPDATE:     { icon: ShieldCheck, color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-950' },
  WALLET_FUNDED:  { icon: CreditCard,  color: 'text-green-500',  bg: 'bg-green-50 dark:bg-green-950' },
  SYSTEM:         { icon: Info,        color: 'text-gray-500',   bg: 'bg-gray-50 dark:bg-gray-900' },
};

const getConfig = (type: string) => TYPE_CONFIG[type] || TYPE_CONFIG.SYSTEM;

const timeAgo = (date: string) => {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString();
};

export function NotificationBell() {
  const [isOpen, setIsOpen]               = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount]     = useState(0);
  const [isLoading, setIsLoading]         = useState(false);
  const [isMarkingAll, setIsMarkingAll]   = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const result = await notificationApi.getUnreadCount();
      setUnreadCount(result.data?.unreadCount ?? 0);
    } catch {}
  }, []);

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  const fetchNotifications = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await notificationApi.getAll({ limit: 10 });
      setNotifications(result.data || []);
      setUnreadCount(result.meta?.unreadCount ?? 0);
    } catch {} finally { setIsLoading(false); }
  }, []);

  useEffect(() => {
    if (isOpen) fetchNotifications();
  }, [isOpen, fetchNotifications]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleRead = async (id: string) => {
    try {
      await notificationApi.markAsRead(id);
      setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, isRead: true } : n));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {}
  };

  const handleDelete = async (id: string) => {
    const n = notifications.find((x) => x.id === id);
    try {
      await notificationApi.delete(id);
      setNotifications((prev) => prev.filter((x) => x.id !== id));
      if (n && !n.isRead) setUnreadCount((c) => Math.max(0, c - 1));
    } catch {}
  };

  const handleMarkAllRead = async () => {
    setIsMarkingAll(true);
    try {
      await notificationApi.markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch {} finally { setIsMarkingAll(false); }
  };

  const goToNotifications = () => {
    setIsOpen(false);
    window.location.assign('/notifications');
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Bell button */}
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        className="relative p-2 rounded-lg hover:bg-accent transition text-muted-foreground hover:text-foreground"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-primary text-primary-foreground text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown — inline, no portal */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-2xl overflow-hidden"
          style={{ zIndex: 99999 }}>

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-foreground text-sm">Notifications</h3>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.5 bg-primary text-primary-foreground text-xs font-medium rounded-full">
                  {unreadCount}
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button type="button" onClick={handleMarkAllRead} disabled={isMarkingAll}
                className="text-xs text-primary hover:underline disabled:opacity-50 flex items-center gap-1">
                {isMarkingAll ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCheck className="w-3 h-3" />}
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="text-center py-10">
                <Bell className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No notifications yet</p>
              </div>
            ) : (
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {notifications.map((n) => {
                  const cfg = getConfig(n.type);
                  const Icon = cfg.icon;
                  return (
                    <div key={n.id}
                      className={cn('flex items-start gap-3 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition group cursor-pointer',
                        !n.isRead && 'bg-primary/5')}
                      onClick={() => !n.isRead && handleRead(n.id)}>
                      <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5', cfg.bg)}>
                        <Icon className={cn('w-4 h-4', cfg.color)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className={cn('text-sm leading-snug', n.isRead ? 'text-muted-foreground' : 'text-foreground font-medium')}>
                            {n.title}
                          </p>
                          {!n.isRead && <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-1.5" />}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                        <p className="text-xs text-muted-foreground/60 mt-1">{timeAgo(n.createdAt)}</p>
                      </div>
                      <button type="button"
                        onClick={(e) => { e.stopPropagation(); handleDelete(n.id); }}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:text-destructive transition flex-shrink-0">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-zinc-100 dark:border-zinc-800">
            <button type="button" onClick={goToNotifications}
              className="w-full text-center text-xs text-primary hover:underline font-medium py-1">
              View all notifications →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
