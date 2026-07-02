// ====================================================================
// DAMRUBET FRONTEND ADMIN LOGIN VIEW
// Kaam: Admin login form jo design kiya gaya hai existing casino theme ko follow karte hue.
// JWT Token secure tarike se localStorage me store karta hai aur dashboard par redirect karta hai.
// ====================================================================

import React, { useState } from "react";
import { ShieldAlert, KeyRound, Mail, AlertTriangle, ArrowLeft } from "lucide-react";

export default function AdminLogin() {
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // VITE_BACKEND_URL read karte hain env se, default: http://localhost:5000
  const backendUrl = (import.meta as any).env.VITE_BACKEND_URL || "http://localhost:5000";

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    if (!email.trim() || !password.trim()) {
      setErrorMsg("Kripya email aur password dono enter karein!");
      setLoading(false);
      return;
    }

    try {
      // Backend api/admin/login par POST request bhejte hain
      const response = await fetch(`${backendUrl}/api/admin/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim(),
          password: password,
        }),
      });

      const resData = await response.json();

      if (!response.ok) {
        throw new Error(resData.message || "Invalid Email ya Password!");
      }

      // JWT Token ko localStorage me 'admin_token' key ke saath store karein
      localStorage.setItem("admin_token", resData.token);
      localStorage.setItem("admin_email", resData.admin?.email || email);

      // Successfully sign in hone ke baad Dashboard view par navigate karein
      window.location.pathname = "/admin/dashboard";

    } catch (err: any) {
      console.error("Admin Login Fetch Error:", err);
      setErrorMsg(err.message || "Backend server unreachable hai. Make sure backend started hai.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#06101c] flex flex-col items-center justify-center p-4 relative font-sans text-white select-none">
      {/* Dynamic Casino Ambient Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-[#00ca6f]/5 blur-[120px] rounded-full pointer-events-none" />

      {/* Back to Home Main Game Link */}
      <button
        onClick={() => {
          window.location.pathname = "/";
        }}
        className="absolute top-4 left-4 flex items-center gap-1.5 text-gray-400 hover:text-white transition text-xs font-bold bg-[#061927] px-3.5 py-2 rounded-lg border border-[#2f4553]/20"
      >
        <ArrowLeft className="w-3.5 h-3.5 text-[#00ca6f]" /> Back to Game
      </button>

      <div className="w-full max-w-md bg-[#061927] border-2 border-[#162a3d] rounded-2xl p-6 shadow-2xl relative z-10">
        
        {/* Header Branding */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-[#00ca6f]/10 border border-[#00ca6f]/30 rounded-xl mb-3">
            <ShieldAlert className="w-6 h-6 text-[#00ca6f]" />
          </div>
          <h1 className="text-xl font-black uppercase tracking-wider text-white">
            Damru<span className="text-[#00ca6f]">Bet</span> <span className="text-gray-400 text-xs font-medium lowercase">backoffice</span>
          </h1>
          <p className="text-gray-400 text-xs mt-1">
            Admin credentials ke bina access restricted hai.
          </p>
        </div>

        {/* Error Notification Alert */}
        {errorMsg && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-2 text-red-400 text-xs leading-relaxed mb-4">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleLoginSubmit} className="space-y-4">
          <div>
            <label className="block text-gray-400 text-[10px] uppercase font-bold tracking-widest mb-1.5">
              Admin Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#557086]" />
              <input
                type="email"
                placeholder="admin@damrubet.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-[#06101c] border border-[#2f4553]/40 rounded-xl text-white font-medium text-xs focus:outline-none focus:border-[#00ca6f]/60 transition font-sans"
              />
            </div>
          </div>

          <div>
            <label className="block text-gray-400 text-[10px] uppercase font-bold tracking-widest mb-1.5">
              Admin Password
            </label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#557086]" />
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-[#06101c] border border-[#2f4553]/40 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-[#00ca6f]/60 transition"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-3 bg-[#00ca6f] hover:bg-[#00e37e] text-[#06101c] font-extrabold uppercase tracking-widest text-xs rounded-xl shadow-lg transition active:scale-[0.98] disabled:opacity-50"
          >
            {loading ? "Authenticating..." : "🛡️ Secure Login"}
          </button>
        </form>

        {/* Footer info banner */}
        <div className="mt-6 pt-4 border-t border-[#162a3d] text-center">
          <p className="text-[10px] text-gray-500 leading-relaxed">
            Note: Multi-Factor rate limiter enabled. Maximum 5 failure attempts par block laga diya jayega.
          </p>
        </div>

      </div>
    </div>
  );
}
