import { useState, FormEvent } from "react";
import { getSupabaseClient } from "../supabase";
import { Eye, EyeOff, Lock, Mail, Sparkles, UserPlus, LogIn } from "lucide-react";

interface AuthViewProps {
  onAuthSuccess: () => void;
}

export default function AuthView({ onAuthSuccess }: AuthViewProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const supabase = getSupabaseClient();

  const handleAuth = async (e: FormEvent) => {
    e.preventDefault();
    if (!supabase) {
      setErrorMsg("Supabase is not configured yet.");
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      if (isLogin) {
        // Sign In
        const { error, data } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        if (data?.user) {
          setSuccessMsg("Logged in successfully! Redirecting...");
          setTimeout(() => {
            onAuthSuccess();
          }, 1000);
        }
      } else {
        // Sign Up
        const { error, data } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        
        if (data?.user) {
          // If auto login is enabled on sign up, great, otherwise ask them to check mail or log in.
          setSuccessMsg("Registration successful! Aap ab login kar sakte hain.");
          setIsLogin(true);
          setPassword(""); // Reset password
        }
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f1923] text-[#b1bad3] flex flex-col items-center justify-center px-4 py-12" id="auth-view-container">
      {/* Brand Logo / Accent */}
      <div className="text-center mb-8" id="auth-logo-section">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#00e701]/10 border border-[#00e701]/20 text-[#00e701] text-xs font-semibold uppercase tracking-wider mb-4 animate-pulse">
          <Sparkles className="w-3.5 h-3.5" /> Fast & Provably Fair
        </div>
        <h1 className="text-4xl font-black tracking-tight text-white mb-2 font-sans flex items-center justify-center gap-2">
          ⚡ LIMBO CASINO
        </h1>
        <p className="text-[#b1bad3]/80 text-sm max-w-sm">
          Supabase secure backend powered authentic Limbo betting.
        </p>
      </div>

      {/* Main Auth Card */}
      <div className="w-full max-w-md bg-[#213743] rounded-2xl border border-[#2d4456] shadow-2xl overflow-hidden p-6 md:p-8" id="auth-card">
        {/* Toggle tabs */}
        <div className="grid grid-cols-2 mb-6 bg-[#0f1923] p-1 rounded-lg border border-[#2d4456]" id="auth-tabs">
          <button
            type="button"
            onClick={() => {
              setIsLogin(true);
              setErrorMsg(null);
              setSuccessMsg(null);
            }}
            className={`py-2 text-sm font-bold rounded-md transition duration-200 flex items-center justify-center gap-2 ${
              isLogin ? "bg-[#2f4553] text-white shadow-lg" : "text-[#b1bad3] hover:text-white"
            }`}
            id="login-tab-btn"
          >
            <LogIn className="w-4 h-4" /> Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setIsLogin(false);
              setErrorMsg(null);
              setSuccessMsg(null);
            }}
            className={`py-2 text-sm font-bold rounded-md transition duration-200 flex items-center justify-center gap-2 ${
              !isLogin ? "bg-[#2f4553] text-white shadow-lg" : "text-[#b1bad3] hover:text-white"
            }`}
            id="signup-tab-btn"
          >
            <UserPlus className="w-4 h-4" /> Register
          </button>
        </div>

        {/* Error or Success Alerts */}
        {errorMsg && (
          <div className="mb-4 p-3.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-lg text-sm font-medium animate-shake" id="auth-error">
            ⚠️ {errorMsg}
          </div>
        )}
        {successMsg && (
          <div className="mb-4 p-3.5 bg-emerald-500/10 border border-emerald-500/20 text-[#00e701] rounded-lg text-sm font-medium" id="auth-success">
            ✅ {successMsg}
          </div>
        )}

        {/* Authentication Form */}
        <form onSubmit={handleAuth} className="space-y-4" id="auth-form">
          <div>
            <label className="block text-xs font-bold text-[#b1bad3] uppercase tracking-wider mb-1.5">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#557086]" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full pl-10 pr-4 py-2.5 bg-[#0f1923] rounded border-2 border-[#2f4553] text-sm text-white placeholder-[#557086] focus:outline-none focus:border-[#557086] transition-all"
                id="auth-email-input"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[#b1bad3] uppercase tracking-wider mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#557086]" />
              <input
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-11 py-2.5 bg-[#0f1923] rounded border-2 border-[#2f4553] text-sm text-white placeholder-[#557086] focus:outline-none focus:border-[#557086] transition-all"
                id="auth-password-input"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#557086] hover:text-white transition"
                id="toggle-pass-visibility"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-4 bg-[#00e701] hover:bg-[#1fff20] text-[#01080e] font-black rounded text-md uppercase transition-all shadow-[0_0_20px_rgba(0,231,1,0.2)] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            id="auth-submit-btn"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4 text-[#01080e]" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Processing...
              </span>
            ) : isLogin ? (
              "Sign In"
            ) : (
              "Create Free Account"
            )}
          </button>
        </form>
      </div>

      <div className="mt-6 text-center text-xs text-[#557086]" id="auth-notice">
        Secured by Supabase Auth engine &bull; Immersive Casino Theme Mode
      </div>
    </div>
  );
}
