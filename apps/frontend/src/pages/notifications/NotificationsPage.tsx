import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell, ShieldCheck, ShieldAlert, CreditCard, Package,
  Info, CheckCheck, Trash2, Loader2, RefreshCw,
  ArrowRight, Clock, CheckCircle2
} from 'lucide-react';
import { notificationApi } from '@/api/notification.api';
import { cn } from '@/lib/utils';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  metadata?: {
    orderId?: string;
    certificateId?: string;
    kycDocumentId?: string;
    transactionId?: string;
    domain?: string;
    expiresAt?: string;
    daysUntilExpiry?: number;
  };
}

const TYPE_CONFIG: Record<string, { icon: any; color: string; bg: string; label: string; category: string }> = {
  CERT_ISSUED:    { icon: ShieldCheck, color: 'text-green-500',  bg: 'bg-green-50 dark:bg-green-950',   label: 'Certificate Issued', category: 'certificates' },
  CERT_EXPIRY_90: { icon: ShieldAlert, color: 'text-blue-500',   bg: 'bg-blue-50 dark:bg-blue-950',     label: 'Expiry Alert',       category: 'certificates' },
  CERT_EXPIRY_60: { icon: ShieldAlert, color: 'text-yellow-500', bg: 'bg-yellow-50 dark:bg-yellow-950', label: 'Expiry Alert',       category: 'certificates' },
  CERT_EXPIRY_30: { icon: ShieldAlert, color: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-950', label: 'Expiry Alert',       category: 'certificates' },
  CERT_EXPIRY_7:  { icon: ShieldAlert, color: 'text-red-500',    bg: 'bg-red-50 dark:bg-red-950',       label: 'Expiry Alert',       category: 'certificates' },
  ORDER_UPDATE:   { icon: Package,     color: 'text-blue-500',   bg: 'bg-blue-50 dark:bg-blue-950',     label: 'Order Update',       category: 'orders' },
  KYC_UPDATE:     { icon: ShieldCheck, color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-950', label: 'KYC Update',         category: 'kyc' },
  WALLET_FUNDED:  { icon: CreditCard,  color: 'text-green-500',  bg: 'bg-green-50 dark:bg-green-950',   label: 'Wallet Funded',      category: 'wallet' },
  SYSTEM:         { icon: Info,        color: 'text-gray-500',   bg: 'bg-gray-50 dark:bg-gray-900',     label: 'System',             category: 'system' },
};

const getConfig = (type: string) => TYPE_CONFIG[type] || TYPE_CONFIG.SYSTEM;

const FILTER_TABS = [
  { id: 'all',          label: 'All',          icon: Bell },
  { id: 'unread',       label: 'Unread',       icon: Clock },
  { id: 'certificates', label: 'Certificates', icon: ShieldCheck },
  { id: 'orders',       label: 'Orders',       icon: Package },
  { id: 'kyc',          label: 'KYC',          icon: ShieldCheck },
  { id: 'wallet',       label: 'Wallet',       icon: CreditCard },
  { id: 'system',       label: 'System',       icon: Info },
] as const;

type FilterId = typeof FILTER_TABS[number]['id'];

const timeAgo = (date: string) => {
  const diff  = Date.now() - new Date(date).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 1)   return 'just now';
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7)   return `${days}d ago`;
  return new Date(date).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
};

