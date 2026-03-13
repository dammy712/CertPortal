import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldCheck, ShieldOff, Loader2, Copy, CheckCircle2,
  AlertTriangle, KeyRound, ArrowLeft
} from 'lucide-react';
import { authApi } from '@/api/auth.api';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';

type Step = 'idle' | 'setup' | 'backup' | 'disable';

export default function TwoFactorSetupPage() {
  const { user, updateUser } = useAuthStore();
  const navigate = useNavigate();

  const [step, setStep]               = useState<Step>('idle');
  const [qrCode, setQrCode]           = useState('');
  const [secret, setSecret]           = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [totpCode, setTotpCode]       = useState('');
  const [isLoading, setIsLoading]     = useState(false);
  const [error, setError]             = useState('');
  const [copied, setCopied]           = useState(false);

  const reset = () => { setStep('idle'); setTotpCode(''); setError(''); setQrCode(''); setSecret(''); };

  const startSetup = async () => {
    setIsLoading(true); setError('');
    try {
      const res = await authApi.setup2FA();
      const d = res?.data || res;
      if (!d?.qrCode) throw new Error('No QR code returned');
      setQrCode(d.qrCode);
      setSecret(d.secret);
      setStep('setup');
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to start 2FA setup.');
    } finally { setIsLoading(false); }
  };

  const verifyAndEnable = async () => {
    if (totpCode.length !== 6) { setError('Enter the 6-digit code from your app.'); return; }
    setIsLoading(true); setError('');
    try {
      const res = await authApi.verify2FA(totpCode);
      const d = res?.data || res;
      setBackupCodes(d?.backupCodes || []);
      updateUser({ twoFactorEnabled: true });
      setStep('backup');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Invalid code. Please try again.');
    } finally { setIsLoading(false); }
  };

  const disableConfirm = async () => {
    if (totpCode.length !== 6) { setError('Enter the 6-digit code from your app.'); return; }
    setIsLoading(true); setError('');
    try {
      await authApi.disable2FA(totpCode);
      updateUser({ twoFactorEnabled: false });
      reset();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Invalid code. Please try again.');
    } finally { setIsLoading(false); }
  };

  const copySecret = async () => {
    try { await navigator.clipboard.writeText(secret); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => navigate('/settings')}
          className="p-2 rounded-lg hover:bg-accent transition text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-foreground">Two-Factor Authentication</h1>
          <p className="text-sm text-muted-foreground">Secure your account with an authenticator app</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="p-6">

          {/* ── IDLE ── */}
          {step === 'idle' && (
            <div className="space-y-4">
              <div className={cn('flex items-start gap-4 p-4 rounded-xl border',
                user?.twoFactorEnabled
                  ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800'
                  : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800')}>
                <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
                  user?.twoFactorEnabled ? 'bg-green-100 dark:bg-green-900' : 'bg-amber-100 dark:bg-amber-900')}>
                  {user?.twoFactorEnabled
                    ? <ShieldCheck className="w-5 h-5 text-green-600 dark:text-green-400" />
                    : <ShieldOff className="w-5 h-5 text-amber-600 dark:text-amber-400" />}
                </div>
                <div>
                  <p className={cn('text-sm font-semibold',
                    user?.twoFactorEnabled ? 'text-green-800 dark:text-green-200' : 'text-amber-800 dark:text-amber-200')}>
                    {user?.twoFactorEnabled ? '2FA is Enabled' : '2FA is Not Enabled'}
                  </p>
                  <p className={cn('text-xs mt-0.5',
                    user?.twoFactorEnabled ? 'text-green-700 dark:text-green-300' : 'text-amber-700 dark:text-amber-300')}>
                    {user?.twoFactorEnabled
                      ? 'Your account is protected. You need your authenticator app to sign in.'
                      : 'Add an extra layer of security using Google Authenticator or Authy.'}
                  </p>
                </div>
              </div>

              {error && <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive">{error}</div>}

              {user?.twoFactorEnabled ? (
                <button type="button" onClick={() => { setStep('disable'); setError(''); setTotpCode(''); }}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-destructive text-destructive rounded-lg hover:bg-destructive/10 transition">
                  <ShieldOff className="w-4 h-4" /> Disable 2FA
                </button>
              ) : (
                <button type="button" onClick={startSetup} disabled={isLoading}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-60 transition">
                  {isLoading
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Setting up...</>
                    : <><KeyRound className="w-4 h-4" /> Enable 2FA</>}
                </button>
              )}
            </div>
          )}

          {/* ── SETUP ── */}
          {step === 'setup' && (
            <div className="space-y-5">
              <div>
                <h3 className="font-semibold text-foreground">Scan with your authenticator app</h3>
                <p className="text-sm text-muted-foreground mt-1">Use Google Authenticator, Authy, or any TOTP app.</p>
              </div>

              <div className="flex gap-3 text-xs text-muted-foreground flex-wrap">
                {['Install authenticator app', 'Scan QR code', 'Enter 6-digit code'].map((s, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-[10px] flex-shrink-0">{i + 1}</span>
                    {s}
                  </div>
                ))}
              </div>

              {qrCode ? (
                <div className="flex justify-center">
                  <div className="p-3 bg-white rounded-xl border border-border shadow-sm">
                    <img src={qrCode} alt="2FA QR Code" className="w-48 h-48" />
                  </div>
                </div>
              ) : (
                <div className="flex justify-center py-8"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
              )}

              <div>
                <p className="text-xs text-muted-foreground mb-1.5">Can't scan? Enter this key manually:</p>
                <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                  <code className="flex-1 text-xs font-mono break-all text-foreground">{secret}</code>
                  <button type="button" onClick={copySecret}
                    className="flex-shrink-0 p-1.5 rounded hover:bg-accent transition text-muted-foreground hover:text-foreground">
                    {copied ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Enter the 6-digit code from your app</label>
                <input type="text" inputMode="numeric" value={totpCode}
                  onChange={(e) => { setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }}
                  onKeyDown={(e) => e.key === 'Enter' && verifyAndEnable()}
                  placeholder="000000" maxLength={6} autoFocus autoComplete="one-time-code"
                  className="w-full px-3 py-3 rounded-lg border border-input bg-background text-foreground text-center tracking-[0.5em] font-mono text-xl focus:outline-none focus:ring-2 focus:ring-ring transition" />
                {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
              </div>

              <div className="flex gap-3">
                <button type="button" onClick={reset} className="flex-1 py-2.5 text-sm border border-border rounded-lg hover:bg-accent transition">Cancel</button>
                <button type="button" onClick={verifyAndEnable} disabled={isLoading || totpCode.length !== 6}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-60 transition">
                  {isLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Verifying...</> : <><ShieldCheck className="w-4 h-4" /> Verify & Enable</>}
                </button>
              </div>
            </div>
          )}

          {/* ── BACKUP CODES ── */}
          {step === 'backup' && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-xl">
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-green-800 dark:text-green-200">2FA Enabled Successfully!</p>
                  <p className="text-xs text-green-700 dark:text-green-300 mt-0.5">Your account is now protected with two-factor authentication.</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  Save these backup codes somewhere safe. Each can only be used once if you lose access to your authenticator app.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {backupCodes.map((code, i) => (
                  <div key={i} className="p-2.5 bg-muted rounded-lg font-mono text-sm text-center tracking-widest border border-border">{code}</div>
                ))}
              </div>

              <button type="button" onClick={() => navigate('/settings')}
                className="w-full py-2.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition">
                Done — Back to Settings
              </button>
            </div>
          )}

          {/* ── DISABLE ── */}
          {step === 'disable' && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
                <p className="text-sm text-destructive">Disabling 2FA will make your account less secure. Enter your authenticator code to confirm.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Authenticator Code</label>
                <input type="text" inputMode="numeric" value={totpCode}
                  onChange={(e) => { setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }}
                  onKeyDown={(e) => e.key === 'Enter' && disableConfirm()}
                  placeholder="000000" maxLength={6} autoFocus autoComplete="one-time-code"
                  className="w-full px-3 py-3 rounded-lg border border-input bg-background text-foreground text-center tracking-[0.5em] font-mono text-xl focus:outline-none focus:ring-2 focus:ring-ring transition" />
                {error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
              </div>

              <div className="flex gap-3">
                <button type="button" onClick={reset} className="flex-1 py-2.5 text-sm border border-border rounded-lg hover:bg-accent transition">Cancel</button>
                <button type="button" onClick={disableConfirm} disabled={isLoading || totpCode.length !== 6}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 disabled:opacity-60 transition">
                  {isLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Disabling...</> : <><ShieldOff className="w-4 h-4" /> Disable 2FA</>}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
