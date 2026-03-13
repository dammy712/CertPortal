import { useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Eye, EyeOff, CheckCircle2, ShieldCheck, XCircle } from 'lucide-react';
import { authApi } from '@/api/auth.api';

const schema = z.object({
  password: z
    .string()
    .min(8, 'Must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain an uppercase letter')
    .regex(/[a-z]/, 'Must contain a lowercase letter')
    .regex(/[0-9]/, 'Must contain a number')
    .regex(/[^A-Za-z0-9]/, 'Must contain a special character'),
  confirmPassword: z.string(),
}).refine((d: { password: string; confirmPassword: string }) => d.password === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

type FormData = z.infer<typeof schema>;

export default function ResetPasswordPage() {
  const [searchParams]      = useSearchParams();
  const navigate             = useNavigate();
  const token                = searchParams.get('token') || '';

  const [showPass, setShowPass]       = useState<boolean>(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading]     = useState(false);
  const [success, setSuccess]         = useState(false);
  const [error, setError]             = useState('');

  const { register, handleSubmit, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const password = watch('password', '');

  // Redirect if no token
  useEffect(() => {
    if (!token) navigate('/forgot-password', { replace: true });
  }, [token, navigate]);

  const onSubmit = async (data: FormData) => {
    setIsLoading(true);
    setError('');
    try {
      await authApi.resetPassword(token, data.password);
      setSuccess(true);
      setTimeout(() => navigate('/login'), 3000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'This reset link is invalid or has expired.');
    } finally {
      setIsLoading(false);
    }
  };

  // Password strength indicator
  const checks = [
    { label: 'At least 8 characters',     pass: password.length >= 8 },
    { label: 'Uppercase letter',           pass: /[A-Z]/.test(password) },
    { label: 'Lowercase letter',           pass: /[a-z]/.test(password) },
    { label: 'Number',                     pass: /[0-9]/.test(password) },
    { label: 'Special character',          pass: /[^A-Za-z0-9]/.test(password) },
  ];
  const strength = checks.filter(c => c.pass).length;
  const strengthLabel = ['', 'Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong'][strength];
  const strengthColor = ['', 'bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-blue-500', 'bg-green-500'][strength];

  if (success) return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/30 px-4">
      <div className="w-full max-w-md text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">Password Reset!</h1>
        <p className="text-muted-foreground">Your password has been updated successfully. Redirecting you to login…</p>
        <Link to="/login" className="inline-block px-6 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition">
          Go to Login
        </Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/30 px-4">
      <div className="w-full max-w-md space-y-6">

        {/* Logo */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
            <ShieldCheck className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Set New Password</h1>
          <p className="text-sm text-muted-foreground">Choose a strong password for your account.</p>
        </div>

        {/* Form */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-4">

          {error && (
            <div className="flex items-start gap-3 p-3 rounded-xl bg-destructive/10 border border-destructive/20">
              <XCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

            {/* New password */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">New Password</label>
              <div className="relative">
                <input
                  {...register('password')}
                  type={showPass ? 'text' : 'password'}
                  placeholder="Enter new password"
                  className="w-full px-4 py-2.5 pr-10 border border-input rounded-xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <button type="button" onClick={() => setShowPass((s: boolean) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition">
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}

              {/* Strength bar */}
              {password.length > 0 && (
                <div className="space-y-2 mt-2">
                  <div className="flex gap-1">
                    {[1,2,3,4,5].map(i => (
                      <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i <= strength ? strengthColor : 'bg-muted'}`} />
                    ))}
                  </div>
                  <p className={`text-xs font-medium ${['','text-red-500','text-orange-500','text-yellow-600','text-blue-500','text-green-500'][strength]}`}>
                    {strengthLabel}
                  </p>
                  <div className="grid grid-cols-2 gap-1">
                    {checks.map(({ label, pass }) => (
                      <div key={label} className="flex items-center gap-1.5">
                        {pass
                          ? <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />
                          : <div className="w-3 h-3 rounded-full border border-muted-foreground shrink-0" />}
                        <span className={`text-xs ${pass ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>{label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Confirm password */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Confirm Password</label>
              <div className="relative">
                <input
                  {...register('confirmPassword')}
                  type={showConfirm ? 'text' : 'password'}
                  placeholder="Confirm new password"
                  className="w-full px-4 py-2.5 pr-10 border border-input rounded-xl bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <button type="button" onClick={() => setShowConfirm((s: boolean) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition">
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.confirmPassword && <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>}
            </div>

            <button type="submit" disabled={isLoading}
              className="w-full py-2.5 bg-primary text-primary-foreground rounded-xl font-medium text-sm hover:bg-primary/90 disabled:opacity-50 transition flex items-center justify-center gap-2">
              {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
              {isLoading ? 'Resetting…' : 'Reset Password'}
            </button>
          </form>

          <p className="text-center text-xs text-muted-foreground">
            Remember it?{' '}
            <Link to="/login" className="text-primary hover:underline font-medium">Back to login</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
