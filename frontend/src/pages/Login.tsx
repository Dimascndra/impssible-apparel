import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient, setCsrfToken, ApiError } from '../api/client';
import { Lock, User, AlertCircle, ArrowRight, ShieldCheck } from 'lucide-react';

export const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRateLimited, setIsRateLimited] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setIsRateLimited(false);

    try {
      const data = await apiClient<{
        ok: boolean;
        role: 'admin' | 'design';
        csrf: string;
      }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });

      if (data.csrf) {
        setCsrfToken(data.csrf);
      }

      if (data.role === 'admin') {
        navigate('/instruksi');
      } else {
        navigate('/desain');
      }
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 429) {
        setIsRateLimited(true);
        setError(err.message || 'Terlalu banyak percobaan gagal. Akses dibatasi sementara demi keamanan.');
      } else {
        setError(err.message || 'Username atau password tidak sesuai.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex bg-[#080808] text-white">
      {/* Left Artwork / Brand Column */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 bg-gradient-to-br from-[#121214] via-[#0b0b0c] to-[#080808] border-r border-[#222] relative overflow-hidden">
        {/* Background glow circle */}
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-[#ff1b1b]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-[#d4af37]/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10">
          <img
            src="/assets/impossible-logo.png"
            alt="IMPOSSIBLE APPAREL"
            className="h-16 w-auto object-contain"
          />
        </div>

        <div className="relative z-10 my-auto py-12">
          <span className="text-[#ff1b1b] text-xs font-black tracking-[0.25em] uppercase mb-4 block">
            WORK PORTAL SYSTEM
          </span>
          <h1 className="text-5xl xl:text-6xl font-black uppercase tracking-tight leading-none mb-6">
            WORK<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-neutral-300 to-neutral-500">
              PORTAL.
            </span>
          </h1>
          <p className="text-neutral-400 text-lg max-w-md leading-relaxed">
            Portal aman terpadu untuk Dashboard Desain dan Dashboard Instruksi Admin IMPOSSIBLE APPAREL.
          </p>
        </div>

        <div className="relative z-10 flex items-center gap-3 text-neutral-500 text-xs tracking-wider">
          <ShieldCheck className="w-4 h-4 text-[#ff1b1b]" />
          <span>Sesi terenkripsi & Dilindungi Proteksi Brute-Force Rate Limiting</span>
        </div>
      </div>

      {/* Right Login Form Column */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">
          {/* Mobile logo only */}
          <div className="lg:hidden mb-8 text-center">
            <img
              src="/assets/impossible-logo.png"
              alt="IMPOSSIBLE APPAREL"
              className="h-12 w-auto mx-auto object-contain mb-3"
            />
            <p className="text-xs uppercase tracking-widest text-[#ff1b1b] font-bold">Work Portal</p>
          </div>

          <div className="bg-[#121214] border border-[#262626] rounded-2xl p-8 sm:p-10 shadow-2xl relative">
            <div className="mb-8">
              <h2 className="text-2xl font-black tracking-tight uppercase text-white mb-2">
                Masuk
              </h2>
              <p className="text-neutral-400 text-sm">
                Gunakan akun Admin atau akun Desain sesuai hak akses Anda.
              </p>
            </div>

            {error && (
              <div
                className={`mb-6 p-4 rounded-xl text-sm flex items-start gap-3 border ${
                  isRateLimited
                    ? 'bg-amber-950/40 border-amber-600/50 text-amber-200'
                    : 'bg-red-950/40 border-red-600/50 text-red-200'
                }`}
                role="alert"
              >
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <div>
                  <strong className="block font-semibold">
                    {isRateLimited ? 'Akses Dibatasi (Rate Limit)' : 'Login Gagal'}
                  </strong>
                  <span>{error}</span>
                </div>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-5" id="loginForm">
              <div>
                <label
                  htmlFor="username"
                  className="block text-xs font-bold uppercase tracking-wider text-neutral-400 mb-2"
                >
                  Username
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-500">
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    id="username"
                    type="text"
                    required
                    autoFocus
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Masukkan username"
                    className="w-full pl-10 pr-4 py-3 bg-[#18181b] border border-[#333] rounded-xl text-white placeholder-neutral-500 text-sm focus:outline-none focus:border-[#ff1b1b] focus:ring-2 focus:ring-[#ff1b1b]/20 transition"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-xs font-bold uppercase tracking-wider text-neutral-400 mb-2"
                >
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-500">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-4 py-3 bg-[#18181b] border border-[#333] rounded-xl text-white placeholder-neutral-500 text-sm focus:outline-none focus:border-[#ff1b1b] focus:ring-2 focus:ring-[#ff1b1b]/20 transition"
                  />
                </div>
              </div>

              <button
                type="submit"
                id="submitBtn"
                disabled={loading}
                className="w-full mt-2 py-3.5 px-4 bg-[#ff1b1b] hover:bg-[#e01616] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm tracking-wide uppercase rounded-xl transition duration-150 flex items-center justify-center gap-2 shadow-lg shadow-[#ff1b1b]/20"
              >
                {loading ? (
                  <span>Memverifikasi...</span>
                ) : (
                  <>
                    <span>Masuk ke Dashboard</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-8 pt-6 border-t border-[#222] text-center">
              <a
                href="/"
                className="text-xs text-neutral-400 hover:text-white transition flex items-center justify-center gap-1.5"
              >
                ← Kembali ke Halaman Utama Publik
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
