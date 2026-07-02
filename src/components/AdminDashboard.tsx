// ====================================================================
// DAMRUBET FRONTEND ADMIN DASHBOARD VIEW
// Kaam: Yeh component pure backoffice admin panel ko control karta hai.
// Isme stats, user profiles table, balance adjustment modals, aur secure
// API fetching logic, authorization headers ke sath handle kiye gaye hain.
// ====================================================================

import React, { useState, useEffect } from "react";
import { 
  Users, 
  Coins, 
  TrendingUp, 
  DollarSign, 
  LogOut, 
  RefreshCw, 
  Activity, 
  Edit, 
  X, 
  AlertCircle,
  Clock,
  ArrowRightLeft
} from "lucide-react";

interface AdminStats {
  totalUsers: number;
  totalBets: number;
  totalBetAmount: number;
  totalPayoutAmount: number;
  houseEdgeRevenue: number;
}

interface UserProfile {
  id: string;
  username: string;
  balance: number;
  created_at: string;
}

export default function AdminDashboard() {
  // Stats and table users states
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Balance adjustment modal state variables
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [adjustAmount, setAdjustAmount] = useState<string>("");
  const [adjustReason, setAdjustReason] = useState<string>("");
  const [adjustLoading, setAdjustLoading] = useState<boolean>(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [adjustSuccessMsg, setAdjustSuccessMsg] = useState<string | null>(null);

  const backendUrl = (import.meta as any).env.VITE_BACKEND_URL || "http://localhost:5000";
  const token = localStorage.getItem("admin_token");

  // Authentication check - Token verify
  useEffect(() => {
    if (!token) {
      // Token missing hai, user ko login page par return karein
      window.location.pathname = "/admin/login";
    }
  }, [token]);

  // Main data load function
  const loadDashboardData = async () => {
    if (!token) return;
    setLoading(true);
    setErrorMsg(null);

    try {
      // A. Fetch Statistics
      const statsRes = await fetch(`${backendUrl}/api/admin/dashboard`, {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      
      const statsJson = await statsRes.json();
      if (!statsRes.ok) {
        if (statsRes.status === 401) {
          handleLogout();
          return;
        }
        throw new Error(statsJson.message || "Statistics load fail ho gayi.");
      }

      setStats(statsJson.data);

      // B. Fetch Users profiles
      const usersRes = await fetch(`${backendUrl}/api/admin/users`, {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });

      const usersJson = await usersRes.json();
      if (!usersRes.ok) {
        throw new Error(usersJson.message || "Users list fetch fail ho gayi.");
      }

      setUsers(usersJson.users);

    } catch (err: any) {
      console.error("Dashboard Load Error:", err);
      setErrorMsg(err.message || "Backend server connection issue hai, please checks backend logs.");
    } finally {
      setLoading(false);
    }
  };

  // component mount hote hi dashboard data load karein
  useEffect(() => {
    loadDashboardData();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("admin_token");
    localStorage.removeItem("admin_email");
    window.location.pathname = "/admin/login";
  };

  // Balance adjust submit handler
  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !token) return;

    setAdjustLoading(true);
    setAdjustError(null);
    setAdjustSuccessMsg(null);

    const amountNum = parseFloat(adjustAmount);
    if (isNaN(amountNum)) {
      setAdjustError("Kripya ek valid number daalein (+ balance add karne ke liye ya - minus karne ke liye)!");
      setAdjustLoading(false);
      return;
    }

    if (!adjustReason.trim()) {
      setAdjustError("Audit trail ke liye balance change karne ka reason dena mandatory hai!");
      setAdjustLoading(false);
      return;
    }

    try {
      const response = await fetch(`${backendUrl}/api/admin/users/${selectedUser.id}/adjust-balance`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          amount: amountNum,
          reason: adjustReason.trim()
        })
      });

      const resData = await response.json();

      if (!response.ok) {
        throw new Error(resData.message || "Balance adjustment action failed.");
      }

      setAdjustSuccessMsg(`Successfully adjusted balance! ${amountNum > 0 ? "+" : ""}${amountNum} tokens handled.`);
      
      // Auto-clear states
      setAdjustAmount("");
      setAdjustReason("");

      // 1.5 seconds baad modal automatic close hoga aur dashboard list update hogi
      setTimeout(() => {
        setSelectedUser(null);
        setAdjustSuccessMsg(null);
        loadDashboardData(); // Fresh data list sync
      }, 1500);

    } catch (err: any) {
      console.error("Balance Adjust Error:", err);
      setAdjustError(err.message || "Kuch technical problem aayi balance update karte waqt.");
    } finally {
      setAdjustLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#06101c] text-white font-sans selection:bg-[#00ca6f]/20">
      
      {/* Dynamic Header */}
      <header className="bg-[#061927] border-b border-[#162a3d] sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[#00ca6f]/10 border border-[#00ca6f]/30 rounded-lg flex items-center justify-center">
              <Activity className="w-5 h-5 text-[#00ca6f] animate-pulse" />
            </div>
            <div>
              <h1 className="text-base font-black uppercase tracking-wider text-white">
                Damru<span className="text-[#00ca6f]">Bet</span> <span className="text-xs text-gray-500 font-bold ml-1.5 uppercase">Admin Backoffice</span>
              </h1>
              <p className="text-[10px] text-gray-400">Safe, secure system analytics logs & wallet manager</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={loadDashboardData}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#162a3d] hover:bg-[#203a52] transition rounded-lg text-xs font-bold text-gray-300 active:scale-95 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-[#00ca6f] ${loading ? "animate-spin" : ""}`} /> Sync Database
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-400 transition rounded-lg text-xs font-bold active:scale-95"
            >
              <LogOut className="w-3.5 h-3.5" /> Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">

        {/* Global Error Alert */}
        {errorMsg && (
          <div className="p-4 bg-red-500/10 border-2 border-red-500/20 rounded-xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-bold text-sm text-red-400">Backend Connection Refused!</h3>
              <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                {errorMsg}. Make sure backend server is running on configured VITE_BACKEND_URL.
              </p>
              <button
                onClick={loadDashboardData}
                className="mt-3 px-4 py-1.5 bg-red-500 text-[#06101c] font-black uppercase text-[10px] rounded hover:bg-red-400 transition"
              >
                Retry Database Connection
              </button>
            </div>
          </div>
        )}

        {/* 4 Summary Stat Cards Section */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            
            {/* Card 1: Total Registered Users */}
            <div className="bg-[#061927] border border-[#162a3d] p-5 rounded-2xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 blur-xl rounded-full" />
              <div className="flex justify-between items-start">
                <span className="text-xs font-extrabold text-gray-400 uppercase tracking-widest">Total Users</span>
                <div className="p-2 bg-blue-500/10 rounded-xl border border-blue-500/20">
                  <Users className="w-4 h-4 text-blue-400" />
                </div>
              </div>
              <p className="text-2xl font-black mt-2 font-sans text-white">{stats.totalUsers}</p>
              <span className="text-[10px] text-gray-500 mt-1 block">Registered in database</span>
            </div>

            {/* Card 2: Total Bets Played */}
            <div className="bg-[#061927] border border-[#162a3d] p-5 rounded-2xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-[#00ca6f]/5 blur-xl rounded-full" />
              <div className="flex justify-between items-start">
                <span className="text-xs font-extrabold text-gray-400 uppercase tracking-widest">Total Bets</span>
                <div className="p-2 bg-[#00ca6f]/10 rounded-xl border border-[#00ca6f]/20">
                  <Coins className="w-4 h-4 text-[#00ca6f]" />
                </div>
              </div>
              <p className="text-2xl font-black mt-2 font-sans text-[#00ca6f]">{stats.totalBets}</p>
              <span className="text-[10px] text-gray-500 mt-1 block">HMAC-SHA256 verified</span>
            </div>

            {/* Card 3: Total Wagered (Bet Amount) */}
            <div className="bg-[#061927] border border-[#162a3d] p-5 rounded-2xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 blur-xl rounded-full" />
              <div className="flex justify-between items-start">
                <span className="text-xs font-extrabold text-gray-400 uppercase tracking-widest">Total Wagered</span>
                <div className="p-2 bg-amber-500/10 rounded-xl border border-amber-500/20">
                  <TrendingUp className="w-4 h-4 text-amber-500" />
                </div>
              </div>
              <p className="text-2xl font-black mt-2 font-sans text-white">🪙 {stats.totalBetAmount.toLocaleString()}</p>
              <span className="text-[10px] text-gray-500 mt-1 block">Total tokens bet volume</span>
            </div>

            {/* Card 4: House Margin Profit/Revenue */}
            <div className="bg-[#061927] border border-[#162a3d] p-5 rounded-2xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/5 blur-xl rounded-full" />
              <div className="flex justify-between items-start">
                <span className="text-xs font-extrabold text-gray-400 uppercase tracking-widest">House GGR</span>
                <div className="p-2 bg-rose-500/10 rounded-xl border border-rose-500/20">
                  <DollarSign className="w-4 h-4 text-rose-400" />
                </div>
              </div>
              <p className={`text-2xl font-black mt-2 font-sans ${stats.houseEdgeRevenue >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                🪙 {stats.houseEdgeRevenue.toLocaleString()}
              </p>
              <span className="text-[10px] text-gray-500 mt-1 block">House margin (Wager - Payout)</span>
            </div>

          </div>
        )}

        {/* Users Profiles Table */}
        <div className="bg-[#061927] border border-[#162a3d] rounded-2xl overflow-hidden shadow-xl">
          <div className="px-5 py-4 border-b border-[#162a3d] flex items-center justify-between">
            <div>
              <h2 className="font-black text-sm uppercase tracking-wider text-white">Active Users Directory</h2>
              <p className="text-[10px] text-gray-500">View balances, onboarding dates, and update wallets dynamically</p>
            </div>
            <div className="px-3 py-1 bg-[#162a3d] text-[#00ca6f] font-mono text-[10px] font-bold rounded-lg uppercase tracking-wider">
              {users.length} Database profiles
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#162a3d] text-[10px] text-gray-400 font-extrabold uppercase tracking-widest bg-[#06101c]/40">
                  <th className="px-5 py-3">UUID</th>
                  <th className="px-5 py-3">Username / Profile</th>
                  <th className="px-5 py-3">Wallet Balance</th>
                  <th className="px-5 py-3">Joined Date</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center">
                      <div className="inline-block w-8 h-8 rounded-full border-2 border-[#00ca6f]/20 border-t-[#00ca6f] animate-spin mb-2" />
                      <p className="text-xs text-gray-400 font-bold uppercase tracking-widest animate-pulse">Syncing Database records...</p>
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-xs text-gray-500">
                      Koi user database profile nahi mili. Make sure profiles database table built hai.
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr key={user.id} className="border-b border-[#162a3d]/40 hover:bg-[#162a3d]/25 transition text-xs font-medium">
                      <td className="px-5 py-3.5 font-mono text-gray-400 text-[10px] select-all truncate max-w-[140px]">{user.id}</td>
                      <td className="px-5 py-3.5 font-bold text-white flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-[#00ca6f]/10 border border-[#00ca6f]/20 text-[#00ca6f] text-[10px] font-black flex items-center justify-center uppercase">
                          {user.username?.substring(0, 2) || "U"}
                        </div>
                        {user.username || "Anonymous Gambler"}
                      </td>
                      <td className="px-5 py-3.5 font-mono font-black text-[#00ca6f] text-sm">
                        🪙 {parseFloat(user.balance as any).toFixed(2)}
                      </td>
                      <td className="px-5 py-3.5 text-gray-400 flex items-center gap-1 mt-1 border-0">
                        <Clock className="w-3.5 h-3.5 text-gray-500" />
                        {new Date(user.created_at).toLocaleDateString()} {new Date(user.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          onClick={() => {
                            setSelectedUser(user);
                            setAdjustAmount("");
                            setAdjustReason("");
                            setAdjustError(null);
                            setAdjustSuccessMsg(null);
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#00ca6f] hover:bg-[#00e37e] text-[#06101c] font-black rounded-lg text-[10px] uppercase transition active:scale-95"
                        >
                          <Edit className="w-3 h-3" /> Adjust Balance
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Balance Adjust modal popup block */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 bg-[#06101c]/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#061927] border-2 border-[#162a3d] rounded-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-150">
            
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-[#162a3d] flex items-center justify-between bg-[#162a3d]/20">
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4 text-[#00ca6f]" />
                <h3 className="font-black text-sm uppercase tracking-wider">Adjust Wallet Balance</h3>
              </div>
              <button 
                onClick={() => setSelectedUser(null)} 
                className="p-1 hover:bg-[#162a3d] rounded-lg transition text-gray-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleAdjustSubmit} className="p-5 space-y-4">
              
              {/* User Profile Information */}
              <div className="p-3 bg-[#06101c] rounded-xl border border-[#162a3d]">
                <span className="text-gray-500 text-[10px] font-bold uppercase tracking-wider block">Target Profile</span>
                <span className="text-white font-bold text-xs block mt-1">{selectedUser.username || "Anonymous"}</span>
                <span className="text-[#00ca6f] font-mono font-extrabold text-xs block mt-0.5">Current Balance: 🪙 {parseFloat(selectedUser.balance as any).toFixed(2)}</span>
              </div>

              {/* Amount input */}
              <div>
                <label className="block text-gray-400 text-[10px] uppercase font-bold tracking-widest mb-1.5">
                  Adjustment Amount (Tokens)
                </label>
                <input
                  type="text"
                  placeholder="E.g. 500 (for add) or -250 (for deduct)"
                  value={adjustAmount}
                  onChange={(e) => setAdjustAmount(e.target.value)}
                  className="w-full px-4 py-2.5 bg-[#06101c] border border-[#2f4553]/40 rounded-xl text-white font-medium text-xs focus:outline-none focus:border-[#00ca6f]/60 transition"
                  required
                />
                <span className="text-[10px] text-gray-500 mt-1 block leading-relaxed">
                  TIP: Balance badhane ke liye seedha number likhein (e.g. 100), aur balance ghatane ke liye minus (-) prefix karein (e.g. -50).
                </span>
              </div>

              {/* Adjustment Reason */}
              <div>
                <label className="block text-gray-400 text-[10px] uppercase font-bold tracking-widest mb-1.5">
                  Audit log Adjustment Reason
                </label>
                <textarea
                  placeholder="E.g. Faucet refund / custom gift reward"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  className="w-full px-4 py-2.5 bg-[#06101c] border border-[#2f4553]/40 rounded-xl text-white font-medium text-xs focus:outline-none focus:border-[#00ca6f]/60 transition h-20 resize-none"
                  required
                />
              </div>

              {/* Error messages Inside Modal */}
              {adjustError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-xl flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{adjustError}</span>
                </div>
              )}

              {/* Success message Inside Modal */}
              {adjustSuccessMsg && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-xl flex items-center gap-1.5">
                  <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                  <span>{adjustSuccessMsg}</span>
                </div>
              )}

              {/* Form Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedUser(null)}
                  className="w-1/2 py-2.5 bg-[#162a3d] hover:bg-[#203a52] text-gray-300 font-extrabold uppercase tracking-wider text-[10px] rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adjustLoading}
                  className="w-1/2 py-2.5 bg-[#00ca6f] hover:bg-[#00e37e] text-[#06101c] font-extrabold uppercase tracking-wider text-[10px] rounded-xl transition disabled:opacity-50"
                >
                  {adjustLoading ? "Updating..." : "Confirm Adjustment"}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}
