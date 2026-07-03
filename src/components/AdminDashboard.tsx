// ====================================================================
// DAMRUBET FRONTEND ADMIN DASHBOARD VIEW - MULTI-CURRENCY INTEGRATED
// Kaam: Yeh component pure backoffice admin panel ko control karta hai.
// Isme stats, user profiles table, balance adjustment modals, aur secure
// API fetching logic, authorization headers ke sath handle kiye gaye hain.
// Supports multi-currency aggregated balances, breakdown view, and selective edits.
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

interface WalletBalance {
  currency_code: string;
  balance: number;
}

interface UserProfile {
  id: string;
  username: string;
  balance: number; // Aggregate USD balance
  balances?: WalletBalance[];
  created_at: string;
}

interface DepositRequest {
  id: string;
  user_id: string;
  currency_code: string;
  amount: number;
  proof_image_path: string;
  proof_signed_url: string | null;
  utr_reference: string | null;
  status: "pending" | "approved" | "rejected";
  admin_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  profiles?: {
    username: string;
  };
}

interface WithdrawRequest {
  id: string;
  user_id: string;
  currency_code: string;
  amount: number;
  payout_details: string;
  status: "pending" | "approved" | "rejected";
  admin_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  profiles?: {
    username: string;
  };
}

export default function AdminDashboard() {
  // Navigation Tab State
  const [activeTab, setActiveTab] = useState<"users" | "deposits" | "withdrawals">("users");

  // Stats and table users states
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Deposit/Withdraw requests states
  const [deposits, setDeposits] = useState<DepositRequest[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawRequest[]>([]);
  const [depositsLoading, setDepositsLoading] = useState<boolean>(false);
  const [withdrawalsLoading, setWithdrawalsLoading] = useState<boolean>(false);
  const [reviewLoadingId, setReviewLoadingId] = useState<string | null>(null);
  const [reviewNoteMap, setReviewNoteMap] = useState<Record<string, string>>({});

  // Filter states
  const [depositFilter, setDepositFilter] = useState<string>("pending");
  const [withdrawFilter, setWithdrawFilter] = useState<string>("pending");

  // Balance adjustment modal state variables
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [adjustCurrency, setAdjustCurrency] = useState<string>("USDT");
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
      window.location.pathname = "/admin/login";
    }
  }, [token]);

  // Fetch Manual Deposits
  const loadDeposits = async (statusFilter = depositFilter) => {
    if (!token) return;
    setDepositsLoading(true);
    try {
      const url = statusFilter === "all" 
        ? `${backendUrl}/api/admin/deposits` 
        : `${backendUrl}/api/admin/deposits?status=${statusFilter}`;
      
      const res = await fetch(url, {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      const json = await res.json();
      if (res.ok) {
        setDeposits(json.data || []);
      } else {
        throw new Error(json.message || "Deposits load fail ho gayi.");
      }
    } catch (err: any) {
      console.error("Load Deposits Error:", err);
      setErrorMsg(err.message || "Failed to load deposit requests.");
    } finally {
      setDepositsLoading(false);
    }
  };

  // Fetch Manual Withdrawals
  const loadWithdrawals = async (statusFilter = withdrawFilter) => {
    if (!token) return;
    setWithdrawalsLoading(true);
    try {
      const url = statusFilter === "all"
        ? `${backendUrl}/api/admin/withdrawals`
        : `${backendUrl}/api/admin/withdrawals?status=${statusFilter}`;

      const res = await fetch(url, {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      const json = await res.json();
      if (res.ok) {
        setWithdrawals(json.data || []);
      } else {
        throw new Error(json.message || "Withdrawals load fail ho gayi.");
      }
    } catch (err: any) {
      console.error("Load Withdrawals Error:", err);
      setErrorMsg(err.message || "Failed to load withdrawal requests.");
    } finally {
      setWithdrawalsLoading(false);
    }
  };

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

      // C. Fetch Deposits & Withdrawals
      await Promise.all([
        loadDeposits(depositFilter),
        loadWithdrawals(withdrawFilter)
      ]);

    } catch (err: any) {
      console.error("Dashboard Load Error:", err);
      setErrorMsg(err.message || "Backend server connection issue hai, please checks backend logs.");
    } finally {
      setLoading(false);
    }
  };

  // Run on filters or tab change
  useEffect(() => {
    loadDeposits(depositFilter);
  }, [depositFilter]);

  useEffect(() => {
    loadWithdrawals(withdrawFilter);
  }, [withdrawFilter]);

  useEffect(() => {
    loadDashboardData();
  }, []);

  // Action: Review Deposit Request
  const handleReviewDeposit = async (id: string, approve: boolean) => {
    if (!token) return;
    setReviewLoadingId(id);
    try {
      const note = reviewNoteMap[id] || "";
      const res = await fetch(`${backendUrl}/api/admin/deposits/${id}/review`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ approve, note: note.trim() })
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || "Deposit review action failed.");
      }
      
      // Clear review note for this ID
      setReviewNoteMap(prev => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });

      // Reload all data to keep stats and balances fresh
      await loadDashboardData();
    } catch (err: any) {
      console.error("Review Deposit Error:", err);
      alert(err.message || "Review action failed.");
    } finally {
      setReviewLoadingId(null);
    }
  };

  // Action: Review Withdrawal Request
  const handleReviewWithdrawal = async (id: string, approve: boolean) => {
    if (!token) return;
    setReviewLoadingId(id);
    try {
      const note = reviewNoteMap[id] || "";
      const res = await fetch(`${backendUrl}/api/admin/withdrawals/${id}/review`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ approve, note: note.trim() })
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || "Withdrawal review action failed.");
      }

      // Clear review note for this ID
      setReviewNoteMap(prev => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });

      // Reload all data
      await loadDashboardData();
    } catch (err: any) {
      console.error("Review Withdrawal Error:", err);
      alert(err.message || "Review action failed.");
    } finally {
      setReviewLoadingId(null);
    }
  };

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
          reason: adjustReason.trim(),
          currency_code: adjustCurrency
        })
      });

      const resData = await response.json();

      if (!response.ok) {
        throw new Error(resData.message || "Balance adjustment action failed.");
      }

      setAdjustSuccessMsg(`Successfully adjusted balance! ${amountNum > 0 ? "+" : ""}${amountNum} ${adjustCurrency} handled.`);
      
      setAdjustAmount("");
      setAdjustReason("");

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

  // Calculate selected currency balance for targeted modal
  const getSelectedCurrencyBalance = () => {
    if (!selectedUser) return 0;
    const found = selectedUser.balances?.find(w => w.currency_code === adjustCurrency);
    return found ? found.balance : 0;
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
              <p className="text-[10px] text-gray-400">Safe, secure multi-currency analytics & wallet manager</p>
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

            {/* Card 3: Total Wagered (Bet Amount converted to USD) */}
            <div className="bg-[#061927] border border-[#162a3d] p-5 rounded-2xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 blur-xl rounded-full" />
              <div className="flex justify-between items-start">
                <span className="text-xs font-extrabold text-gray-400 uppercase tracking-widest">Total Wagered</span>
                <div className="p-2 bg-amber-500/10 rounded-xl border border-amber-500/20">
                  <TrendingUp className="w-4 h-4 text-amber-500" />
                </div>
              </div>
              <p className="text-2xl font-black mt-2 font-sans text-white">${stats.totalBetAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              <span className="text-[10px] text-gray-500 mt-1 block">Combined USD volume</span>
            </div>

            {/* Card 4: House Margin Profit/Revenue in USD */}
            <div className="bg-[#061927] border border-[#162a3d] p-5 rounded-2xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/5 blur-xl rounded-full" />
              <div className="flex justify-between items-start">
                <span className="text-xs font-extrabold text-gray-400 uppercase tracking-widest">House GGR</span>
                <div className="p-2 bg-rose-500/10 rounded-xl border border-rose-500/20">
                  <DollarSign className="w-4 h-4 text-rose-400" />
                </div>
              </div>
              <p className={`text-2xl font-black mt-2 font-sans ${stats.houseEdgeRevenue >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                ${stats.houseEdgeRevenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <span className="text-[10px] text-gray-500 mt-1 block">Net house margin in USD</span>
            </div>

          </div>
        )}

        {/* Navigation Tabs Bar */}
        <div className="flex border-b border-[#162a3d] gap-2">
          <button
            onClick={() => setActiveTab("users")}
            className={`px-5 py-2.5 text-xs font-black uppercase tracking-wider transition border-b-2 ${
              activeTab === "users" 
                ? "border-[#00ca6f] text-[#00ca6f]" 
                : "border-transparent text-gray-400 hover:text-white"
            }`}
          >
            Users Directory & Stats
          </button>
          <button
            onClick={() => setActiveTab("deposits")}
            className={`px-5 py-2.5 text-xs font-black uppercase tracking-wider transition border-b-2 flex items-center gap-1.5 ${
              activeTab === "deposits" 
                ? "border-[#00ca6f] text-[#00ca6f]" 
                : "border-transparent text-gray-400 hover:text-white"
            }`}
          >
            Deposit Requests
            {deposits.filter(d => d.status === "pending").length > 0 && (
              <span className="w-4 h-4 bg-red-500 text-white rounded-full text-[9px] font-black flex items-center justify-center animate-bounce">
                {deposits.filter(d => d.status === "pending").length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("withdrawals")}
            className={`px-5 py-2.5 text-xs font-black uppercase tracking-wider transition border-b-2 flex items-center gap-1.5 ${
              activeTab === "withdrawals" 
                ? "border-[#00ca6f] text-[#00ca6f]" 
                : "border-transparent text-gray-400 hover:text-white"
            }`}
          >
            Withdrawal Requests
            {withdrawals.filter(w => w.status === "pending").length > 0 && (
              <span className="w-4 h-4 bg-red-500 text-white rounded-full text-[9px] font-black flex items-center justify-center animate-bounce">
                {withdrawals.filter(w => w.status === "pending").length}
              </span>
            )}
          </button>
        </div>

        {/* Users Profiles Table Section */}
        {activeTab === "users" && (
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
                    <th className="px-5 py-3">Wallet Balances</th>
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
                        <td className="px-5 py-3.5">
                          <div className="flex flex-col gap-1">
                            <span className="font-mono font-black text-emerald-400 text-sm" title="Aggregated USD balance">
                              ${parseFloat(user.balance as any).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              <span className="text-[9px] text-gray-500 font-bold uppercase ml-1">(Aggregate USD)</span>
                            </span>
                            {user.balances && user.balances.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1 max-w-sm">
                                {user.balances.map((wb) => (
                                  <span key={wb.currency_code} className="inline-flex items-center px-1.5 py-0.5 rounded bg-[#162a3d] border border-[#2f4553]/30 text-[9px] text-gray-300 font-mono font-bold">
                                    {parseFloat(wb.balance as any).toLocaleString("en-US", { maximumFractionDigits: 4 })} {wb.currency_code}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-gray-400">
                          <div className="flex items-center gap-1 mt-1">
                            <Clock className="w-3.5 h-3.5 text-gray-500" />
                            <span>{new Date(user.created_at).toLocaleDateString()} {new Date(user.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <button
                            onClick={() => {
                              setSelectedUser(user);
                              setAdjustCurrency("USDT");
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
        )}

        {/* Deposit Requests Section */}
        {activeTab === "deposits" && (
          <div className="bg-[#061927] border border-[#162a3d] rounded-2xl overflow-hidden shadow-xl">
            <div className="px-5 py-4 border-b border-[#162a3d] flex flex-col md:flex-row md:items-center justify-between gap-3 bg-[#0c2438]">
              <div>
                <h2 className="font-black text-sm uppercase tracking-wider text-white">Deposit Requests Queue</h2>
                <p className="text-[10px] text-gray-400">Review, verify screenshots, and approve manual player deposits</p>
              </div>
              <div className="flex flex-wrap gap-1">
                {["pending", "approved", "rejected", "all"].map((st) => (
                  <button
                    key={st}
                    onClick={() => setDepositFilter(st)}
                    className={`px-3 py-1 bg-[#162a3d] hover:bg-[#203a52] text-gray-300 rounded text-[9px] font-black uppercase tracking-wider transition ${
                      depositFilter === st 
                        ? "bg-[#00ca6f] text-[#06101c] hover:bg-[#00ca6f]" 
                        : ""
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#162a3d] text-[10px] text-gray-400 font-extrabold uppercase tracking-widest bg-[#06101c]/40">
                    <th className="px-5 py-3">Player / Username</th>
                    <th className="px-5 py-3">Currency</th>
                    <th className="px-5 py-3">Amount</th>
                    <th className="px-5 py-3">UTR / Reference</th>
                    <th className="px-5 py-3">Payment Proof</th>
                    <th className="px-5 py-3">Status / Date</th>
                    <th className="px-5 py-3">Admin Notes</th>
                    <th className="px-5 py-3 text-right">Review Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {depositsLoading ? (
                    <tr>
                      <td colSpan={8} className="px-5 py-10 text-center">
                        <div className="inline-block w-8 h-8 rounded-full border-2 border-[#00ca6f]/20 border-t-[#00ca6f] animate-spin mb-2" />
                        <p className="text-xs text-gray-400 font-bold uppercase tracking-widest animate-pulse">Syncing deposits queue...</p>
                      </td>
                    </tr>
                  ) : deposits.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-5 py-10 text-center text-xs text-gray-500 font-bold uppercase tracking-widest">
                        Koi manual deposit request nahi mili status: "{depositFilter}" ke liye.
                      </td>
                    </tr>
                  ) : (
                    deposits.map((dep) => (
                      <tr key={dep.id} className="border-b border-[#162a3d]/40 hover:bg-[#162a3d]/25 transition text-xs font-medium">
                        <td className="px-5 py-4 font-bold text-white">
                          <div className="flex items-center gap-1.5">
                            <div className="w-5 h-5 rounded-full bg-blue-500/10 text-blue-400 font-black flex items-center justify-center text-[8px] uppercase">
                              {dep.profiles?.username?.substring(0, 2) || "U"}
                            </div>
                            <span>{dep.profiles?.username || "Anonymous"}</span>
                          </div>
                          <div className="text-[9px] text-gray-500 font-mono mt-0.5 select-all">{dep.user_id}</div>
                        </td>
                        <td className="px-5 py-4 font-mono font-extrabold text-[#00ca6f] uppercase">{dep.currency_code}</td>
                        <td className="px-5 py-4 font-mono font-black text-emerald-400 text-sm">
                          {parseFloat(dep.amount as any).toLocaleString("en-US", { maximumFractionDigits: 8 })}
                        </td>
                        <td className="px-5 py-4 font-mono text-gray-300 text-[11px] select-all">
                          {dep.utr_reference || <span className="text-gray-600 italic">None</span>}
                        </td>
                        <td className="px-5 py-4">
                          {dep.proof_signed_url ? (
                            <div className="flex flex-col gap-1.5">
                              <a 
                                href={dep.proof_signed_url} 
                                target="_blank" 
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 px-2 py-1 bg-[#162a3d] border border-[#2f4553]/40 text-[#00ca6f] hover:text-[#00e37e] text-[9px] font-extrabold uppercase rounded transition"
                              >
                                🔗 Open Screenshot
                              </a>
                              <img 
                                src={dep.proof_signed_url} 
                                alt="Receipt proof thumbnail" 
                                className="w-12 h-12 object-cover rounded-lg border border-[#2f4553]/40 hover:scale-[3] transition-all duration-300 origin-left cursor-zoom-in"
                                referrerPolicy="no-referrer"
                              />
                            </div>
                          ) : (
                            <span className="text-gray-600 italic">No valid image url</span>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                            dep.status === "approved" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                            dep.status === "rejected" ? "bg-red-500/10 text-red-400 border border-red-500/20" :
                            "bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse"
                          }`}>
                            {dep.status}
                          </span>
                          <div className="text-[9px] text-gray-500 mt-1.5 leading-tight">
                            Requested: {new Date(dep.created_at).toLocaleDateString()}<br/>
                            {dep.reviewed_at && <>Reviewed: {new Date(dep.reviewed_at).toLocaleDateString()}<br/></>}
                            {dep.reviewed_by && <>By: {dep.reviewed_by}</>}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-gray-300 max-w-xs break-words">
                          {dep.admin_note || <span className="text-gray-600 italic">No notes from admin</span>}
                        </td>
                        <td className="px-5 py-4 text-right">
                          {dep.status === "pending" ? (
                            <div className="flex flex-col gap-1.5 max-w-[200px] ml-auto">
                              <input
                                type="text"
                                placeholder="Add review note..."
                                value={reviewNoteMap[dep.id] || ""}
                                onChange={(e) => setReviewNoteMap(prev => ({ ...prev, [dep.id]: e.target.value }))}
                                className="px-2 py-1 bg-[#06101c] border border-[#2f4553]/40 rounded text-white text-[10px] focus:outline-none focus:border-[#00ca6f] placeholder:text-gray-600"
                              />
                              <div className="flex gap-1">
                                <button
                                  onClick={() => handleReviewDeposit(dep.id, false)}
                                  disabled={reviewLoadingId === dep.id}
                                  className="w-1/2 py-1 bg-red-500/20 border border-red-500/30 hover:bg-red-500 text-red-400 hover:text-white font-extrabold uppercase text-[9px] rounded transition active:scale-95 disabled:opacity-50"
                                >
                                  Reject
                                </button>
                                <button
                                  onClick={() => handleReviewDeposit(dep.id, true)}
                                  disabled={reviewLoadingId === dep.id}
                                  className="w-1/2 py-1 bg-[#00ca6f]/20 border border-[#00ca6f]/30 hover:bg-[#00ca6f] text-[#00ca6f] hover:text-[#06101c] font-extrabold uppercase text-[9px] rounded transition active:scale-95 disabled:opacity-50"
                                >
                                  Approve
                                </button>
                              </div>
                            </div>
                          ) : (
                            <span className="text-gray-500 text-[10px] italic">No actions</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Withdrawal Requests Section */}
        {activeTab === "withdrawals" && (
          <div className="bg-[#061927] border border-[#162a3d] rounded-2xl overflow-hidden shadow-xl">
            <div className="px-5 py-4 border-b border-[#162a3d] flex flex-col md:flex-row md:items-center justify-between gap-3 bg-[#0c2438]">
              <div>
                <h2 className="font-black text-sm uppercase tracking-wider text-white">Withdrawal Requests Queue</h2>
                <p className="text-[10px] text-gray-400">Review users requested payouts, transfer funds offline, and approve/reject requests</p>
              </div>
              <div className="flex flex-wrap gap-1">
                {["pending", "approved", "rejected", "all"].map((st) => (
                  <button
                    key={st}
                    onClick={() => setWithdrawFilter(st)}
                    className={`px-3 py-1 bg-[#162a3d] hover:bg-[#203a52] text-gray-300 rounded text-[9px] font-black uppercase tracking-wider transition ${
                      withdrawFilter === st 
                        ? "bg-[#00ca6f] text-[#06101c] hover:bg-[#00ca6f]" 
                        : ""
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#162a3d] text-[10px] text-gray-400 font-extrabold uppercase tracking-widest bg-[#06101c]/40">
                    <th className="px-5 py-3">Player / Username</th>
                    <th className="px-5 py-3">Currency</th>
                    <th className="px-5 py-3">Amount</th>
                    <th className="px-5 py-3">Payout Details (UPI/Address)</th>
                    <th className="px-5 py-3">Status / Date</th>
                    <th className="px-5 py-3">Admin Notes</th>
                    <th className="px-5 py-3 text-right">Review Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {withdrawalsLoading ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-10 text-center">
                        <div className="inline-block w-8 h-8 rounded-full border-2 border-[#00ca6f]/20 border-t-[#00ca6f] animate-spin mb-2" />
                        <p className="text-xs text-gray-400 font-bold uppercase tracking-widest animate-pulse">Syncing withdrawals queue...</p>
                      </td>
                    </tr>
                  ) : withdrawals.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-10 text-center text-xs text-gray-500 font-bold uppercase tracking-widest">
                        Koi withdrawal request nahi mili status: "{withdrawFilter}" ke liye.
                      </td>
                    </tr>
                  ) : (
                    withdrawals.map((wit) => (
                      <tr key={wit.id} className="border-b border-[#162a3d]/40 hover:bg-[#162a3d]/25 transition text-xs font-medium">
                        <td className="px-5 py-4 font-bold text-white">
                          <div className="flex items-center gap-1.5">
                            <div className="w-5 h-5 rounded-full bg-rose-500/10 text-rose-400 font-black flex items-center justify-center text-[8px] uppercase">
                              {wit.profiles?.username?.substring(0, 2) || "U"}
                            </div>
                            <span>{wit.profiles?.username || "Anonymous"}</span>
                          </div>
                          <div className="text-[9px] text-gray-500 font-mono mt-0.5 select-all">{wit.user_id}</div>
                        </td>
                        <td className="px-5 py-4 font-mono font-extrabold text-amber-500 uppercase">{wit.currency_code}</td>
                        <td className="px-5 py-4 font-mono font-black text-rose-400 text-sm">
                          {parseFloat(wit.amount as any).toLocaleString("en-US", { maximumFractionDigits: 8 })}
                        </td>
                        <td className="px-5 py-4">
                          <div className="p-2.5 bg-[#06101c] rounded-xl border border-[#2f4553]/30 font-mono text-[11px] text-white break-all max-w-xs select-all">
                            {wit.payout_details}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                            wit.status === "approved" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                            wit.status === "rejected" ? "bg-red-500/10 text-red-400 border border-red-500/20" :
                            "bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse"
                          }`}>
                            {wit.status}
                          </span>
                          <div className="text-[9px] text-gray-500 mt-1.5 leading-tight">
                            Requested: {new Date(wit.created_at).toLocaleDateString()}<br/>
                            {wit.reviewed_at && <>Reviewed: {new Date(wit.reviewed_at).toLocaleDateString()}<br/></>}
                            {wit.reviewed_by && <>By: {wit.reviewed_by}</>}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-gray-300 max-w-xs break-words">
                          {wit.admin_note || <span className="text-gray-600 italic">No notes from admin</span>}
                        </td>
                        <td className="px-5 py-4 text-right">
                          {wit.status === "pending" ? (
                            <div className="flex flex-col gap-1.5 max-w-[200px] ml-auto">
                              <input
                                type="text"
                                placeholder="Add review note..."
                                value={reviewNoteMap[wit.id] || ""}
                                onChange={(e) => setReviewNoteMap(prev => ({ ...prev, [wit.id]: e.target.value }))}
                                className="px-2 py-1 bg-[#06101c] border border-[#2f4553]/40 rounded text-white text-[10px] focus:outline-none focus:border-[#00ca6f] placeholder:text-gray-600"
                              />
                              <div className="flex gap-1">
                                <button
                                  onClick={() => handleReviewWithdrawal(wit.id, false)}
                                  disabled={reviewLoadingId === wit.id}
                                  className="w-1/2 py-1 bg-red-500/20 border border-red-500/30 hover:bg-red-500 text-red-400 hover:text-white font-extrabold uppercase text-[9px] rounded transition active:scale-95 disabled:opacity-50"
                                >
                                  Reject
                                </button>
                                <button
                                  onClick={() => handleReviewWithdrawal(wit.id, true)}
                                  disabled={reviewLoadingId === wit.id}
                                  className="w-1/2 py-1 bg-[#00ca6f]/20 border border-[#00ca6f]/30 hover:bg-[#00ca6f] text-[#00ca6f] hover:text-[#06101c] font-extrabold uppercase text-[9px] rounded transition active:scale-95 disabled:opacity-50"
                                >
                                  Approve
                                </button>
                              </div>
                            </div>
                          ) : (
                            <span className="text-gray-500 text-[10px] italic">No actions</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
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
                <span className="text-[#00ca6f] font-mono font-extrabold text-xs block mt-0.5">
                  Current Wallet Balance: {getSelectedCurrencyBalance().toLocaleString("en-US", { maximumFractionDigits: 8 })} {adjustCurrency}
                </span>
              </div>

              {/* Select Currency dropdown */}
              <div>
                <label className="block text-gray-400 text-[10px] uppercase font-bold tracking-widest mb-1.5">
                  Select Currency to Adjust
                </label>
                <select
                  value={adjustCurrency}
                  onChange={(e) => setAdjustCurrency(e.target.value)}
                  className="w-full px-4 py-2.5 bg-[#06101c] border border-[#2f4553]/40 rounded-xl text-white font-medium text-xs focus:outline-none focus:border-[#00ca6f]/60 transition"
                >
                  <option value="USDT">USDT (Tether)</option>
                  <option value="BTC">BTC (Bitcoin)</option>
                  <option value="ETH">ETH (Ethereum)</option>
                  <option value="LTC">LTC (Litecoin)</option>
                  <option value="SOL">SOL (Solana)</option>
                  <option value="DOGE">DOGE (Dogecoin)</option>
                  <option value="BCH">BCH (Bitcoin Cash)</option>
                  <option value="XRP">XRP (Ripple)</option>
                  <option value="INR">INR (Rupee)</option>
                </select>
              </div>

              {/* Amount input */}
              <div>
                <label className="block text-gray-400 text-[10px] uppercase font-bold tracking-widest mb-1.5">
                  Adjustment Amount ({adjustCurrency})
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
                  TIP: Balance badhane ke liye seedha number (e.g. 100), aur balance ghataney ke liye minus (-) prefix karein (e.g. -50).
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