const formatFullDate = (date: string) =>
  new Date(date).toLocaleDateString('en-NG', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

function NotificationAction({ notification }: { notification: Notification }) {
  const navigate = useNavigate();
  const { type, metadata } = notification;
  if (!metadata) return null;

  if ((type === 'CERT_ISSUED' || type.startsWith('CERT_EXPIRY')) && metadata.certificateId)
    return (
      <button onClick={(e) => { e.stopPropagation(); navigate(`/certificates/${metadata.certificateId}`); }}
        className="flex items-center gap-1 text-xs text-primary hover:underline font-medium mt-2">
        View Certificate <ArrowRight className="w-3 h-3" />
      </button>
    );

  if (type === 'ORDER_UPDATE' && metadata.orderId)
    return (
      <button onClick={(e) => { e.stopPropagation(); navigate(`/orders/${metadata.orderId}`); }}
        className="flex items-center gap-1 text-xs text-primary hover:underline font-medium mt-2">
        View Order <ArrowRight className="w-3 h-3" />
      </button>
    );

  if (type === 'WALLET_FUNDED')
    return (
      <button onClick={(e) => { e.stopPropagation(); navigate('/wallet'); }}
        className="flex items-center gap-1 text-xs text-primary hover:underline font-medium mt-2">
        View Wallet <ArrowRight className="w-3 h-3" />
      </button>
    );

  if (type === 'KYC_UPDATE')
    return (
      <button onClick={(e) => { e.stopPropagation(); navigate('/kyc'); }}
        className="flex items-center gap-1 text-xs text-primary hover:underline font-medium mt-2">
        View KYC Status <ArrowRight className="w-3 h-3" />
      </button>
    );

  return null;
}

function NotificationRow({ notification, onRead, onDelete }: {
  notification: Notification;
  onRead: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const cfg  = getConfig(notification.type);
  const Icon = cfg.icon;

  return (
    <div
      className={cn(
        'group flex items-start gap-4 px-5 py-4 transition-colors border-b border-border last:border-0',
        !notification.isRead ? 'bg-primary/[0.03] hover:bg-primary/[0.06] cursor-pointer' : 'hover:bg-accent/40'
      )}
      onClick={() => !notification.isRead && onRead(notification.id)}
    >
      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5', cfg.bg)}>
        <Icon className={cn('w-5 h-5', cfg.color)} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className={cn('text-sm leading-snug', !notification.isRead ? 'font-semibold text-foreground' : 'text-foreground')}>
                {notification.title}
              </p>
              {!notification.isRead && <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />}
              <span className="px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-muted text-muted-foreground">
                {cfg.label}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">{notification.message}</p>
            <NotificationAction notification={notification} />
            <p className="text-[10px] text-muted-foreground/40 mt-1.5 hidden group-hover:block">
              {formatFullDate(notification.createdAt)}
            </p>
          </div>

          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            <span className="text-xs text-muted-foreground/60 whitespace-nowrap">{timeAgo(notification.createdAt)}</span>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {!notification.isRead && (
                <button onClick={(e) => { e.stopPropagation(); onRead(notification.id); }}
                  className="p-1 rounded hover:bg-green-100 dark:hover:bg-green-900 hover:text-green-600 text-muted-foreground transition" title="Mark as read">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                </button>
              )}
              <button onClick={(e) => { e.stopPropagation(); onDelete(notification.id); }}
                className="p-1 rounded hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition" title="Delete">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ filter }: { filter: FilterId }) {
  const messages: Record<FilterId, { title: string; desc: string; icon: any }> = {
    all:          { icon: Bell,        title: 'No notifications yet',         desc: 'Activity and alerts will appear here.' },
    unread:       { icon: CheckCheck,  title: "You're all caught up!",        desc: 'No unread notifications.' },
    certificates: { icon: ShieldCheck, title: 'No certificate notifications', desc: 'Expiry alerts and issuance updates will appear here.' },
    orders:       { icon: Package,     title: 'No order notifications',       desc: 'Order status updates will appear here.' },
    kyc:          { icon: ShieldCheck, title: 'No KYC notifications',         desc: 'Verification updates will appear here.' },
    wallet:       { icon: CreditCard,  title: 'No wallet notifications',      desc: 'Funding confirmations will appear here.' },
    system:       { icon: Info,        title: 'No system notifications',      desc: 'Platform announcements will appear here.' },
  };
  const { icon: Icon, title, desc } = messages[filter] || messages.all;
  return (
    <div className="flex flex-col items-center justify-center py-20 bg-card border border-dashed border-border rounded-xl">
      <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
        <Icon className="w-7 h-7 text-muted-foreground/40" />
      </div>
      <p className="font-semibold text-foreground">{title}</p>
      <p className="text-sm text-muted-foreground mt-1 max-w-xs text-center">{desc}</p>
    </div>
  );
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading]         = useState(true);
  const [filter, setFilter]               = useState<FilterId>('all');
  const [meta, setMeta]                   = useState({ total: 0, totalPages: 1, page: 1, unreadCount: 0 });
  const [isMarkingAll, setIsMarkingAll]   = useState(false);
  const [isClearing, setIsClearing]       = useState(false);

  const loadNotifications = useCallback(async (page = 1) => {
    setIsLoading(true);
    try {
      const params: any = { page, limit: 25 };
      if (filter === 'unread') params.unread = true;
      const result = await notificationApi.getAll(params);
      let items: Notification[] = result.data || [];
      if (!['all', 'unread'].includes(filter)) {
        items = items.filter((n) => getConfig(n.type).category === filter);
      }
      setNotifications(items);
      if (result.meta) setMeta({ ...result.meta, page });
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      setIsLoading(false);
    }
  }, [filter]);

  useEffect(() => { loadNotifications(); }, [loadNotifications]);

  const handleMarkAsRead = async (id: string) => {
    try {
      await notificationApi.markAsRead(id);
      setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, isRead: true } : n));
      setMeta((m) => ({ ...m, unreadCount: Math.max(0, m.unreadCount - 1) }));
    } catch {}
  };

  const handleDelete = async (id: string) => {
    const n = notifications.find((x) => x.id === id);
    try {
      await notificationApi.delete(id);
      setNotifications((prev) => prev.filter((x) => x.id !== id));
      if (n && !n.isRead) setMeta((m) => ({ ...m, unreadCount: Math.max(0, m.unreadCount - 1) }));
    } catch {}
  };

  const handleMarkAllRead = async () => {
    setIsMarkingAll(true);
    try {
      await notificationApi.markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setMeta((m) => ({ ...m, unreadCount: 0 }));
    } catch {} finally { setIsMarkingAll(false); }
  };

  const handleClearRead = async () => {
    if (!window.confirm('Delete all read notifications? This cannot be undone.')) return;
    setIsClearing(true);
    try {
      await notificationApi.clearRead();
      setNotifications((prev) => prev.filter((n) => !n.isRead));
    } catch {} finally { setIsClearing(false); }
  };

  const grouped = notifications.reduce((acc, n) => {
    const date      = new Date(n.createdAt);
    const today     = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    let key: string;
    if (date.toDateString() === today.toDateString())          key = 'Today';
    else if (date.toDateString() === yesterday.toDateString()) key = 'Yesterday';
    else key = date.toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long' });
    if (!acc[key]) acc[key] = [];
    acc[key].push(n);
    return acc;
  }, {} as Record<string, Notification[]>);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Notifications</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {meta.unreadCount > 0
              ? `You have ${meta.unreadCount} unread notification${meta.unreadCount !== 1 ? 's' : ''}`
              : 'All caught up — no unread notifications'}
          </p>
        </div>
        <button onClick={() => loadNotifications()} disabled={isLoading}
          className="p-2 hover:bg-accent rounded-lg transition text-muted-foreground disabled:opacity-50" title="Refresh">
          <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {FILTER_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = filter === tab.id;
          return (
            <button key={tab.id} onClick={() => setFilter(tab.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all',
                isActive ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              )}>
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
              {tab.id === 'unread' && meta.unreadCount > 0 && (
                <span className={cn('px-1.5 py-0.5 text-[10px] font-bold rounded-full',
                  isActive ? 'bg-white/20 text-white' : 'bg-primary text-primary-foreground')}>
                  {meta.unreadCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Action bar */}
      {notifications.length > 0 && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-muted-foreground">
            {notifications.length} notification{notifications.length !== 1 ? 's' : ''}
          </p>
          <div className="flex items-center gap-2">
            {meta.unreadCount > 0 && (
              <button onClick={handleMarkAllRead} disabled={isMarkingAll}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-accent transition disabled:opacity-50 font-medium">
                {isMarkingAll ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCheck className="w-3 h-3" />}
                Mark all read
              </button>
            )}
            <button onClick={handleClearRead} disabled={isClearing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-accent transition disabled:opacity-50 text-muted-foreground hover:text-destructive font-medium">
              {isClearing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
              Clear read
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading notifications...</p>
        </div>
      ) : notifications.length === 0 ? (
        <EmptyState filter={filter} />
      ) : (
        <div className="space-y-6">
          {(Object.entries(grouped) as [string, Notification[]][]).map(([date, items]) => (
            <div key={date}>
              <div className="flex items-center gap-3 mb-3">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{date}</h3>
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">{items.length}</span>
              </div>
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                {items.map((n) => (
                  <NotificationRow key={n.id} notification={n} onRead={handleMarkAsRead} onDelete={handleDelete} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {meta.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button disabled={meta.page <= 1} onClick={() => loadNotifications(meta.page - 1)}
            className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-accent transition disabled:opacity-40">
            Previous
          </button>
          <span className="text-sm text-muted-foreground px-2">Page {meta.page} of {meta.totalPages}</span>
          <button disabled={meta.page >= meta.totalPages} onClick={() => loadNotifications(meta.page + 1)}
            className="px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-accent transition disabled:opacity-40">
            Next
          </button>
        </div>
      )}
    </div>
  );
}
