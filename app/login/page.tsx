'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { LANDING_PAGE, Role } from '@/lib/auth-config';
import StarLogo from '@/components/StarLogo';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError('');
    setLoading(true);

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError || !data.user) {
      setError('Invalid email or password.');
      setLoading(false);
      return;
    }

    // Determine the role so we can land the user on the right tab.
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .single();
    const role: Role = profile?.role === 'admin' ? 'admin' : 'editor';
    try {
      localStorage.setItem('main_page', JSON.stringify(LANDING_PAGE[role]));
    } catch {}

    router.replace('/');
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 24 }}>
      <form
        onSubmit={handleSubmit}
        className="card"
        style={{ width: 380, maxWidth: '100%', display: 'flex', flexDirection: 'column', gap: 16, padding: 28 }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <StarLogo size={40} />
          <div className="font-head" style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>Nathan OS</div>
          <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>Sign in to continue</div>
        </div>

        <div>
          <label className="form-label">Email</label>
          <input
            className="form-input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
          />
        </div>

        <div>
          <label className="form-label">Password</label>
          <input
            className="form-input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
        </div>

        {error && (
          <div style={{ fontSize: 12, color: 'var(--neg)', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 10px' }}>
            {error}
          </div>
        )}

        <button type="submit" className="btn-primary" disabled={loading} style={{ width: '100%', padding: '10px 14px', marginTop: 2 }}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>

        <div style={{ fontSize: 11, color: 'var(--text-faint)', textAlign: 'center' }}>
          Access is provisioned by an administrator.
        </div>
      </form>
    </div>
  );
}
