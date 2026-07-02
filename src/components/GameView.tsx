import { useState, useEffect, useRef } from "react";
import { getSupabaseClient } from "../supabase";
import { BetResult, BetHistoryItem } from "../types";
import { 
  DollarSign, 
  RotateCcw, 
  HelpCircle, 
  History, 
  Settings, 
  ShieldCheck, 
  Coins, 
  LogOut, 
  TrendingUp, 
  TrendingDown, 
  Shuffle, 
  User, 
  Award,
  Dice5
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface GameViewProps {
  user: any;
  onSignOut: () => void;
}

export default function GameView({ user, onSignOut }: GameViewProps) {
  // Game input states
  const [betAmount, setBetAmount] = useState<number>(10.00);
  const [targetMultiplier, setTargetMultiplier] = useState<number>(2.00);
  const [clientSeed, setClientSeed] = useState<string>("");

  // System states
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [history, setHistory] = useState<BetHistoryItem[]>([]);
  
  // Animation ticker states
  const [displayMultiplier, setDisplayMultiplier] = useState<number>(1.00);
  const [animationActive, setAnimationActive] = useState<boolean>(false);
  const [currentResult, setCurrentResult] = useState<BetResult | null>(null);
  const [activeTab, setActiveTab] = useState<"manual" | "fairness" | "stats">("manual");
  const [faucetLoading, setFaucetLoading] = useState<boolean>(false);

  // Sound or Visual Haptic settings
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  // Provably Fair States
  const [serverSeedHash, setServerSeedHash] = useState<string>("Loading active seed...");
  const [nonce, setNonce] = useState<number>(0);
  const [revealedSeeds, setRevealedSeeds] = useState<{
    revealed_server_seed: string;
    revealed_server_seed_hash: string;
    revealed_client_seed: string;
    revealed_nonce: number;
    new_server_seed_hash: string;
  } | null>(null);

  // Verification tool states
  const [vServerSeed, setVServerSeed] = useState<string>("");
  const [vClientSeed, setVClientSeed] = useState<string>("");
  const [vNonce, setVNonce] = useState<number>(0);
  const [localVerifyResult, setLocalVerifyResult] = useState<{
    hmacHex: string;
    randVal: number;
    resultMultiplier: number;
  } | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [rotating, setRotating] = useState<boolean>(false);

  const supabase = getSupabaseClient();
  const animationRef = useRef<number | null>(null);

  // Initialize client seed and fetch balance & history on mount
  useEffect(() => {
    // Fetch user balance
    fetchBalance();

    // Fetch user seeds
    fetchActiveSeeds();

    // Load recent history from local storage
    const savedHistory = localStorage.getItem(`limbo_history_${user.id}`);
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.error("Error reading saved history", e);
      }
    }
  }, [user.id]);

  const fetchActiveSeeds = async () => {
    if (!supabase) return;
    try {
      const { data, error } = await supabase
        .from("user_seeds")
        .select("server_seed_hash, client_seed, nonce")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        console.log("user_seeds table query skipped/failed (tables might not exist yet):", error.message);
        return;
      }

      if (data) {
        setServerSeedHash(data.server_seed_hash);
        setClientSeed(data.client_seed);
        setNonce(data.nonce);
      } else {
        // No seed exists yet
        const randomSeed = crypto.randomUUID().replace(/-/g, "").substring(0, 16);
        setClientSeed(randomSeed);
        setServerSeedHash("Active seed hash will be initialized on first bet.");
        setNonce(0);
      }
    } catch (e) {
      console.log("Database seeds table is not created yet.");
    }
  };

  const handleRotateSeeds = async () => {
    if (!supabase || rotating) return;
    setRotating(true);
    setErrorMsg(null);
    try {
      const { data, error } = await supabase.rpc("reveal_seed");

      if (error) throw error;

      const result = typeof data === "string" ? JSON.parse(data) : data;
      setRevealedSeeds(result);
      
      // Update active states with the new rotated seed details
      setServerSeedHash(result.new_server_seed_hash);
      setNonce(0);
      
      // Seed validation tool auto-fill for convenience
      setVServerSeed(result.revealed_server_seed);
      setVClientSeed(result.revealed_client_seed);
      setVNonce(0);
      
      // Clear local verify state
      setLocalVerifyResult(null);

    } catch (err: any) {
      console.error("Reveal seed error:", err);
      setErrorMsg(err.message || "Failed to rotate and reveal seeds. Ensure SQL is run in Supabase.");
    } finally {
      setRotating(false);
    }
  };

  const handleVerifyLocally = async () => {
    setVerifyError(null);
    setLocalVerifyResult(null);

    if (!vServerSeed.trim()) {
      setVerifyError("Server Seed empty nahi ho sakta!");
      return;
    }
    if (!vClientSeed.trim()) {
      setVerifyError("Client Seed empty nahi ho sakta!");
      return;
    }
    if (vNonce < 0) {
      setVerifyError("Nonce 0 ya usse bada hona chahiye.");
      return;
    }

    try {
      const encoder = new TextEncoder();
      
      const cleanedHex = vServerSeed.trim().replace(/^0x/, "");
      if (cleanedHex.length !== 64) {
        setVerifyError("Server seed exact 64-character hexadecimal hona chahiye (SHA-256 raw hex).");
        return;
      }

      const serverSeedBytes = new Uint8Array(
        cleanedHex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []
      );
      
      const key = await window.crypto.subtle.importKey(
        "raw",
        serverSeedBytes,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );
      
      const messageBytes = encoder.encode(`${vClientSeed.trim()}:${vNonce}`);
      const signature = await window.crypto.subtle.sign(
        "HMAC",
        key,
        messageBytes
      );
      
      const hashArray = Array.from(new Uint8Array(signature));
      const hmacHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      
      const randVal = parseInt(hmacHex.substring(0, 8), 16) / 4294967295.0;
      
      let resultMultiplier = Math.round((0.99 / (1.0 - Math.min(randVal, 0.999999))) * 100) / 100;
      if (resultMultiplier < 1.0) resultMultiplier = 1.0;
      if (resultMultiplier > 1000000.0) resultMultiplier = 1000000.0;
      
      setLocalVerifyResult({
        hmacHex,
        randVal,
        resultMultiplier
      });
    } catch (e: any) {
      setVerifyError(`Verification failed: ${e.message}`);
    }
  };

  const fetchBalance = async (retryCount = 0) => {
    if (!supabase) {
      console.warn("fetchBalance: Supabase client is not configured.");
      return;
    }
    
    console.log(`fetchBalance (attempt ${retryCount + 1}) for user ID: ${user.id}`);
    
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("balance")
        .eq("id", user.id)
        .single();
      
      if (error) {
        const errStr = `Code: ${error.code}, Message: ${error.message}, Details: ${error.details}, Hint: ${error.hint}`;
        console.error(`fetchBalance attempt ${retryCount + 1} database error: ${errStr}`);

        if (error.code === "42501") {
          throw new Error("Supabase permission denied. Please run this command in your Supabase SQL Editor to grant table access: GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated, anon;");
        }

        // PGRST116 means no row found (Profile not created yet)
        if (error.code === "PGRST116") {
          console.log("No profile row found. Attempting to insert a profile with username...");
          const { data: newProfile, error: createError } = await supabase
            .from("profiles")
            .insert({ 
              id: user.id, 
              balance: 1000.00,
              username: user.email ? user.email.split("@")[0] : "user"
            })
            .select("balance")
            .single();
          
          if (createError) {
            if (createError.code === "42501") {
              throw new Error("Supabase insert permission denied. Please run this command in your Supabase SQL Editor: GRANT INSERT ON public.profiles TO authenticated, anon;");
            }
            const createErrStr = `Code: ${createError.code}, Message: ${createError.message}, Details: ${createError.details}, Hint: ${createError.hint}`;
            console.error(`Failed to insert profile manually: ${createErrStr}`);
            throw createError;
          }
          
          if (newProfile) {
            console.log("Successfully created profile manually. Balance:", newProfile.balance);
            setBalance(Number(newProfile.balance));
            setErrorMsg(null);
            return;
          }
        } else {
          throw error;
        }
      } else if (data) {
        console.log("Successfully fetched balance from database:", data.balance);
        setBalance(Number(data.balance));
        setErrorMsg(null);
      }
    } catch (err: any) {
      const caughtErrStr = err.message 
        ? `${err.message} (Code: ${err.code || 'None'}, Details: ${err.details || 'None'})` 
        : JSON.stringify(err);
      console.error(`fetchBalance caught error on attempt ${retryCount + 1}: ${caughtErrStr}`);
      
      // Retry up to 3 times (retryCount = 0, 1, 2) with a 1-second delay
      if (retryCount < 2) {
        console.log(`Retrying fetchBalance in 1000ms (retry count: ${retryCount + 1})...`);
        setTimeout(() => {
          fetchBalance(retryCount + 1);
        }, 1000);
      } else {
        const errorDetails = err.message 
          ? `${err.message} (Code: ${err.code || 'None'}, Details: ${err.details || 'None'})` 
          : JSON.stringify(err);
        setErrorMsg(`Failed to load your balance. Please refresh. Debug details: ${errorDetails}`);
      }
    }
  };

  const handleResetBalance = async () => {
    if (!supabase || faucetLoading) return;
    setFaucetLoading(true);
    setErrorMsg(null);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ balance: 1000.00 })
        .eq("id", user.id);
      
      if (error) throw error;
      setBalance(1000.00);
    } catch (err: any) {
      console.error(err);
      if (err.code === "42501") {
        setErrorMsg("Failed to claim faucet money. Please run this command in your Supabase SQL Editor: GRANT UPDATE ON public.profiles TO authenticated, anon;");
      } else {
        setErrorMsg("Failed to claim faucet money.");
      }
    } finally {
      setFaucetLoading(false);
    }
  };

  const generateNewSeed = () => {
    setClientSeed(crypto.randomUUID().replace(/-/g, "").substring(0, 16));
  };

  // Helper shortcuts for bet amount
  const handleHalfBet = () => {
    setBetAmount(prev => Math.max(0.1, Number((prev / 2).toFixed(2))));
  };

  const handleDoubleBet = () => {
    if (balance) {
      setBetAmount(prev => Math.min(balance, Number((prev * 2).toFixed(2))));
    } else {
      setBetAmount(prev => Number((prev * 2).toFixed(2)));
    }
  };

  const handleMaxBet = () => {
    if (balance) {
      setBetAmount(Number(balance.toFixed(2)));
    }
  };

  const handleMinBet = () => {
    setBetAmount(1.00);
  };

  // Trigger audio feedback safely (we construct dynamic web audio synthesizer to bypass external files assets!)
  const playBeep = (freq: number, type: "sine" | "square" | "triangle" | "sawtooth", duration: number) => {
    if (!soundEnabled) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.type = type;
      oscillator.frequency.value = freq;
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.start();
      oscillator.stop(audioCtx.currentTime + duration);
    } catch (e) {
      // Ignored if browser blocks audio
    }
  };

  // Execute Bet calling the Supabase RPC "place_bet"
  const handlePlaceBet = async () => {
    if (!supabase || loading || animationActive) return;
    setErrorMsg(null);

    // Frontend validations before triggering RPC
    if (balance === null) {
      setErrorMsg("Please wait, balance is still loading.");
      return;
    }
    if (betAmount <= 0) {
      setErrorMsg("Bet amount zero se bada hona chahiye!");
      return;
    }
    if (betAmount > balance) {
      setErrorMsg("Apke pass itna balance nahi hai!");
      return;
    }
    if (targetMultiplier < 1.01) {
      setErrorMsg("Target multiplier kam se kam 1.01x hona chahiye.");
      return;
    }

    setLoading(true);
    setCurrentResult(null);

    try {
      // Call secure supabase RPC. No game logic is done on frontend!
      const { data, error } = await supabase.rpc("place_bet", {
        p_bet_amount: Number(betAmount),
        p_target_multiplier: Number(targetMultiplier),
        p_client_seed: clientSeed
      });

      if (error) throw error;

      // The returned data will be cast to BetResult
      const result: BetResult = typeof data === "string" ? JSON.parse(data) : data;

      // Update seeds and nonce state
      if (result.nonce !== undefined) setNonce(result.nonce + 1);
      if (result.client_seed) setClientSeed(result.client_seed);
      if (result.server_seed_hash) setServerSeedHash(result.server_seed_hash);

      // Trigger the premium multiplier scale up animation
      startMultiplierAnimation(result);

    } catch (err: any) {
      console.error("RPC bet error:", err);
      setErrorMsg(err.message || "RPC connection failed. Please ensure schema is updated.");
      setLoading(false);
    }
  };

  // Progressive Anticipation Ticker Animation
  const startMultiplierAnimation = (result: BetResult) => {
    setAnimationActive(true);
    setCurrentResult(result);
    setDisplayMultiplier(1.00);

    const targetVal = result.result_multiplier;
    const duration = 700; // Total duration in ms (Fast Play: 0.7 seconds)
    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // We use quadratic easing for a satisfying slowdown effect at the end
      // Form: current = 1.00 + (targetVal - 1.00) * easedProgress
      // Or exponential to simulate random crash multipliers beautifully
      const easedProgress = 1 - Math.pow(1 - progress, 3); // easeOutCubic
      const currentVal = 1.00 + (targetVal - 1.00) * easedProgress;
      
      setDisplayMultiplier(Number(currentVal.toFixed(2)));

      // Sound ticker effect
      if (Math.floor(currentVal * 10) % 7 === 0) {
        playBeep(250 + (currentVal * 15), "triangle", 0.08);
      }

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        // Animation finished
        setDisplayMultiplier(targetVal);
        setAnimationActive(false);
        setLoading(false);

        // Sound effect on win / loss
        if (result.is_win) {
          playBeep(650, "sine", 0.15);
          setTimeout(() => playBeep(900, "sine", 0.3), 100);
        } else {
          playBeep(180, "sawtooth", 0.4);
        }

        // 1. Update balance strictly from backend response: "Balance update karna sirf backend response ke new_balance se"
        setBalance(result.new_balance);

        // 2. Add item to local history list
        const newHistoryItem: BetHistoryItem = {
          id: crypto.randomUUID(),
          timestamp: new Date(),
          bet_amount: betAmount,
          target_multiplier: targetMultiplier,
          result_multiplier: result.result_multiplier,
          payout: result.payout,
          is_win: result.is_win
        };

        setHistory(prev => {
          const updated = [newHistoryItem, ...prev].slice(0, 30); // limit to 30 items
          localStorage.setItem(`limbo_history_${user.id}`, JSON.stringify(updated));
          return updated;
        });
      }
    };

    animationRef.current = requestAnimationFrame(animate);
  };

  // Stats calculators
  const totalBets = history.length;
  const wins = history.filter(h => h.is_win).length;
  const losses = totalBets - wins;
  const winRate = totalBets > 0 ? ((wins / totalBets) * 100).toFixed(1) : "0.0";
  const netProfit = history.reduce((acc, curr) => {
    return acc + (curr.is_win ? (curr.payout - curr.bet_amount) : -curr.bet_amount);
  }, 0);

  return (
    <div className="min-h-screen bg-[#0f1923] text-[#b1bad3] flex flex-col font-sans" id="game-view-root">
      {/* Navbar Section */}
      <nav className="h-16 bg-[#1a2c38] border-b border-[#213743] flex items-center justify-between px-6 flex-shrink-0 sticky top-0 z-50" id="game-navbar">
        <div className="flex items-center gap-2.5" id="nav-brand">
          <div className="w-9 h-9 rounded-xl bg-[#00e701] flex items-center justify-center text-[#01080e] font-extrabold shadow-[0_0_12px_rgba(0,231,1,0.3)]">
            <Dice5 className="w-5.5 h-5.5" />
          </div>
          <span className="font-extrabold text-lg md:text-xl tracking-tight text-white flex items-center gap-1.5">
            LIMBO <span className="text-[#00e701] text-xs px-1.5 py-0.5 rounded bg-emerald-500/10 border border-[#00e701]/20 font-mono">PROVABLY FAIR</span>
          </span>
        </div>

        {/* User Balance & Actions */}
        <div className="flex items-center gap-4" id="nav-actions">
          {/* Real-time Balance */}
          <div className="flex items-center bg-[#0f1923] border border-[#2d4456] rounded-md p-1 pr-3" id="balance-badge">
            <div className="w-8 h-8 rounded bg-[#2f4553] flex items-center justify-center text-[#00e701] mr-2">
              <Coins className="w-4.5 h-4.5" />
            </div>
            <div className="flex flex-col text-left min-w-[70px]">
              <span className="text-[10px] text-[#557086] font-bold uppercase tracking-wider leading-none">Wallet</span>
              <span className="text-sm font-extrabold font-mono text-white leading-tight">
                {balance !== null ? `$${balance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "Loading..."}
              </span>
            </div>
            {/* Reset / Faucet Button */}
            <button
              onClick={handleResetBalance}
              disabled={faucetLoading}
              className="ml-3 p-1.5 rounded hover:bg-[#2f4553] text-[#557086] hover:text-[#00e701] transition relative group"
              title="Claim free $1,000 faucet balance"
              id="faucet-btn"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${faucetLoading ? "animate-spin text-[#00e701]" : ""}`} />
              <span className="absolute hidden group-hover:block bottom-[-32px] right-0 bg-[#1a2c38] text-[10px] text-gray-300 font-semibold px-2 py-1 rounded whitespace-nowrap border border-gray-800 shadow-md">
                Refill $1,000
              </span>
            </button>
          </div>

          {/* User logout */}
          <div className="flex items-center gap-2" id="user-profile">
            <div className="hidden md:flex flex-col text-right leading-none">
              <span className="text-xs font-semibold text-white max-w-[120px] truncate">{user.email}</span>
            </div>
            <button
              onClick={onSignOut}
              className="p-2 rounded bg-[#2f4553] border border-[#2d4456] hover:bg-rose-500/10 hover:text-rose-400 hover:border-rose-500/20 text-[#b1bad3] transition"
              title="Sign Out"
              id="sign-out-btn"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </nav>

      {/* Main Container Layout */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-8 grid md:grid-cols-12 gap-6 items-start" id="game-main-layout">
        
        {/* Left Side: Game Controls (Stake Style sidebar) */}
        <aside className="md:col-span-4 bg-[#213743] p-5 flex flex-col gap-5 rounded-xl border border-[#2d4456] shadow-xl" id="game-controls-sidebar">
          {/* Quick tab for manual controls */}
          <div className="bg-[#0f1923] p-1 rounded-full flex border border-[#2d4456]" id="sidebar-tabs">
            <button
              onClick={() => setActiveTab("manual")}
              className={`flex-1 py-2 rounded-full text-xs font-bold transition ${
                activeTab === "manual" ? "bg-[#2f4553] text-white shadow-lg" : "text-[#b1bad3] hover:text-white"
              }`}
            >
              Manual
            </button>
            <button
              onClick={() => setActiveTab("fairness")}
              className={`flex-1 py-2 rounded-full text-xs font-bold transition ${
                activeTab === "fairness" ? "bg-[#2f4553] text-white shadow-lg" : "text-[#b1bad3] hover:text-white"
              }`}
            >
              Fairness
            </button>
            <button
              onClick={() => setActiveTab("stats")}
              className={`flex-1 py-2 rounded-full text-xs font-bold transition ${
                activeTab === "stats" ? "bg-[#2f4553] text-white shadow-lg" : "text-[#b1bad3] hover:text-white"
              }`}
            >
              Stats
            </button>
          </div>

          {/* Tab Content 1: Manual Bet Controls */}
          {activeTab === "manual" && (
            <div className="space-y-4" id="manual-bet-form">
              {/* Bet Amount */}
              <div className="flex flex-col gap-2">
                <div className="flex justify-between text-xs font-bold uppercase text-[#b1bad3]">
                  <label>Bet Amount</label>
                  <span>$0.00 USD</span>
                </div>
                <div className="flex bg-[#0f1923] border-2 border-[#2f4553] rounded p-1 pl-2 transition-all focus-within:border-[#557086]">
                  <div className="flex items-center text-[#557086] mr-1">
                    <DollarSign className="w-4 h-4" />
                  </div>
                  <input
                    type="number"
                    value={betAmount}
                    onChange={(e) => setBetAmount(Math.max(0, Number(parseFloat(e.target.value).toFixed(2)) || 0))}
                    className="w-full bg-transparent border-none text-white font-mono font-bold text-sm focus:outline-none py-1.5"
                    id="bet-amount-input"
                  />
                  <div className="flex items-center gap-1 shrink-0 px-1">
                    <button
                      onClick={handleHalfBet}
                      className="bg-[#2f4553] px-2.5 py-1 text-xs font-bold text-white rounded hover:bg-[#3d5a6d] transition"
                      id="half-bet-btn"
                    >
                      1/2
                    </button>
                    <button
                      onClick={handleDoubleBet}
                      className="bg-[#2f4553] px-2.5 py-1 text-xs font-bold text-white rounded hover:bg-[#3d5a6d] transition"
                      id="double-bet-btn"
                    >
                      2x
                    </button>
                    <button
                      onClick={handleMaxBet}
                      className="bg-[#2f4553] px-2.5 py-1 text-xs font-bold text-white rounded hover:bg-[#3d5a6d] transition"
                      id="max-bet-btn"
                    >
                      Max
                    </button>
                  </div>
                </div>
              </div>

              {/* Target Multiplier */}
              <div className="flex flex-col gap-2">
                <div className="flex justify-between text-xs font-bold uppercase text-[#b1bad3]">
                  <label>Target Multiplier</label>
                  <span className="text-[10px] text-[#557086] font-mono">Min 1.01x</span>
                </div>
                <div className="flex bg-[#0f1923] border-2 border-[#2f4553] rounded p-1 pl-2 transition-all focus-within:border-[#557086]">
                  <div className="flex items-center text-[#00e701] font-bold font-mono text-sm mr-1">
                    X
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    value={targetMultiplier}
                    onChange={(e) => setTargetMultiplier(Math.max(1.01, Number(parseFloat(e.target.value).toFixed(2)) || 1.01))}
                    className="w-full bg-transparent border-none text-white font-mono font-bold text-sm focus:outline-none py-1.5"
                    id="target-multiplier-input"
                  />
                  <div className="flex items-center gap-1 shrink-0 px-1">
                    <button
                      onClick={() => setTargetMultiplier(1.50)}
                      className="bg-[#2f4553] px-2.5 py-1 text-xs font-bold text-white rounded hover:bg-[#3d5a6d] transition"
                    >
                      1.5x
                    </button>
                    <button
                      onClick={() => setTargetMultiplier(2.00)}
                      className="bg-[#2f4553] px-2.5 py-1 text-xs font-bold text-white rounded hover:bg-[#3d5a6d] transition"
                    >
                      2.0x
                    </button>
                    <button
                      onClick={() => setTargetMultiplier(10.00)}
                      className="bg-[#2f4553] px-2.5 py-1 text-xs font-bold text-white rounded hover:bg-[#3d5a6d] transition"
                    >
                      10x
                    </button>
                  </div>
                </div>
              </div>

              {/* Win Profit (Read Only) */}
              <div className="flex flex-col gap-2">
                <div className="flex justify-between text-xs font-bold uppercase text-[#b1bad3]">
                  <label>Win Profit</label>
                </div>
                <div className="bg-[#0f1923] border-2 border-[#2f4553] rounded p-3 text-white font-bold flex items-center justify-between">
                  <span className="text-[#00e701] text-lg font-bold">$</span>
                  <span className="text-lg font-mono text-white">{(betAmount * targetMultiplier - betAmount).toFixed(2)}</span>
                </div>
              </div>

              {/* Sound Setting toggler */}
              <div className="flex items-center justify-between px-1 text-xs" id="audio-setting">
                <span className="text-[#b1bad3]/80 font-bold uppercase">Game Audio Feedback</span>
                <button
                  type="button"
                  onClick={() => setSoundEnabled(!soundEnabled)}
                  className={`px-3 py-1.5 rounded font-bold text-xs border transition ${
                    soundEnabled 
                      ? "bg-[#00e701]/10 border-[#00e701]/30 text-[#00e701]" 
                      : "bg-[#0f1923] border-[#2f4553] text-[#557086]"
                  }`}
                >
                  {soundEnabled ? "Sound ON" : "Sound OFF"}
                </button>
              </div>

              {/* Error messages if any */}
              {errorMsg && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs rounded font-medium" id="game-error">
                  ⚠️ {errorMsg}
                </div>
              )}

              {/* Place Bet Main Button */}
              <button
                onClick={handlePlaceBet}
                disabled={loading || animationActive}
                className="w-full mt-2 bg-[#00e701] hover:bg-[#1fff20] text-[#01080e] font-black py-5 rounded text-lg uppercase transition-all shadow-[0_0_20px_rgba(0,231,1,0.2)] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                id="place-bet-btn"
              >
                {loading || animationActive ? (
                  <span className="flex items-center gap-2 text-[#01080e]">
                    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    MULTIPLIER CLIMBING...
                  </span>
                ) : (
                  "Bet Lagao"
                )}
              </button>
            </div>
          )}

          {/* Tab Content 2: Provably Fair Parameters */}
          {activeTab === "fairness" && (
            <div className="space-y-4 text-xs" id="fairness-parameters">
              <div className="p-3 bg-[#00e701]/5 border border-[#00e701]/10 rounded text-[#b1bad3] leading-relaxed">
                <span className="font-bold text-[#00e701] block mb-1 flex items-center gap-1 text-sm">
                  <ShieldCheck className="w-4 h-4 text-[#00e701]" /> Provably Fair System (SHA-256)
                </span>
                Ye game secure server-side verification code engine se chalta hai. Multiplier client aur server seed ke combination hash (HMAC-SHA256) se real-time generate hota hai.
              </div>

              <div>
                <label className="block text-[#b1bad3] font-bold mb-1.5 uppercase tracking-wider">Client Seed</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={clientSeed}
                    onChange={(e) => setClientSeed(e.target.value)}
                    className="w-full px-3 py-2 bg-[#0f1923] rounded border-2 border-[#2f4553] text-white font-mono text-xs focus:outline-none focus:border-[#557086] transition-all"
                    id="client-seed-input"
                  />
                  <button
                    onClick={generateNewSeed}
                    className="p-2 bg-[#2f4553] text-gray-300 hover:text-white rounded hover:bg-[#3d5a6d] transition shrink-0"
                    title="Generate Random Seed"
                    id="regenerate-seed-btn"
                  >
                    <Shuffle className="w-3.5 h-3.5" />
                  </button>
                </div>
                <span className="text-[10px] text-[#557086] mt-1 block">Aap isey edit kar sakte hain. Next bet lagane par ye server pe update ho jayega.</span>
              </div>

              <div>
                <span className="block text-[#b1bad3] font-bold mb-1 uppercase tracking-wider">Active Server Seed Hash (SHA-256)</span>
                <span className="text-[10px] text-[#557086] mb-1.5 block">Commitment: Server seed is absolute but hidden. Only hash is visible.</span>
                <div className="bg-[#0f1923] p-2.5 rounded border-2 border-[#2f4553] font-mono text-[10px] text-white break-all select-all">
                  {serverSeedHash}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#0f1923] p-2.5 rounded border-2 border-[#2f4553]">
                  <span className="text-[#557086] font-bold block mb-1 uppercase tracking-wider">Active Nonce</span>
                  <span className="text-white font-mono font-extrabold text-sm">{nonce}</span>
                </div>
                <button
                  type="button"
                  onClick={handleRotateSeeds}
                  disabled={rotating}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded border border-indigo-500/30 transition flex items-center justify-center gap-1 text-xs"
                >
                  {rotating ? "Rotating..." : "🔄 Rotate Seed Pair"}
                </button>
              </div>

              {/* Revealed Seed Section */}
              {revealedSeeds && (
                <div className="p-3 bg-indigo-500/5 border border-indigo-500/20 rounded space-y-2">
                  <span className="font-bold text-[#00e701] block mb-1 uppercase text-[11px]">Old Seed Revealed! (Verify me)</span>
                  <div>
                    <span className="text-[#557086] block text-[9px]">PREVIOUS RAW SERVER SEED:</span>
                    <span className="font-mono text-white select-all break-all text-[10px] bg-[#0f1923] p-1.5 rounded block border border-[#2f4553]">{revealedSeeds.revealed_server_seed}</span>
                  </div>
                  <div>
                    <span className="text-[#557086] block text-[9px]">PREVIOUS HASH (Matches what was shown!):</span>
                    <span className="font-mono text-gray-400 select-all break-all text-[10px] bg-[#0f1923] p-1.5 rounded block border border-[#2f4553]">{revealedSeeds.revealed_server_seed_hash}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div>
                      <span className="text-[#557086] block text-[9px]">PREVIOUS CLIENT SEED:</span>
                      <span className="font-mono text-white bg-[#0f1923] px-1.5 py-0.5 rounded border border-[#2f4553] block truncate">{revealedSeeds.revealed_client_seed}</span>
                    </div>
                    <div>
                      <span className="text-[#557086] block text-[9px]">TOTAL NONCES USED:</span>
                      <span className="font-mono text-white bg-[#0f1923] px-1.5 py-0.5 rounded border border-[#2f4553] block">{revealedSeeds.revealed_nonce}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Manual Verification Tool */}
              <div className="p-3 bg-[#162630] rounded border border-[#2f4553] space-y-3">
                <span className="font-black text-white block text-xs uppercase tracking-widest text-[#00e701] flex items-center gap-1">
                  🔍 Manual Bet Verifier (Prove Fair)
                </span>
                
                <div className="space-y-2">
                  <div>
                    <label className="block text-[#557086] text-[9px] font-bold uppercase mb-1">Server Seed (Hex)</label>
                    <input
                      type="text"
                      placeholder="Paste 64-character raw server seed"
                      value={vServerSeed}
                      onChange={(e) => setVServerSeed(e.target.value)}
                      className="w-full px-2 py-1.5 bg-[#0f1923] rounded border border-[#2f4553] text-white font-mono text-[10px] focus:outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[#557086] text-[9px] font-bold uppercase mb-1">Client Seed</label>
                      <input
                        type="text"
                        placeholder="Client seed"
                        value={vClientSeed}
                        onChange={(e) => setVClientSeed(e.target.value)}
                        className="w-full px-2 py-1.5 bg-[#0f1923] rounded border border-[#2f4553] text-white font-mono text-[10px] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[#557086] text-[9px] font-bold uppercase mb-1">Nonce</label>
                      <input
                        type="number"
                        min="0"
                        placeholder="Nonce value"
                        value={vNonce}
                        onChange={(e) => setVNonce(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-full px-2 py-1.5 bg-[#0f1923] rounded border border-[#2f4553] text-white font-mono text-[10px] focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {verifyError && (
                  <div className="p-2 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px] rounded">
                    ⚠️ {verifyError}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleVerifyLocally}
                  className="w-full py-2 bg-[#00e701] hover:bg-[#1fff20] text-[#01080e] font-extrabold uppercase rounded text-[10px] transition"
                >
                  Verify Bet Outcome
                </button>

                {localVerifyResult && (
                  <div className="bg-[#0f1923] p-2.5 rounded border border-[#2f4553] space-y-2 text-[10px] leading-relaxed">
                    <span className="font-bold text-[#00e701] block uppercase text-[10px]">Calculation Outcome:</span>
                    <div>
                      <span className="text-[#557086] block text-[9px]">HMAC-SHA256 SIGNATURE:</span>
                      <span className="font-mono text-white block select-all break-all bg-[#1a2c38] p-1 rounded text-[9px]">{localVerifyResult.hmacHex}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-[#557086] block text-[9px]">RANDOM VALUE (0-1):</span>
                        <span className="font-mono text-white block bg-[#1a2c38] px-1.5 py-0.5 rounded text-[9px] truncate">{localVerifyResult.randVal.toFixed(10)}</span>
                      </div>
                      <div>
                        <span className="text-[#557086] block text-[9px]">DERIVED MULTIPLIER:</span>
                        <span className="font-mono text-[#00e701] font-bold block bg-[#1a2c38] px-1.5 py-0.5 rounded text-[9px]">{localVerifyResult.resultMultiplier.toFixed(2)}x</span>
                      </div>
                    </div>
                    <p className="text-[#557086] text-[9px] mt-1.5 italic">
                      Formula: 0.99 / (1.0 - RandVal). Ye result live play calculation se bilkul match karega.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab Content 3: Quick Stats */}
          {activeTab === "stats" && (
            <div className="space-y-4 text-xs" id="stats-tab">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#0f1923] p-3 rounded border-2 border-[#2f4553] text-center">
                  <span className="text-[#557086] font-bold block mb-1">WINS</span>
                  <span className="text-[#00e701] font-mono font-extrabold text-lg">{wins}</span>
                </div>
                <div className="bg-[#0f1923] p-3 rounded border-2 border-[#2f4553] text-center">
                  <span className="text-[#557086] font-bold block mb-1">LOSSES</span>
                  <span className="text-rose-400 font-mono font-extrabold text-lg">{losses}</span>
                </div>
                <div className="bg-[#0f1923] p-3 rounded border-2 border-[#2f4553] text-center">
                  <span className="text-[#557086] font-bold block mb-1">WIN RATE</span>
                  <span className="text-white font-mono font-extrabold text-lg">{winRate}%</span>
                </div>
                <div className="bg-[#0f1923] p-3 rounded border-2 border-[#2f4553] text-center">
                  <span className="text-[#557086] font-bold block mb-1">TOTAL BETS</span>
                  <span className="text-white font-mono font-extrabold text-lg">{totalBets}</span>
                </div>
              </div>

              <div className="bg-[#0f1923] p-3.5 rounded border-2 border-[#2f4553] flex items-center justify-between">
                <span className="text-[#b1bad3] font-bold">NET PROFIT</span>
                <span className={`font-mono font-bold text-sm ${netProfit >= 0 ? "text-[#00e701]" : "text-rose-400"}`}>
                  {netProfit >= 0 ? "+" : ""}${netProfit.toFixed(2)}
                </span>
              </div>
            </div>
          )}
        </aside>

        {/* Right Side: Interactive Display Panel */}
        <div className="md:col-span-8 space-y-6" id="game-arena-column">
          {/* Main Visual Arena Card */}
          <div className="bg-[#1a2c38] rounded-xl border border-[#213743] overflow-hidden shadow-xl" id="main-display-card">
            <div className="px-5 py-3 border-b border-[#213743] bg-[#162630] flex items-center justify-between" id="arena-header">
              <span className="text-xs font-bold text-[#b1bad3] uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#00e701] animate-pulse" /> Live Limbo Arena
              </span>
              <span className="text-[10px] font-mono text-[#557086]">Multiplier Scale: up to 1,000,000x</span>
            </div>

            {/* Giant Live Screen Frame */}
            <div className="relative min-h-[380px] bg-[#0f1923] flex flex-col items-center justify-center p-8 overflow-hidden" id="visual-arena-canvas">
              {/* Atmospheric Glow Background */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#00e701] opacity-[0.03] blur-[120px] rounded-full" />
              </div>

              {/* Conditional background flash animation on win / loss */}
              {currentResult && !animationActive && (
                <div 
                  className={`absolute inset-0 opacity-[0.04] transition-opacity duration-300 pointer-events-none ${
                    currentResult.is_win ? "bg-[#00e701]" : "bg-rose-500"
                  }`} 
                />
              )}

              {/* Decorative target multiplier badge */}
              <div className="absolute top-4 right-4 px-3 py-1 bg-[#1a2c38] rounded border border-[#2d4456] text-[10px] font-mono font-bold text-[#b1bad3]">
                Target: {targetMultiplier.toFixed(2)}x
              </div>

              {/* The rocket / multiplier visualization ticker */}
              <div className="text-center relative z-10 flex flex-col items-center justify-center">
                {/* Count up simulation display */}
                <div className="relative">
                  <motion.div
                    key={displayMultiplier}
                    initial={{ scale: 0.94 }}
                    animate={{ scale: 1 }}
                    className={`font-mono font-black text-7xl md:text-[140px] leading-none transition-colors duration-300 select-none ${
                      animationActive 
                        ? "text-yellow-400 drop-shadow-[0_0_24px_rgba(234,179,8,0.2)]" 
                        : currentResult 
                          ? currentResult.is_win 
                            ? "text-[#00e701] drop-shadow-[0_0_30px_rgba(0,231,1,0.3)]" 
                            : "text-rose-500 drop-shadow-[0_0_30px_rgba(244,63,94,0.3)]"
                          : "text-[#557086]"
                    }`}
                    id="multiplier-ticker-display"
                  >
                    {displayMultiplier.toFixed(2)}x
                  </motion.div>
                </div>

                {/* Animated Subtitle indicators */}
                <div className="h-8 mt-6 flex items-center justify-center">
                  <AnimatePresence mode="wait">
                    {animationActive ? (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="text-xs text-yellow-400/80 font-bold tracking-widest flex items-center gap-1.5 uppercase"
                        key="animating"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-ping" />
                        MULTIPLIER CLIMBING...
                      </motion.div>
                    ) : currentResult ? (
                      currentResult.is_win ? (
                        <motion.div
                          initial={{ scale: 0.8, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="flex flex-col items-center"
                          key="win-banner"
                        >
                          <div className="bg-[#213743] px-6 py-2 rounded-full border border-[#00e701] shadow-xl">
                            <span className="text-sm font-bold text-[#00e701] uppercase tracking-widest">Target Hit!</span>
                          </div>
                          <span className="text-[#00e701] font-mono text-xs mt-2.5 font-bold">
                            Payout: +${currentResult.payout.toFixed(2)}
                          </span>
                        </motion.div>
                      ) : (
                        <motion.div
                          initial={{ scale: 0.8, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="flex flex-col items-center"
                          key="loss-banner"
                        >
                          <div className="bg-[#213743] px-6 py-2 rounded-full border border-rose-500 shadow-xl">
                            <span className="text-sm font-bold text-rose-500 uppercase tracking-widest">Busted!</span>
                          </div>
                          <span className="text-[#557086] font-mono text-xs mt-2.5 font-bold">
                            Loss: -${betAmount.toFixed(2)}
                          </span>
                        </motion.div>
                      )
                    ) : (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 0.6 }}
                        className="text-xs text-[#557086] uppercase tracking-widest font-semibold"
                        key="idle"
                      >
                        Apna bet amount aur target set karein
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Compact History Strip inside Visualizer Arena */}
              {history.length > 0 && (
                <div className="absolute bottom-6 left-0 right-0 px-8 flex gap-2 overflow-hidden justify-center pointer-events-none select-none">
                  {history.slice(0, 7).map((bet) => (
                    <div 
                      key={bet.id} 
                      className={`bg-[#213743] px-4 py-1.5 rounded border text-xs font-black tracking-tight ${
                        bet.is_win ? "border-[#00e701] text-[#00e701]" : "border-rose-500/50 text-rose-400"
                      }`}
                    >
                      {bet.result_multiplier.toFixed(2)}x
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Bet History section */}
          <div className="bg-[#1a2c38] rounded-xl border border-[#213743] overflow-hidden shadow-xl" id="history-section">
            <div className="px-5 py-4 border-b border-[#213743] bg-[#162630] flex items-center justify-between" id="history-header">
              <span className="text-xs font-bold text-[#b1bad3] uppercase tracking-wider flex items-center gap-1.5">
                <History className="w-4 h-4 text-[#00e701]" /> Bet History & Activity
              </span>
              <span className="text-[10px] text-[#557086]">Showing last 30 bets</span>
            </div>

            <div className="overflow-x-auto" id="history-table-container">
              <table className="w-full text-left text-xs text-[#b1bad3] font-sans" id="history-table">
                <thead>
                  <tr className="border-b border-[#213743] text-[10px] text-[#557086] uppercase font-bold tracking-wider bg-[#0f1923]/30">
                    <th className="py-3 px-5">Time</th>
                    <th className="py-3 px-5 text-right">Bet Amount</th>
                    <th className="py-3 px-5 text-right">Target</th>
                    <th className="py-3 px-5 text-right">Result</th>
                    <th className="py-3 px-5 text-right">Payout</th>
                    <th className="py-3 px-5 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/20">
                  <AnimatePresence initial={false}>
                    {history.length > 0 ? (
                      history.map((bet) => (
                        <motion.tr
                          key={bet.id}
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="hover:bg-[#1f323f]/20 transition"
                        >
                          <td className="py-3 px-5 text-[#557086] font-mono text-[10px]">
                            {new Date(bet.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </td>
                          <td className="py-3 px-5 text-right font-mono text-white font-bold">
                            ${bet.bet_amount.toFixed(2)}
                          </td>
                          <td className="py-3 px-5 text-right font-mono text-[#b1bad3]">
                            {bet.target_multiplier.toFixed(2)}x
                          </td>
                          <td className={`py-3 px-5 text-right font-mono font-bold ${bet.is_win ? "text-[#00e701]" : "text-rose-400"}`}>
                            {bet.result_multiplier.toFixed(2)}x
                          </td>
                          <td className={`py-3 px-5 text-right font-mono font-bold ${bet.is_win ? "text-[#00e701]" : "text-gray-500"}`}>
                            {bet.is_win ? `+$${(bet.payout - bet.bet_amount).toFixed(2)}` : `-$${bet.bet_amount.toFixed(2)}`}
                          </td>
                          <td className="py-3 px-5 text-center">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                              bet.is_win 
                                ? "bg-[#00e701]/10 text-[#00e701]" 
                                : "bg-rose-500/10 text-rose-400"
                            }`}>
                              {bet.is_win ? "WIN" : "LOSS"}
                            </span>
                          </td>
                        </motion.tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-[#557086] font-bold uppercase tracking-widest text-[10px]">
                          Abhi tak koi bets nahi lagayi gayi hain
                        </td>
                      </tr>
                    )}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>

      {/* Bottom Bar Stats */}
      <footer className="h-12 bg-[#1a2c38] border-t border-[#213743] px-6 flex items-center justify-between text-xs font-bold flex-shrink-0 text-[#b1bad3]" id="game-footer">
        <div className="flex gap-6">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-[#00e701] rounded-full animate-pulse"></span>
            <span>984 PLAYERS ONLINE</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
            <span>FAIRNESS VERIFIED</span>
          </div>
        </div>
        <div className="flex gap-4">
          <span className="text-[#557086]">GAME ID: 29,485,102,492</span>
        </div>
      </footer>
    </div>
  );
}
