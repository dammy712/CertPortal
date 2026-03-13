import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  User, Lock, Monitor, Shield, Loader2, CheckCircle2, KeyRound,
  AlertCircle, Eye, EyeOff, LogOut, Phone, Mail,
  Save, Globe, Sun, Moon, Smartphone, Laptop,
  MapPin, Clock, Trash2, ShieldAlert, X
} from 'lucide-react';
import { profileApi } from '@/api/profile.api';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import { cn } from '@/lib/utils';

// ─── Schemas ─── (email added below passwordSchema)
const emailSchema = z.object({
  newEmail:        z.string().email('Invalid email address'),
  currentPassword: z.string().min(1, 'Password is required'),
});
type EmailForm = z.infer<typeof emailSchema>;

// ─── Types ────────────────────────────────────────────

interface Profile {
  id: string; email: string; firstName: string; lastName: string;
  phone: string | null; timezone: string; emailVerified: boolean;
  twoFactorEnabled: boolean; role: string; createdAt: string; kycStatus: string;
}

interface Session {
  id: string; ipAddress: string | null; userAgent: string | null;
  device: string; createdAt: string; expiresAt: string;
}

// ─── Schemas ──────────────────────────────────────────

const profileSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName:  z.string().min(1, 'Last name is required'),
  phone:     z.string().optional(),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string()
    .min(8, 'Must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain uppercase')
    .regex(/[a-z]/, 'Must contain lowercase')
    .regex(/[0-9]/, 'Must contain a number')
    .regex(/[^A-Za-z0-9]/, 'Must contain a special character'),
  confirmPassword: z.string(),
}).refine((d) => d.newPassword === d.confirmPassword, {
  message: "Passwords don't match", path: ['confirmPassword'],
});

type ProfileForm  = z.infer<typeof profileSchema>;
type PasswordForm = z.infer<typeof passwordSchema>;

const TIMEZONES = [
  'Africa/Lagos','Africa/Nairobi','Africa/Johannesburg','Africa/Cairo',
  'Europe/London','Europe/Paris','Europe/Berlin',
  'America/New_York','America/Chicago','America/Denver','America/Los_Angeles',
  'Asia/Dubai','Asia/Kolkata','Asia/Singapore','Asia/Tokyo',
  'Australia/Sydney','Pacific/Auckland',
];

const TABS = [
  { id: 'profile',     label: 'Profile',     icon: User },
  { id: 'security',    label: 'Security',    icon: Lock },
  { id: 'preferences', label: 'Preferences', icon: Monitor },
  { id: 'sessions',    label: 'Sessions',    icon: Shield },
] as const;
type TabId = typeof TABS[number]['id'];

