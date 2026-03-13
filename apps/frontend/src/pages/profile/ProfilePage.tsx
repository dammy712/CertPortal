import { useState, useEffect, useCallback } from 'react';
import {
  User, Lock, Monitor, Shield, Loader2, CheckCircle2,
  AlertCircle, Eye, EyeOff, Trash2, LogOut, Globe,
  Phone, Mail, Edit3, Save, X
} from 'lucide-react';
import { profileApi } from '@/api/profile.api';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────

interface Profile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  timezone: string;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  darkMode: boolean;
  kycStatus: string;
  createdAt: string;
  wallet: { balance: number; currency: string } | null;
  _count: { orders: number };
}

interface Session {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  device: string;
  createdAt: string;
  expiresAt: string;
}

// ─── Toast ────────────────────────────────────────────

function Toast({ message, type }: { message: string; type: 'success' | 'error' }) {
  return (
    <div className={cn(
      'fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all',
      type === 'success'
        ? 'bg-green-500 text-white'
        : 'bg-destructive text-destructive-foreground'
    )}>
      {type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
      {message}
    </div>
  );
}

// ─── Section Wrapper ──────────────────────────────────

function Section({ title, description, children }: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-border">
        <h3 className="font-semibold text-foreground">{title}</h3>
        {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

// ─── KYC Badge ────────────────────────────────────────

const KYC_CONFIG: Record<string, { label: string; color: string }> = {
  NOT_STARTED: { label: 'Not Started',    color: 'bg-muted text-muted-foreground' },
  PENDING:     { label: 'Pending Review', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' },
  UNDER_REVIEW:{ label: 'Under Review',   color: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' },
  APPROVED:    { label: 'Verified ✓',     color: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' },
  REJECTED:    { label: 'Action Required',color: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' },
};

// ─── Main Profile Page ────────────────────────────────

export default function ProfilePage() {
  const { logout } = useAuthStore();
  const { toggle, isDark } = useThemeStore();

  const [profile, setProfile]   = useState<Profile | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast]       = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'sessions'>('profile');

  // Profile edit state
  const [isEditing, setIsEditing]   = useState(false);
  const [isSaving, setIsSaving]     = useState(false);
  const [editForm, setEditForm]     = useState({ firstName: '', lastName: '', phone: '' });

  // Password state
  const [pwForm, setPwForm]         = useState({ current: '', newPw: '', confirm: '' });
  const [showPw, setShowPw]         = useState({ current: false, new: false, confirm: false });
  const [isChangingPw, setIsChangingPw] = useState(false);
  const [pwError, setPwError]       = useState('');

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadData = useCallback(async () => {
    try {
      const [profileRes, sessionsRes] = await Promise.all([
        profileApi.getProfile(),
        profileApi.getSessions(),
      ]);
      const p = profileRes.data;
      setProfile(p);
      setEditForm({ firstName: p.firstName, lastName: p.lastName, phone: p.phone || '' });
      setSessions(sessionsRes.data || []);
    } catch {
      showToast('Failed to load profile.', 'error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Save profile ──
  const handleSaveProfile = async () => {
    setIsSaving(true);
    try {
      await profileApi.updateProfile(editForm);
      setProfile((p) => p ? { ...p, ...editForm } : p);
      setIsEditing(false);
      showToast('Profile updated successfully.');
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Update failed.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // ── Change password ──
  const handleChangePassword = async () => {
    setPwError('');
    if (!pwForm.current || !pwForm.newPw) { setPwError('All fields are required.'); return; }
    if (pwForm.newPw !== pwForm.confirm) { setPwError('New passwords do not match.'); return; }
    if (pwForm.newPw.length < 8) { setPwError('New password must be at least 8 characters.'); return; }

    setIsChangingPw(true);
    try {
      await profileApi.changePassword(pwForm.current, pwForm.newPw);
      setPwForm({ current: '', newPw: '', confirm: '' });
      showToast('Password changed. Other sessions logged out.');
    } catch (err: any) {
      setPwError(err?.response?.data?.message || 'Failed to change password.');
    } finally {
      setIsChangingPw(false);
    }
  };

  // ── Revoke session ──
  const handleRevokeSession = async (id: string) => {
    try {
      await profileApi.revokeSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      showToast('Session revoked.');
    } catch {
      showToast('Failed to revoke session.', 'error');
    }
  };

  const handleRevokeAll = async () => {
    if (!window.confirm('Revoke all other sessions? You will stay logged in on this device.')) return;
    try {
      await profileApi.revokeAllSessions();
      await loadData();
      showToast('All other sessions revoked.');
    } catch {
      showToast('Failed to revoke sessions.', 'error');
    }
  };

  const tabs = [
    { id: 'profile',  label: 'Profile',  icon: User },
    { id: 'security', label: 'Security', icon: Lock },
    { id: 'sessions', label: 'Sessions', icon: Shield },
  ] as const;

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );

  const kycCfg = KYC_CONFIG[profile?.kycStatus || 'NOT_STARTED'];

  return (
    <div className="max-w-2xl space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} />}

      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center text-2xl font-bold text-primary-foreground flex-shrink-0">
          {profile?.firstName?.[0]}{profile?.lastName?.[0]}
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">{profile?.firstName} {profile?.lastName}</h1>
          <p className="text-sm text-muted-foreground">{profile?.email}</p>
          <div className="flex items-center gap-2 mt-1.5">
            <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', kycCfg.color)}>
              KYC: {kycCfg.label}
            </span>
            <span className="text-xs text-muted-foreground">
              {profile?._count.orders} order{profile?._count.orders !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted p-1 rounded-xl">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition',
              activeTab === id
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Profile Tab ── */}
      {activeTab === 'profile' && (
        <div className="space-y-4">
          <Section title="Personal Information" description="Update your name and contact details">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {['firstName', 'lastName'].map((field) => (
                  <div key={field}>
                    <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">
                      {field === 'firstName' ? 'First Name' : 'Last Name'}
                    </label>
                    {isEditing ? (
                      <input
                        value={editForm[field as keyof typeof editForm]}
                        onChange={(e) => setEditForm((f) => ({ ...f, [field]: e.target.value }))}
                        className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring transition"
                      />
                    ) : (
                      <p className="text-sm text-foreground py-2.5">{editForm[field as keyof typeof editForm] || '—'}</p>
                    )}
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">Phone</label>
                {isEditing ? (
                  <input
                    value={editForm.phone}
                    onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="+234 800 000 0000"
                    className="w-full px-3 py-2.5 border border-input rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring transition"
                  />
                ) : (
                  <p className="text-sm text-foreground py-2.5">{editForm.phone || '—'}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">Email</label>
                <div className="flex items-center gap-2">
                  <p className="text-sm text-foreground py-2.5">{profile?.email}</p>
                  {profile?.emailVerified
                    ? <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 rounded-full">Verified</span>
                    : <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300 rounded-full">Unverified</span>
                  }
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                {isEditing ? (
                  <>
                    <button
                      onClick={handleSaveProfile}
                      disabled={isSaving}
                      className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition"
                    >
                      {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      {isSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                    <button
                      onClick={() => { setIsEditing(false); setEditForm({ firstName: profile?.firstName || '', lastName: profile?.lastName || '', phone: profile?.phone || '' }); }}
                      className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm hover:bg-accent transition"
                    >
                      <X className="w-4 h-4" /> Cancel
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm hover:bg-accent transition"
                  >
                    <Edit3 className="w-4 h-4" /> Edit Profile
                  </button>
                )}
              </div>
            </div>
          </Section>

          <Section title="Appearance" description="Customize your interface">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Dark Mode</p>
                <p className="text-xs text-muted-foreground mt-0.5">Switch between light and dark theme</p>
              </div>
              <button
                onClick={toggle}
                className={cn(
                  'relative w-12 h-6 rounded-full transition-colors',
                  isDark ? 'bg-primary' : 'bg-muted-foreground/30'
                )}
              >
                <span className={cn(
                  'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform',
                  isDark && 'translate-x-6'
                )} />
              </button>
            </div>
          </Section>

          <Section title="Account Info">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Member Since</p>
                <p className="text-foreground font-medium">
                  {profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString('en-NG', { month: 'long', year: 'numeric' }) : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">2FA Status</p>
                <p className={cn('font-medium', profile?.twoFactorEnabled ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground')}>
                  {profile?.twoFactorEnabled ? 'Enabled ✓' : 'Disabled'}
                </p>
              </div>
            </div>
          </Section>
        </div>
      )}

      {/* ── Security Tab ── */}
      {activeTab === 'security' && (
        <div className="space-y-4">
          <Section title="Change Password" description="Use a strong password you don't use elsewhere">
            <div className="space-y-4">
              {[
                { key: 'current', label: 'Current Password', showKey: 'current' as const },
                { key: 'newPw',   label: 'New Password',     showKey: 'new' as const },
                { key: 'confirm', label: 'Confirm New Password', showKey: 'confirm' as const },
              ].map(({ key, label, showKey }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">{label}</label>
                  <div className="relative">
                    <input
                      type={showPw[showKey] ? 'text' : 'password'}
                      value={pwForm[key as keyof typeof pwForm]}
                      onChange={(e) => setPwForm((f) => ({ ...f, [key]: e.target.value }))}
                      className="w-full px-3 py-2.5 pr-10 border border-input rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((s) => ({ ...s, [showKey]: !s[showKey] }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPw[showKey] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              ))}

              {pwError && (
                <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" /> {pwError}
                </div>
              )}

              <button
                onClick={handleChangePassword}
                disabled={isChangingPw}
                className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition"
              >
                {isChangingPw ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                {isChangingPw ? 'Changing...' : 'Change Password'}
              </button>
            </div>
          </Section>

          <Section title="Two-Factor Authentication" description="Add an extra layer of security">
            <div className="flex items-center justify-between">
              <div>
                <p className={cn('text-sm font-medium', profile?.twoFactorEnabled ? 'text-green-600 dark:text-green-400' : 'text-foreground')}>
                  {profile?.twoFactorEnabled ? '2FA is enabled ✓' : '2FA is not enabled'}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {profile?.twoFactorEnabled
                    ? 'Your account is protected with an authenticator app.'
                    : 'Protect your account with Google Authenticator or similar.'}
                </p>
              </div>
              <a
                href="/settings/2fa"
                className="px-3 py-2 border border-border rounded-lg text-sm hover:bg-accent transition"
              >
                {profile?.twoFactorEnabled ? 'Manage' : 'Enable'}
              </a>
            </div>
          </Section>

          <Section title="Danger Zone">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Sign out everywhere</p>
                <p className="text-xs text-muted-foreground mt-0.5">Sign out from all devices and browsers</p>
              </div>
              <button
                onClick={() => { logout(); }}
                className="flex items-center gap-2 px-3 py-2 border border-destructive/30 text-destructive rounded-lg text-sm hover:bg-destructive/10 transition"
              >
                <LogOut className="w-4 h-4" /> Sign Out
              </button>
            </div>
          </Section>
        </div>
      )}

      {/* ── Sessions Tab ── */}
      {activeTab === 'sessions' && (
        <div className="space-y-4">
          <Section
            title="Active Sessions"
            description="Devices currently signed into your account"
          >
            <div className="space-y-3">
              {sessions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No active sessions found.</p>
              ) : (
                sessions.map((session) => (
                  <div key={session.id} className="flex items-center justify-between gap-3 p-3 bg-muted/50 rounded-xl">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{session.device}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {session.ipAddress || 'Unknown IP'} · Started {new Date(session.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRevokeSession(session.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-destructive/30 text-destructive rounded-lg hover:bg-destructive/10 transition flex-shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Revoke
                    </button>
                  </div>
                ))
              )}
            </div>

            {sessions.length > 1 && (
              <button
                onClick={handleRevokeAll}
                className="mt-4 w-full py-2.5 border border-destructive/30 text-destructive rounded-lg text-sm font-medium hover:bg-destructive/10 transition"
              >
                Revoke All Other Sessions
              </button>
            )}
          </Section>
        </div>
      )}
    </div>
  );
}
