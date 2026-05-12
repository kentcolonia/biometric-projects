'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { loginUser } from '@/lib/api';
import { saveToken, isAuthenticated } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (isAuthenticated()) {
      router.replace('/dashboard');
    }
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { token } = await loginUser(username, password);
      saveToken(token);
      router.push('/dashboard');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-bg">
      <div className="login-card">
        <div className="login-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>
            <path d="M12 10c-4 0-7 2-7 4.5V16h14v-1.5c0-2.5-3-4.5-7-4.5z"/>
            <path d="M17.5 6.5C18.4 7.6 19 9 19 10.5"/>
            <path d="M6.5 6.5C5.6 7.6 5 9 5 10.5"/>
            <path d="M20 4c1.5 1.7 2.5 3.9 2.5 6.5"/>
            <path d="M4 4C2.5 5.7 1.5 7.9 1.5 10.5"/>
          </svg>
        </div>

        <h1 className="login-title">Biometrics system</h1>
        <p className="login-subtitle">Sign in to continue</p>

        {error && (
          <div className="error-box">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="field">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Enter username"
              autoComplete="username"
              required
            />
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <div className="password-wrap">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter password"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="eye-btn"
                onClick={() => setShowPassword(v => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                )}
              </button>
            </div>
          </div>

          <button type="submit" className="submit-btn" disabled={loading}>
            {loading ? <span className="spinner" /> : 'Sign in'}
          </button>
        </form>
      </div>

      <style>{`
        .login-bg {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f5f5f3;
          font-family: 'DM Sans', system-ui, sans-serif;
        }
        .login-card {
          background: #fff;
          border: 1px solid #e8e8e6;
          border-radius: 16px;
          padding: 40px 36px;
          width: 100%;
          max-width: 380px;
          text-align: center;
        }
        .login-icon {
          width: 56px;
          height: 56px;
          border-radius: 14px;
          background: #f0f0ee;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 20px;
          color: #333;
        }
        .login-title {
          font-size: 20px;
          font-weight: 600;
          color: #111;
          margin-bottom: 6px;
        }
        .login-subtitle {
          font-size: 14px;
          color: #888;
          margin-bottom: 28px;
        }
        .error-box {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #fef2f2;
          color: #b91c1c;
          border: 1px solid #fecaca;
          border-radius: 8px;
          padding: 10px 14px;
          font-size: 13px;
          margin-bottom: 20px;
          text-align: left;
        }
        .login-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
          text-align: left;
        }
        .field label {
          display: block;
          font-size: 13px;
          font-weight: 500;
          color: #444;
          margin-bottom: 6px;
        }
        .field input {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid #e0e0de;
          border-radius: 8px;
          font-size: 14px;
          color: #111;
          background: #fafafa;
          outline: none;
          transition: border-color 0.15s;
          box-sizing: border-box;
        }
        .field input:focus {
          border-color: #aaa;
          background: #fff;
        }
        .password-wrap { position: relative; }
        .password-wrap input { padding-right: 40px; }
        .eye-btn {
          position: absolute;
          right: 10px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          cursor: pointer;
          color: #aaa;
          padding: 4px;
          display: flex;
        }
        .eye-btn:hover { color: #555; }
        .submit-btn {
          width: 100%;
          padding: 11px;
          border-radius: 8px;
          border: none;
          background: #111;
          color: #fff;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          margin-top: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: opacity 0.15s;
        }
        .submit-btn:hover:not(:disabled) { opacity: 0.85; }
        .submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .spinner {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </main>
  );
}