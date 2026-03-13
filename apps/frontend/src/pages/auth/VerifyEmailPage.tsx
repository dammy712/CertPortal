import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Loader2, CheckCircle2, XCircle, ShieldCheck, Mail } from 'lucide-react';
import { authApi } from '@/api/auth.api';

type Status = 'loading' | 'success' | 'error';

export default function VerifyEmailPage() {
  const { token }          = useParams<{ token: string }>();
  const [status, setStatus] = useState<Status>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) { setStatus('error'); setMessage('No verification token found.'); return; }

    authApi.verifyEmail(token)
      .then(() => setStatus('success'))
      .catch((err: any) => {
        setStatus('error');
        setMessage(err.response?.data?.message || 'This verification link is invalid or has expired.');
      });
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/30 px-4">
      <div className="w-full max-w-md text-center space-y-5">

        {/* Loading */}
        {status === 'loading' && (
          <>
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Verifying your email…</h1>
            <p className="text-muted-foreground">Please wait a moment.</p>
          </>
        )}

        {/* Success */}
        {status === 'success' && (
          <>
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Email Verified! ✅</h1>
            <p className="text-muted-foreground">Your email address has been confirmed. Your account is now active.</p>
            <Link to="/login"
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition">
              <ShieldCheck className="w-4 h-4" /> Go to Login
            </Link>
          </>
        )}

        {/* Error */}
        {status === 'error' && (
          <>
            <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto">
              <XCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Verification Failed</h1>
            <p className="text-muted-foreground">{message}</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link to="/login"
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition">
                Back to Login
              </Link>
              <Link to="/register"
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 border border-border rounded-xl text-sm font-medium hover:bg-accent transition">
                <Mail className="w-4 h-4" /> Create New Account
              </Link>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