const KYC_CONFIG: Record<string, { label: string; color: string }> = {
  NOT_STARTED:  { label: 'Not Started',     color: 'bg-muted text-muted-foreground' },
  PENDING:      { label: 'Pending Review',  color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' },
  UNDER_REVIEW: { label: 'Under Review',    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' },
  APPROVED:     { label: 'Verified ✓',      color: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' },
  REJECTED:     { label: 'Action Required', color: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' },
};

// ─── Stable sub-components (defined outside to prevent remount) ──

function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className={cn('fixed bottom-6 right-6 z-[9999] flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium',
      type === 'success' ? 'bg-green-500 text-white' : 'bg-destructive text-destructive-foreground')}>
      {type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
      {message}
      <button onClick={onClose} className="ml-1 opacity-70 hover:opacity-100"><X className="w-3.5 h-3.5" /></button>
    </div>
  );
}

function PasswordStrength({ value }: { value: string }) {
  const checks = [
    { ok: value.length >= 8,           label: 'At least 8 characters' },
    { ok: /[A-Z]/.test(value),         label: 'One uppercase letter' },
    { ok: /[0-9]/.test(value),         label: 'One number' },
    { ok: /[^A-Za-z0-9]/.test(value),  label: 'One special character' },
  ];
  return (
    <div className="p-3 bg-muted rounded-lg">
      <p className="text-xs font-medium text-muted-foreground mb-2">Password requirements:</p>
      {checks.map(({ ok, label }) => (
        <div key={label} className="flex items-center gap-2 text-xs mt-1">
          <div className={cn('w-3 h-3 rounded-full', ok ? 'bg-green-500' : 'bg-muted-foreground/30')} />
          <span className={ok ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
        </div>
      ))}
    </div>
  );
}

function DeviceName(ua: string | null): string {
  if (!ua) return 'Unknown Device';
  const u = ua.toLowerCase();
  if (u.includes('chrome'))  return 'Chrome';
  if (u.includes('firefox')) return 'Firefox';
  if (u.includes('safari'))  return 'Safari';
  if (u.includes('edge'))    return 'Edge';
  return 'Browser';
}

function DeviceIcon({ ua }: { ua: string | null }) {
  const u = (ua || '').toLowerCase();
  if (u.includes('mobile') || u.includes('android') || u.includes('iphone'))
    return <Smartphone className="w-4 h-4" />;
  return <Laptop className="w-4 h-4" />;
}

// ─── Main Page ────────────────────────────────────────

// ─── 2FA Card — stable link to dedicated setup page ──
function TwoFactorCard() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-border">
        <h3 className="font-semibold text-foreground">Two-Factor Authentication</h3>
        <p className="text-sm text-muted-foreground mt-0.5">Add an extra layer of security to your account</p>
      </div>
      <div className="p-6">
        <div className={cn(
          'flex items-start gap-4 p-4 rounded-xl border mb-4',
          user?.twoFactorEnabled
            ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800'
            : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800'
        )}>
          <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
            user?.twoFactorEnabled ? 'bg-green-100 dark:bg-green-900' : 'bg-amber-100 dark:bg-amber-900')}>
            {user?.twoFactorEnabled
              ? <ShieldCheck className="w-5 h-5 text-green-600 dark:text-green-400" />
              : <ShieldOff className="w-5 h-5 text-amber-600 dark:text-amber-400" />}
          </div>
          <div className="flex-1">
            <p className={cn('text-sm font-semibold',
              user?.twoFactorEnabled ? 'text-green-800 dark:text-green-200' : 'text-amber-800 dark:text-amber-200')}>
              {user?.twoFactorEnabled ? '2FA is Enabled' : '2FA is Not Enabled'}
            </p>
            <p className={cn('text-xs mt-0.5',
              user?.twoFactorEnabled ? 'text-green-700 dark:text-green-300' : 'text-amber-700 dark:text-amber-300')}>
              {user?.twoFactorEnabled
                ? 'Your account is protected with an authenticator app.'
                : 'Protect your account with Google Authenticator or Authy.'}
            </p>
          </div>
        </div>
        <button type="button" onClick={() => navigate('/settings/2fa')}
          className={cn('flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition',
            user?.twoFactorEnabled
              ? 'border border-destructive text-destructive hover:bg-destructive/10'
              : 'bg-primary text-primary-foreground hover:bg-primary/90')}>
          {user?.twoFactorEnabled
            ? <><ShieldOff className="w-4 h-4" /> Manage 2FA</>
            : <><KeyRound className="w-4 h-4" /> Enable 2FA</>}
        </button>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { user, logout } = useAuthStore();
  const { isDark, toggle } = useThemeStore();

  const [activeTab, setActiveTab]   = useState<TabId>('profile');
  const [profile, setProfile]       = useState<Profile | null>(null);
  const [sessions, setSessions]     = useState<Session[]>([]);
  const [isLoading, setIsLoading]   = useState(true);
  const [toast, setToast]           = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [timezone, setTimezone]     = useState('Africa/Lagos');
  const [isSavingTz, setIsSavingTz] = useState(false);
  const [isRevokingAll, setIsRevokingAll] = useState(false);
  const [newPwValue, setNewPwValue] = useState('');

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
  }, []);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [profileRes, sessionsRes] = await Promise.all([
        profileApi.getProfile(),
        profileApi.getSessions(),
      ]);
      const p = profileRes.data || profileRes;
      setProfile(p);
      setSessions(sessionsRes.data || sessionsRes || []);
      setTimezone(p?.timezone || 'Africa/Lagos');
    } catch {
      showToast('Failed to load account data', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => { loadData(); }, [loadData]);

  // Profile form
  const profileForm = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    values: profile ? { firstName: profile.firstName, lastName: profile.lastName, phone: profile.phone || '' } : undefined,
  });

  const onSaveProfile = async (data: ProfileForm) => {
    try {
      await profileApi.updateProfile(data);
      setProfile((p) => p ? { ...p, ...data } : p);
      showToast('Profile updated successfully');
    } catch (err: any) {
      showToast(err?.response?.data?.message || 'Failed to update profile', 'error');
    }
  };

  // Password form
  const pwForm = useForm<PasswordForm>({ resolver: zodResolver(passwordSchema) });

  const onChangePassword = async (data: PasswordForm) => {
    try {
      await profileApi.changePassword(data.currentPassword, data.newPassword);
      pwForm.reset();
      setNewPwValue('');
      showToast('Password changed successfully');
    } catch (err: any) {
      pwForm.setError('currentPassword', { message: err?.response?.data?.message || 'Failed to change password' });
    }
  };

  const [showPw, setShowPw] = useState({ current: false, new: false, confirm: false });

  // Email form
  const emailForm = useForm<EmailForm>({ resolver: zodResolver(emailSchema) });
  const [showEmailPw, setShowEmailPw] = useState(false);

  const onChangeEmail = async (data: EmailForm) => {
    try {
      await profileApi.changeEmail(data.newEmail, data.currentPassword);
      setProfile((p) => p ? { ...p, email: data.newEmail } : p);
      emailForm.reset();
      showToast('Email updated successfully. Please log in again.');
    } catch (err: any) {
      emailForm.setError('currentPassword', { message: err?.response?.data?.message || 'Failed to update email' });
    }
  };

  const handleSaveTimezone = async () => {
    setIsSavingTz(true);
    try {
      await profileApi.updatePreferences({ timezone });
      setProfile((p) => p ? { ...p, timezone } : p);
      showToast('Timezone updated');
    } catch { showToast('Failed to update timezone', 'error'); }
    finally { setIsSavingTz(false); }
  };

  const handleRevokeSession = async (id: string) => {
    try {
      await profileApi.revokeSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      showToast('Session revoked');
    } catch { showToast('Failed to revoke session', 'error'); }
  };

  const handleRevokeAll = async () => {
    if (!window.confirm('Sign out from all other devices?')) return;
    setIsRevokingAll(true);
    try {
      await profileApi.revokeAllSessions();
      setSessions([]);
      showToast('All other sessions revoked');
    } catch { showToast('Failed to revoke sessions', 'error'); }
    finally { setIsRevokingAll(false); }
  };

  const kycCfg = KYC_CONFIG[profile?.kycStatus || 'NOT_STARTED'];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <span className="text-xl font-bold text-primary">{profile?.firstName?.[0]}{profile?.lastName?.[0]}</span>
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-foreground">{profile?.firstName} {profile?.lastName}</h1>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <p className="text-sm text-muted-foreground">{profile?.email}</p>
            <span className={cn('px-2 py-0.5 text-xs font-medium rounded-full', kycCfg.color)}>{kycCfg.label}</span>
            {profile?.emailVerified && (
              <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                <CheckCircle2 className="w-3 h-3" /> Verified
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted p-1 rounded-xl">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
              className={cn('flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-all',
                activeTab === tab.id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ─── Profile Tab ──────────────────────────────── */}
      {activeTab === 'profile' && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h3 className="font-semibold text-foreground">Personal Information</h3>
            <p className="text-sm text-muted-foreground mt-0.5">Update your name and contact details</p>
          </div>
          <div className="p-6">
            <form onSubmit={profileForm.handleSubmit(onSaveProfile)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">First Name</label>
                  <input {...profileForm.register('firstName')}
                    className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring transition" />
                  {profileForm.formState.errors.firstName && <p className="mt-1 text-xs text-destructive">{profileForm.formState.errors.firstName.message}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1.5">Last Name</label>
                  <input {...profileForm.register('lastName')}
                    className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring transition" />
                  {profileForm.formState.errors.lastName && <p className="mt-1 text-xs text-destructive">{profileForm.formState.errors.lastName.message}</p>}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input value={profile?.email || ''} disabled
                    className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-input bg-muted text-muted-foreground text-sm cursor-not-allowed" />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Email cannot be changed</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Phone Number</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input {...profileForm.register('phone')} placeholder="+234 000 000 0000"
                    className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring transition" />
                </div>
              </div>
              <div className="flex items-center justify-between pt-2">
                <p className="text-xs text-muted-foreground">
                  Member since {profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString('en-NG', { month: 'long', year: 'numeric' }) : '—'}
                </p>
                <button type="submit" disabled={profileForm.formState.isSubmitting}
                  className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition">
                  {profileForm.formState.isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Security Tab ─────────────────────────────── */}
      {activeTab === 'security' && (
        <div className="space-y-5">
          {/* Change Password */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-border">
              <h3 className="font-semibold text-foreground">Change Password</h3>
              <p className="text-sm text-muted-foreground mt-0.5">Use a strong, unique password</p>
            </div>
            <div className="p-6">
              <form onSubmit={pwForm.handleSubmit(onChangePassword)} className="space-y-4">
                {(['currentPassword', 'newPassword', 'confirmPassword'] as const).map((field) => {
                  const labels = { currentPassword: 'Current Password', newPassword: 'New Password', confirmPassword: 'Confirm New Password' };
                  const key = field === 'currentPassword' ? 'current' : field === 'newPassword' ? 'new' : 'confirm';
                  return (
                    <div key={field}>
                      <label className="block text-sm font-medium text-foreground mb-1.5">{labels[field]}</label>
                      <div className="relative">
                        <input {...pwForm.register(field)}
                          type={showPw[key as keyof typeof showPw] ? 'text' : 'password'}
                          placeholder="••••••••"
                          onChange={field === 'newPassword' ? (e) => { pwForm.register(field).onChange(e); setNewPwValue(e.target.value); } : pwForm.register(field).onChange}
                          className="w-full px-3 py-2.5 pr-10 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring transition" />
                        <button type="button"
                          onClick={() => setShowPw((p) => ({ ...p, [key]: !p[key as keyof typeof showPw] }))}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                          {showPw[key as keyof typeof showPw] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      {pwForm.formState.errors[field] && <p className="mt-1 text-xs text-destructive">{pwForm.formState.errors[field]?.message}</p>}
                    </div>
                  );
                })}
                <PasswordStrength value={newPwValue} />
                <button type="submit" disabled={pwForm.formState.isSubmitting}
                  className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition">
                  {pwForm.formState.isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                  Update Password
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ─── Change Email ──────────────────────────────── */}
      {activeTab === 'security' && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h3 className="font-semibold text-foreground">Change Email Address</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              Current: <strong>{profile?.email}</strong>
            </p>
          </div>
          <div className="p-6">
            <form onSubmit={emailForm.handleSubmit(onChangeEmail)} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">New Email Address</label>
                <input {...emailForm.register('newEmail')}
                  type="email"
                  placeholder="newemail@example.com"
                  className="w-full px-3 py-2.5 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring transition" />
                {emailForm.formState.errors.newEmail && (
                  <p className="mt-1 text-xs text-destructive">{emailForm.formState.errors.newEmail.message}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Confirm with Current Password</label>
                <div className="relative">
                  <input {...emailForm.register('currentPassword')}
                    type={showEmailPw ? 'text' : 'password'}
                    placeholder="••••••••"
                    className="w-full px-3 py-2.5 pr-10 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring transition" />
                  <button type="button" onClick={() => setShowEmailPw(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {showEmailPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {emailForm.formState.errors.currentPassword && (
                  <p className="mt-1 text-xs text-destructive">{emailForm.formState.errors.currentPassword.message}</p>
                )}
              </div>
              <button type="submit" disabled={emailForm.formState.isSubmitting}
                className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition">
                {emailForm.formState.isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                Update Email
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ─── 2FA — Links to dedicated page to avoid remount issues ── */}
      {activeTab === 'security' && (
        <TwoFactorCard />
      )}

      {/* ─── Preferences Tab ──────────────────────────── */}
      {activeTab === 'preferences' && (
        <div className="space-y-5">
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-border">
              <h3 className="font-semibold text-foreground">Appearance</h3>
              <p className="text-sm text-muted-foreground mt-0.5">Choose your preferred display mode</p>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 gap-3">
                {[{ id: 'light', label: 'Light Mode', icon: Sun, desc: 'Clean and bright' },
                  { id: 'dark',  label: 'Dark Mode',  icon: Moon, desc: 'Easy on the eyes' }].map(({ id, label, icon: Icon, desc }) => {
                  const isActive = id === 'dark' ? isDark : !isDark;
                  return (
                    <button key={id} type="button" onClick={() => { if ((id === 'dark') !== isDark) toggle(); }}
                      className={cn('flex items-center gap-3 p-4 rounded-xl border text-left transition-all',
                        isActive ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:bg-accent')}>
                      <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center',
                        isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{label}</p>
                        <p className="text-xs text-muted-foreground">{desc}</p>
                      </div>
                      {isActive && <CheckCircle2 className="w-4 h-4 text-primary ml-auto" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-border">
              <h3 className="font-semibold text-foreground">Timezone</h3>
              <p className="text-sm text-muted-foreground mt-0.5">Used for certificate expiry alerts and timestamps</p>
            </div>
            <div className="p-6">
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <select value={timezone} onChange={(e) => setTimezone(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring transition appearance-none">
                    {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz.replace('_', ' ')}</option>)}
                  </select>
                </div>
                <button type="button" onClick={handleSaveTimezone} disabled={isSavingTz}
                  className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition">
                  {isSavingTz ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save
                </button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Current: {new Date().toLocaleTimeString('en-NG', { timeZone: timezone, hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}
              </p>
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-border">
              <h3 className="font-semibold text-foreground">Account Information</h3>
            </div>
            <div className="divide-y divide-border">
              {[
                { label: 'Account ID',   value: profile?.id?.slice(0, 8).toUpperCase() || '—' },
                { label: 'Role',         value: profile?.role || '—' },
                { label: 'Email Status', value: profile?.emailVerified ? 'Verified' : 'Unverified' },
                { label: 'KYC Status',   value: kycCfg.label },
                { label: 'Member Since', value: profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' }) : '—' },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center justify-between px-6 py-3">
                  <span className="text-sm text-muted-foreground">{label}</span>
                  <span className="text-sm font-medium text-foreground">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── Sessions Tab ─────────────────────────────── */}
      {activeTab === 'sessions' && (
        <div className="space-y-5">
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-foreground">Active Sessions</h3>
                <p className="text-sm text-muted-foreground mt-0.5">{sessions.length} active session{sessions.length !== 1 ? 's' : ''}</p>
              </div>
              {sessions.length > 1 && (
                <button type="button" onClick={handleRevokeAll} disabled={isRevokingAll}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-destructive border border-destructive/30 rounded-lg hover:bg-destructive/5 transition disabled:opacity-50">
                  {isRevokingAll ? <Loader2 className="w-3 h-3 animate-spin" /> : <LogOut className="w-3 h-3" />}
                  Sign out all
                </button>
              )}
            </div>
            {sessions.length === 0 ? (
              <div className="p-10 text-center">
                <Shield className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No active sessions found</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {sessions.map((session, idx) => (
                  <div key={session.id} className="flex items-center gap-4 px-6 py-4">
                    <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center flex-shrink-0">
                      <DeviceIcon ua={session.userAgent} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground">{DeviceName(session.userAgent)}</p>
                        {idx === 0 && <span className="px-1.5 py-0.5 text-[10px] font-medium bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 rounded-full">Current</span>}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        {session.ipAddress && <span className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" />{session.ipAddress}</span>}
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(session.createdAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                    {idx !== 0 && (
                      <button type="button" onClick={() => handleRevokeSession(session.id)}
                        className="p-1.5 rounded-lg hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition" title="Revoke session">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-card border border-destructive/20 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-destructive/20 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-destructive" />
              <h3 className="font-semibold text-destructive">Danger Zone</h3>
            </div>
            <div className="p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-foreground">Sign Out Everywhere</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Immediately sign out from all devices including this one</p>
                </div>
                <button type="button"
                  onClick={() => { if (window.confirm('Sign out from all devices including this one?')) { profileApi.revokeAllSessions().finally(() => logout()); } }}
                  className="flex items-center gap-2 px-4 py-2 bg-destructive text-destructive-foreground rounded-lg text-sm font-medium hover:bg-destructive/90 transition flex-shrink-0">
                  <LogOut className="w-4 h-4" /> Sign Out All
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
