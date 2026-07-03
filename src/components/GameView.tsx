import React, { useState, useEffect, useRef } from "react";
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
  Dice5,
  ArrowRightLeft,
  X,
  CreditCard,
  Grid
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { 
  useExchangeRates, 
  SUPPORTED_ACTIVE_CURRENCIES, 
  SUPPORTED_FIAT_CURRENCIES,
  ActiveCurrency,
  DisplayFiatCurrency
} from "../hooks/useExchangeRates";

interface GameViewProps {
  user: any;
  onSignOut: () => void;
}

const FAUCET_AMOUNTS: Record<string, number> = {
  USDT: 1000.0,
  INR: 50000.0,
  BTC: 0.01,
  ETH: 0.1,
  LTC: 5.0,
  SOL: 2.0,
  DOGE: 1000.0,
  BCH: 1.0,
  XRP: 500.0
};

async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export default function GameView({ user, onSignOut }: GameViewProps) {
  // Exchange rates hook
  const { convert, formatValue, loadingRates, pricesInUSD } = useExchangeRates();

  // Multi-Currency wallet states
  const [activeCurrency, setActiveCurrency] = useState<string>("USDT");
  const [balances, setBalances] = useState<Record<string, number>>({
    USDT: 0, INR: 0, BTC: 0, ETH: 0, LTC: 0, SOL: 0, DOGE: 0, BCH: 0, XRP: 0
  });
  const [hideZeroBalances, setHideZeroBalances] = useState<boolean>(false);
  const [displayCryptoInFiat, setDisplayCryptoInFiat] = useState<boolean>(false);
  const [selectedFiatCurrency, setSelectedFiatCurrency] = useState<string>("USD");
  const [isWalletDropdownOpen, setIsWalletDropdownOpen] = useState<boolean>(false);
  const [isWalletSettingsOpen, setIsWalletSettingsOpen] = useState<boolean>(false);
  const [walletSettingsTab, setWalletSettingsTab] = useState<"overview" | "buy" | "swap">("overview");

  // Game input states
  const [betAmount, setBetAmount] = useState<number>(10.00);
  const [targetMultiplier, setTargetMultiplier] = useState<number>(2.00);
  const [clientSeed, setClientSeed] = useState<string>("");

  // Derived balance constant based on selected active currency to preserve existing codebase logic
  const balance = balances[activeCurrency] ?? 0;

  // Swap Form states
  const [swapSource, setSwapSource] = useState<string>("USDT");
  const [swapDest, setSwapDest] = useState<string>("BTC");
  const [swapAmount, setSwapAmount] = useState<string>("");
  const [swapLoading, setSwapLoading] = useState<boolean>(false);
  const [swapError, setSwapError] = useState<string | null>(null);
  const [swapSuccess, setSwapSuccess] = useState<string | null>(null);

  // System states
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

  // Load preferences on mount
  useEffect(() => {
    const savedActive = localStorage.getItem("limbo_active_currency");
    if (savedActive) setActiveCurrency(savedActive);

    const savedHideZero = localStorage.getItem("limbo_hide_zero_balances");
    if (savedHideZero) setHideZeroBalances(savedHideZero === "true");

    const savedDisplayFiat = localStorage.getItem("limbo_display_crypto_in_fiat");
    if (savedDisplayFiat) setDisplayCryptoInFiat(savedDisplayFiat === "true");

    const savedFiat = localStorage.getItem("limbo_selected_fiat_currency");
    if (savedFiat) setSelectedFiatCurrency(savedFiat);
  }, []);

  // Save preferences when changed
  useEffect(() => {
    localStorage.setItem("limbo_active_currency", activeCurrency);
    // When changing active currency, reset betAmount to sensible default
    const savedDefault: Record<string, number> = {
      USDT: 10.0, INR: 500.0, BTC: 0.0001, ETH: 0.005, LTC: 0.1, SOL: 0.05, DOGE: 25.0, BCH: 0.02, XRP: 10.0
    };
    setBetAmount(savedDefault[activeCurrency] ?? 10.0);
  }, [activeCurrency]);

  useEffect(() => {
    localStorage.setItem("limbo_hide_zero_balances", String(hideZeroBalances));
  }, [hideZeroBalances]);

  useEffect(() => {
    localStorage.setItem("limbo_display_crypto_in_fiat", String(displayCryptoInFiat));
  }, [displayCryptoInFiat]);

  useEffect(() => {
    localStorage.setItem("limbo_selected_fiat_currency", selectedFiatCurrency);
  }, [selectedFiatCurrency]);

  // Initialize client seed and fetch balances & history on mount
  useEffect(() => {
    fetchBalance();
    fetchActiveSeeds();

    const savedHistory = localStorage.getItem(`limbo_history_${user.id}`);
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.error("Error reading saved history", e);
      }
    }
  }, [user.id]);

  const loadLocalFallbackSeeds = async () => {
    let savedServerSeed = localStorage.getItem(`limbo_local_server_seed_${user.id}`);
    if (!savedServerSeed) {
      savedServerSeed = Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      localStorage.setItem(`limbo_local_server_seed_${user.id}`, savedServerSeed);
    }
    
    let savedClientSeed = localStorage.getItem(`limbo_local_client_seed_${user.id}`);
    if (!savedClientSeed) {
      savedClientSeed = crypto.randomUUID().replace(/-/g, "").substring(0, 16);
      localStorage.setItem(`limbo_local_client_seed_${user.id}`, savedClientSeed);
    }
    
    let savedNonce = localStorage.getItem(`limbo_local_nonce_${user.id}`);
    const parsedNonce = savedNonce ? parseInt(savedNonce) || 0 : 0;
    
    const hash = await sha256(savedServerSeed);
    
    setServerSeedHash(hash);
    setClientSeed(savedClientSeed);
    setNonce(parsedNonce);
  };

  const fetchActiveSeeds = async () => {
    if (!supabase) {
      await loadLocalFallbackSeeds();
      return;
    }
    try {
      const { data, error } = await supabase
        .from("user_seeds")
        .select("server_seed_hash, client_seed, nonce")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        console.warn("user_seeds query failed, using local storage fallback:", error.message);
        await loadLocalFallbackSeeds();
        return;
      }

      if (data) {
        setServerSeedHash(data.server_seed_hash);
        setClientSeed(data.client_seed);
        setNonce(data.nonce);
      } else {
        const randomSeed = crypto.randomUUID().replace(/-/g, "").substring(0, 16);
        setClientSeed(randomSeed);
        setServerSeedHash("Active seed hash will be initialized on first bet.");
        setNonce(0);
      }
    } catch (e) {
      console.warn("Database seeds table query threw an error, using fallback:", e);
      await loadLocalFallbackSeeds();
    }
  };

  const handleRotateSeeds = async () => {
    if (rotating) return;
    setRotating(true);
    setErrorMsg(null);
    try {
      if (!supabase) throw new Error("SUPABASE_MISSING");

      const { data, error } = await supabase.rpc("reveal_seed");

      if (error) {
        if (error.message?.includes("function") && error.message?.includes("does not exist")) {
          throw new Error("LEGACY_ROTATE_FALLBACK");
        }
        throw error;
      }

      const result = typeof data === "string" ? JSON.parse(data) : data;
      setRevealedSeeds(result);
      
      setServerSeedHash(result.new_server_seed_hash);
      setNonce(0);
      
      setVServerSeed(result.revealed_server_seed);
      setVClientSeed(result.revealed_client_seed);
      setVNonce(0);
      
      setLocalVerifyResult(null);

    } catch (err: any) {
      console.warn("RPC rotate/reveal seed failed, executing client-side local rotate fallback...", err);
      
      // Local rotation fallback
      const oldServerSeed = localStorage.getItem(`limbo_local_server_seed_${user.id}`) || "";
      const oldClientSeed = clientSeed;
      const oldNonce = nonce;
      
      const newServerSeed = Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      localStorage.setItem(`limbo_local_server_seed_${user.id}`, newServerSeed);
      
      const oldServerSeedHash = await sha256(oldServerSeed);
      const newServerSeedHashVal = await sha256(newServerSeed);
      
      localStorage.setItem(`limbo_local_nonce_${user.id}`, "0");
      
      const localRevealed = {
        revealed_server_seed: oldServerSeed,
        revealed_server_seed_hash: oldServerSeedHash,
        revealed_client_seed: oldClientSeed,
        revealed_nonce: oldNonce,
        new_server_seed_hash: newServerSeedHashVal
      };
      
      setRevealedSeeds(localRevealed);
      setServerSeedHash(newServerSeedHashVal);
      setNonce(0);
      
      setVServerSeed(oldServerSeed);
      setVClientSeed(oldClientSeed);
      setVNonce(0);
      setLocalVerifyResult(null);
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
        .from("wallet_balances")
        .select("currency_code, balance")
        .eq("user_id", user.id);
      
      if (error) {
        console.warn("wallet_balances table query failed. Attempting fallback to profiles table...", error);
        
        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("balance")
          .eq("id", user.id)
          .maybeSingle();
          
        if (profileError) {
          console.error("Profiles table fallback also failed:", profileError);
          throw profileError;
        }
        
        // If profile exists, map it to USDT, otherwise initialize default values
        const legacyBalance = profileData ? Number(profileData.balance) : 1000.00;
        const fallbackBalances: Record<string, number> = {
          USDT: legacyBalance,
          INR: 50000.0,
          BTC: 0.01,
          ETH: 0.1,
          LTC: 5.0,
          SOL: 2.0,
          DOGE: 1000.0,
          BCH: 1.0,
          XRP: 500.0
        };
        setBalances(fallbackBalances);
        setErrorMsg("⚠️ Multi-currency wallet tables are not configured in Supabase. Operating in legacy compatibility mode. Run the SQL in 'supabase_wallet_balances.sql' to enable full multi-currency wallets.");
        return;
      }
      
      if (data) {
        const newBalances: Record<string, number> = {
          USDT: 0, INR: 0, BTC: 0, ETH: 0, LTC: 0, SOL: 0, DOGE: 0, BCH: 0, XRP: 0
        };
        data.forEach((row: any) => {
          newBalances[row.currency_code] = Number(row.balance);
        });
        
        // If USDT is missing in the returned wallet_balances, fetch it from profiles as fallback
        if (newBalances.USDT === 0) {
          const { data: profileData } = await supabase
            .from("profiles")
            .select("balance")
            .eq("id", user.id)
            .maybeSingle();
          if (profileData) {
            newBalances.USDT = Number(profileData.balance);
          } else {
            newBalances.USDT = 1000.00; // sensible default
          }
        }
        
        setBalances(newBalances);
        setErrorMsg(null);
      }
    } catch (err: any) {
      console.error(`fetchBalance caught error on attempt ${retryCount + 1}:`, err);
      if (retryCount < 2) {
        setTimeout(() => {
          fetchBalance(retryCount + 1);
        }, 1000);
      } else {
        setErrorMsg("Failed to load your wallet balances. Make sure Supabase is set up properly.");
      }
    }
  };

  const handleResetBalance = async () => {
    if (!supabase || faucetLoading) return;
    setFaucetLoading(true);
    setErrorMsg(null);
    try {
      const { data, error } = await supabase.rpc("claim_faucet", {
        p_currency_code: activeCurrency
      });

      if (error) {
        if (error.message?.includes("relation") || error.message?.includes("function") || error.message?.includes("does not exist")) {
          throw new Error("LEGACY_RESET_FALLBACK");
        }
        throw error;
      }

      const result = typeof data === "string" ? JSON.parse(data) : data;
      const newBalanceVal = Number(result.new_balance);

      setBalances(prev => ({
        ...prev,
        [activeCurrency]: newBalanceVal
      }));

      playBeep(440, "sine", 0.1);
      setTimeout(() => playBeep(880, "sine", 0.15), 100);
    } catch (err: any) {
      if (err.message === "LEGACY_RESET_FALLBACK") {
        console.warn("wallet_balances claim_faucet RPC missing, executing legacy profiles.balance reset fallback...");
        const amountToCredit = FAUCET_AMOUNTS[activeCurrency] ?? 100.0;
        if (activeCurrency === "USDT") {
          try {
            const { error: profError } = await supabase
              .from("profiles")
              .upsert({
                id: user.id,
                balance: amountToCredit,
                updated_at: new Date()
              }, { onConflict: "id" });
            if (profError) throw profError;

            setBalances(prev => ({
              ...prev,
              USDT: amountToCredit
            }));
            playBeep(440, "sine", 0.1);
            setTimeout(() => playBeep(880, "sine", 0.15), 100);
            return;
          } catch (e: any) {
            console.error(e);
          }
        }
      }
      console.error(err);
      setErrorMsg(err.message || `Failed to refill ${activeCurrency} faucet.`);
    } finally {
      setFaucetLoading(false);
    }
  };

  const generateNewSeed = () => {
    setClientSeed(crypto.randomUUID().replace(/-/g, "").substring(0, 16));
  };

  // Helper shortcuts for bet amount
  const handleHalfBet = () => {
    setBetAmount(prev => Math.max(activeCurrency === 'BTC' ? 0.000001 : 0.1, Number((prev / 2).toFixed(6))));
  };

  const handleDoubleBet = () => {
    if (balance) {
      setBetAmount(prev => Math.min(balance, Number((prev * 2).toFixed(6))));
    } else {
      setBetAmount(prev => Number((prev * 2).toFixed(6)));
    }
  };

  const handleMaxBet = () => {
    if (balance) {
      setBetAmount(Number(balance));
    }
  };

  const handleMinBet = () => {
    const minVal: Record<string, number> = {
      USDT: 0.1, INR: 5.0, BTC: 0.000001, ETH: 0.00005, LTC: 0.001, SOL: 0.001, DOGE: 1.0, BCH: 0.0002, XRP: 0.1
    };
    setBetAmount(minVal[activeCurrency] ?? 0.1);
  };

  // Trigger audio feedback safely
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
    if (loading || animationActive) return;
    setErrorMsg(null);

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
      if (!supabase) {
        throw new Error("SUPABASE_CLIENT_NOT_AVAILABLE");
      }

      let rpcResult;
      
      try {
        // Try calling the upgraded multi-currency RPC
        const { data, error } = await supabase.rpc("place_bet", {
          p_bet_amount: Number(betAmount),
          p_target_multiplier: Number(targetMultiplier),
          p_client_seed: clientSeed,
          p_currency_code: activeCurrency
        });
        
        if (error) {
          // If function does not exist / arg mismatch
          if (error.message?.includes("function") && (error.message?.includes("does not exist") || error.message?.includes("parameter"))) {
            throw new Error("LEGACY_FALLBACK");
          }
          throw error;
        }
        rpcResult = data;
      } catch (innerErr: any) {
        if (innerErr.message === "LEGACY_FALLBACK") {
          console.warn("Upgraded place_bet RPC not found. Falling back to 3-argument legacy place_bet RPC...");
          // Fall back to legacy place_bet (ignoring p_currency_code since legacy only supports profiles.balance / USDT)
          const { data, error } = await supabase.rpc("place_bet", {
            p_bet_amount: Number(betAmount),
            p_target_multiplier: Number(targetMultiplier),
            p_client_seed: clientSeed
          });
          
          if (error) throw error;
          rpcResult = data;
        } else {
          throw innerErr;
        }
      }

      const result: BetResult = typeof rpcResult === "string" ? JSON.parse(rpcResult) : rpcResult;

      if (result.nonce !== undefined) setNonce(result.nonce + 1);
      if (result.client_seed) setClientSeed(result.client_seed);
      if (result.server_seed_hash) setServerSeedHash(result.server_seed_hash);

      startMultiplierAnimation(result);

    } catch (err: any) {
      console.warn("RPC place_bet failed, executing local client-side Provably Fair fallback...", err);
      
      try {
        // Load local fallback seeds to perform calculation
        let localSSeed = localStorage.getItem(`limbo_local_server_seed_${user.id}`);
        if (!localSSeed) {
          localSSeed = Array.from(crypto.getRandomValues(new Uint8Array(32)))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
          localStorage.setItem(`limbo_local_server_seed_${user.id}`, localSSeed);
        }
        
        const localSSeedHash = await sha256(localSSeed);
        
        // Calculate the multiplier locally using HMAC-SHA256
        const encoder = new TextEncoder();
        const cleanedHex = localSSeed.trim().replace(/^0x/, "");
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
        
        const messageBytes = encoder.encode(`${clientSeed.trim()}:${nonce}`);
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
        
        const isWin = resultMultiplier >= targetMultiplier;
        const payout = isWin ? betAmount * targetMultiplier : 0;
        const newBalanceValue = balance + (isWin ? (payout - betAmount) : -betAmount);
        
        const localNonceValue = nonce + 1;
        localStorage.setItem(`limbo_local_nonce_${user.id}`, String(localNonceValue));
        
        const localResult: BetResult = {
          is_win: isWin,
          result_multiplier: resultMultiplier,
          payout: payout,
          new_balance: newBalanceValue,
          nonce: nonce,
          client_seed: clientSeed,
          server_seed_hash: localSSeedHash,
          currency_code: activeCurrency
        };
        
        // Save the new balance locally in balances state
        setBalances(prev => ({
          ...prev,
          [activeCurrency]: newBalanceValue
        }));
        
        // Also update Supabase database table if possible (non-blocking) so it tries to save the new balance if the table exists
        if (supabase) {
          try {
            await supabase
              .from("wallet_balances")
              .upsert({ 
                user_id: user.id, 
                currency_code: activeCurrency, 
                balance: newBalanceValue,
                updated_at: new Date()
              }, { onConflict: "user_id,currency_code" });
              
            if (activeCurrency === "USDT") {
              await supabase
                .from("profiles")
                .update({ balance: newBalanceValue })
                .eq("id", user.id);
            }
          } catch (dbErr) {
            console.warn("Could not save new fallback balance to Supabase:", dbErr);
          }
        }
        
        if (localResult.nonce !== undefined) setNonce(localResult.nonce + 1);
        if (localResult.client_seed) setClientSeed(localResult.client_seed);
        if (localResult.server_seed_hash) setServerSeedHash(localResult.server_seed_hash);
        
        startMultiplierAnimation(localResult);
      } catch (fallbackErr: any) {
        console.error("Critical: Local fallback calculation failed:", fallbackErr);
        setErrorMsg("Local calculation failed: " + fallbackErr.message);
        setLoading(false);
      }
    }
  };

  // Progressive Anticipation Ticker Animation
  const startMultiplierAnimation = (result: BetResult) => {
    setAnimationActive(true);
    setCurrentResult(result);
    setDisplayMultiplier(1.00);

    const targetVal = result.result_multiplier;
    const duration = 700; // Total duration in ms
    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);

      const easedProgress = 1 - Math.pow(1 - progress, 3); // easeOutCubic
      const currentVal = 1.00 + (targetVal - 1.00) * easedProgress;
      
      setDisplayMultiplier(Number(currentVal.toFixed(2)));

      if (Math.floor(currentVal * 10) % 7 === 0) {
        playBeep(250 + (currentVal * 15), "triangle", 0.08);
      }

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayMultiplier(targetVal);
        setAnimationActive(false);
        setLoading(false);

        if (result.is_win) {
          playBeep(650, "sine", 0.15);
          setTimeout(() => playBeep(900, "sine", 0.3), 100);
        } else {
          playBeep(180, "sawtooth", 0.4);
        }

        // Update balance strictly from backend response
        setBalances(prev => ({
          ...prev,
          [activeCurrency]: result.new_balance
        }));

        const newHistoryItem: BetHistoryItem = {
          id: crypto.randomUUID(),
          timestamp: new Date(),
          bet_amount: betAmount,
          target_multiplier: targetMultiplier,
          result_multiplier: result.result_multiplier,
          payout: result.payout,
          is_win: result.is_win,
          currency_code: activeCurrency
        };

        setHistory(prev => {
          const updated = [newHistoryItem, ...prev].slice(0, 30);
          localStorage.setItem(`limbo_history_${user.id}`, JSON.stringify(updated));
          return updated;
        });
      }
    };

    animationRef.current = requestAnimationFrame(animate);
  };

  // Swap wallet helper
  const handleSwap = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || swapLoading) return;
    setSwapError(null);
    setSwapSuccess(null);

    const amt = parseFloat(swapAmount);
    if (isNaN(amt) || amt <= 0) {
      setSwapError("Kripya ek valid swap amount daalein!");
      return;
    }

    const sourceBal = balances[swapSource] ?? 0;
    if (amt > sourceBal) {
      setSwapError(`Apke pass itna ${swapSource} balance nahi hai!`);
      return;
    }

    if (swapSource === swapDest) {
      setSwapError("Source aur destination currency same nahi ho sakti!");
      return;
    }

    setSwapLoading(true);
    try {
      const { data, error } = await supabase.rpc("swap_currency", {
        p_source_currency: swapSource,
        p_dest_currency: swapDest,
        p_amount: amt
      });

      if (error) throw error;

      const result = typeof data === "string" ? JSON.parse(data) : data;
      const srcNewBal = Number(result.source_new_balance);
      const dstNewBal = Number(result.dest_new_balance);
      const receivedAmount = Number(result.received_amount);

      setBalances(prev => ({
        ...prev,
        [swapSource]: srcNewBal,
        [swapDest]: dstNewBal
      }));

      setSwapSuccess(`Swapped safely! ${amt} ${swapSource} converted to ${receivedAmount.toLocaleString("en-US", { maximumFractionDigits: swapDest === 'BTC' ? 8 : 4 })} ${swapDest}.`);
      setSwapAmount("");
    } catch (err: any) {
      console.error(err);
      setSwapError(err.message || "Transaction error. Multi-currency balances database check failed.");
    } finally {
      setSwapLoading(false);
    }
  };

  // Stats calculators
  const totalBets = history.length;
  const wins = history.filter(h => h.is_win).length;
  const losses = totalBets - wins;
  const winRate = totalBets > 0 ? ((wins / totalBets) * 100).toFixed(1) : "0.0";
  const netProfit = history.reduce((acc, curr) => {
    // Convert to active currency for consistent metrics display
    const currentBetInActive = convert(curr.bet_amount, curr.currency_code || "USDT", activeCurrency);
    const currentPayoutInActive = convert(curr.payout, curr.currency_code || "USDT", activeCurrency);
    return acc + (curr.is_win ? (currentPayoutInActive - currentBetInActive) : -currentBetInActive);
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

        {/* User Balance Multi-Currency Dropdown */}
        <div className="flex items-center gap-3" id="nav-actions">
          
          <div className="relative flex items-center gap-2">
            
            {/* Real-time Multi-Currency trigger badge */}
            <div 
              onClick={() => setIsWalletDropdownOpen(!isWalletDropdownOpen)}
              className="flex items-center bg-[#0f1923] hover:bg-[#1f323f]/50 border border-[#2d4456] rounded-lg p-1 pr-3 cursor-pointer select-none transition-all justify-between min-w-[155px] md:min-w-[185px]" 
              id="balance-badge"
            >
              <div className="flex items-center">
                <div className="w-8 h-8 rounded-md bg-[#2f4553] flex items-center justify-center text-[#00e701] mr-2 font-mono text-xs font-black">
                  {activeCurrency}
                </div>
                <div className="flex flex-col text-left">
                  <span className="text-[9px] text-[#557086] font-bold uppercase tracking-wider leading-none">Wallet Balance</span>
                  <span className="text-xs font-black font-mono text-white mt-0.5">
                    {displayCryptoInFiat 
                      ? formatValue(convert(balance, activeCurrency, selectedFiatCurrency), selectedFiatCurrency, true)
                      : formatValue(balance, activeCurrency)
                    }
                  </span>
                </div>
              </div>
              <span className="text-gray-500 text-[10px] ml-2">▼</span>
            </div>

            {/* Dropdown Menu Popup block */}
            <AnimatePresence>
              {isWalletDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsWalletDropdownOpen(false)} />
                  <motion.div 
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    className="absolute right-0 top-11 w-72 bg-[#1a2c38] border-2 border-[#2d4456] rounded-xl shadow-2xl z-50 p-2 max-h-[420px] overflow-y-auto"
                  >
                    <div className="flex items-center justify-between px-3 py-2 border-b border-[#2d4456]/50 mb-1.5">
                      <span className="text-xs font-bold text-gray-400">Main User Wallets</span>
                      <button 
                        onClick={() => {
                          setIsWalletDropdownOpen(false);
                          setIsWalletSettingsOpen(true);
                        }}
                        className="p-1 hover:bg-[#2f4553] rounded text-[#00e701] transition flex items-center gap-1"
                        title="Wallet Settings"
                      >
                        <Settings className="w-3.5 h-3.5" />
                        <span className="text-[10px] font-bold uppercase">Settings</span>
                      </button>
                    </div>

                    <div className="space-y-1">
                      {SUPPORTED_ACTIVE_CURRENCIES
                        .filter(cur => {
                          if (hideZeroBalances) {
                            return (balances[cur] ?? 0) > 0 || cur === activeCurrency;
                          }
                          return true;
                        })
                        .map(cur => {
                          const curBal = balances[cur] ?? 0;
                          const isCurrent = cur === activeCurrency;
                          return (
                            <div
                              key={cur}
                              onClick={() => {
                                setActiveCurrency(cur);
                                setIsWalletDropdownOpen(false);
                              }}
                              className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition ${isCurrent ? 'bg-[#2f4553] text-[#00e701] border border-[#00e701]/20' : 'hover:bg-[#203744] text-gray-300'}`}
                            >
                              <div className="flex items-center gap-2">
                                <span className="w-6 h-6 rounded bg-[#0f1923] flex items-center justify-center font-black text-[10px] text-white">
                                  {cur}
                                </span>
                                <span className="text-xs font-extrabold">{cur}</span>
                              </div>
                              <div className="text-right flex flex-col">
                                <span className="text-xs font-extrabold font-mono">
                                  {curBal.toLocaleString("en-US", { maximumFractionDigits: cur === 'BTC' ? 8 : 4 })}
                                </span>
                                {displayCryptoInFiat && (
                                  <span className="text-[9px] text-[#557086] font-bold">
                                    {formatValue(convert(curBal, cur, selectedFiatCurrency), selectedFiatCurrency, true)}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })
                      }
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>

            {/* Faucet claim button */}
            <button
              onClick={handleResetBalance}
              disabled={faucetLoading}
              className="p-2.5 rounded bg-[#0f1923] hover:bg-[#1f323f]/50 border border-[#2d4456] text-[#557086] hover:text-[#00e701] transition flex items-center justify-center group relative"
              title={`Refill active currency`}
              id="faucet-btn"
            >
              <RotateCcw className={`w-4 h-4 ${faucetLoading ? "animate-spin text-[#00e701]" : ""}`} />
              <span className="absolute hidden group-hover:block bottom-[-34px] right-0 bg-[#1a2c38] text-[9px] text-gray-300 font-bold px-2 py-1 rounded whitespace-nowrap border border-gray-800 shadow-md">
                Refill {FAUCET_AMOUNTS[activeCurrency] ?? 100} {activeCurrency}
              </span>
            </button>
          </div>

          {/* User logout */}
          <div className="flex items-center gap-2" id="user-profile">
            <button
              onClick={onSignOut}
              className="p-2.5 rounded bg-[#1f323f]/20 hover:bg-red-500/10 text-gray-400 hover:text-red-400 transition"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </nav>

      {/* Main Body */}
      <main className="flex-grow max-w-7xl w-full mx-auto px-4 md:px-6 py-6 grid grid-cols-1 md:grid-cols-12 gap-6" id="game-main-container">
        
        {/* Left Side: Bet Controls sidebar panel */}
        <aside className="md:col-span-4 bg-[#1a2c38] rounded-xl border border-[#213743] p-5 flex flex-col gap-5 shadow-lg" id="control-sidebar">
          
          {/* Tab Selector Buttons */}
          <div className="flex bg-[#0f1923] p-1 rounded-md" id="tab-nav">
            <button
              onClick={() => setActiveTab("manual")}
              className={`w-1/3 py-2 text-xs font-bold uppercase tracking-wider rounded transition ${activeTab === "manual" ? "bg-[#2f4553] text-white" : "text-[#557086] hover:text-[#b1bad3]"}`}
              id="tab-btn-manual"
            >
              Manual Bet
            </button>
            <button
              onClick={() => setActiveTab("fairness")}
              className={`w-1/3 py-2 text-xs font-bold uppercase tracking-wider rounded transition ${activeTab === "fairness" ? "bg-[#2f4553] text-white" : "text-[#557086] hover:text-[#b1bad3]"}`}
              id="tab-btn-fairness"
            >
              Fairness
            </button>
            <button
              onClick={() => setActiveTab("stats")}
              className={`w-1/3 py-2 text-xs font-bold uppercase tracking-wider rounded transition ${activeTab === "stats" ? "bg-[#2f4553] text-white" : "text-[#557086] hover:text-[#b1bad3]"}`}
              id="tab-btn-stats"
            >
              My Stats
            </button>
          </div>

          {/* Tab Content 1: Manual Betting Controls */}
          {activeTab === "manual" && (
            <div className="flex flex-col gap-4" id="manual-bet-form">
              {/* Bet Amount */}
              <div className="flex flex-col gap-2">
                <div className="flex justify-between text-xs font-bold uppercase text-[#b1bad3]">
                  <label>Bet Amount</label>
                  <span className="text-[#557086] font-mono font-bold">
                    {displayCryptoInFiat 
                      ? formatValue(convert(betAmount, activeCurrency, selectedFiatCurrency), selectedFiatCurrency, true)
                      : formatValue(convert(betAmount, activeCurrency, "USD"), "USD", true)
                    }
                  </span>
                </div>
                <div className="flex bg-[#0f1923] border-2 border-[#2f4553] rounded p-1 pl-2 transition-all focus-within:border-[#557086]">
                  <div className="flex items-center text-[#557086] mr-1.5 font-mono text-[10px] font-black bg-[#162630] px-1.5 py-0.5 rounded border border-[#2d4456]/40 text-gray-400 shrink-0">
                    {activeCurrency}
                  </div>
                  <input
                    type="number"
                    step="any"
                    value={betAmount}
                    onChange={(e) => setBetAmount(Math.max(0, Number(parseFloat(e.target.value)) || 0))}
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
                  <span className="text-[10px] text-[#557086] font-mono font-bold">
                    {displayCryptoInFiat 
                      ? formatValue(convert(betAmount * targetMultiplier - betAmount, activeCurrency, selectedFiatCurrency), selectedFiatCurrency, true)
                      : formatValue(convert(betAmount * targetMultiplier - betAmount, activeCurrency, "USD"), "USD", true)
                    }
                  </span>
                </div>
                <div className="bg-[#0f1923] border-2 border-[#2f4553] rounded p-3 text-white font-bold flex items-center justify-between">
                  <span className="text-[#00e701] text-sm font-black font-mono">{activeCurrency}</span>
                  <span className="text-lg font-mono text-white">{(betAmount * targetMultiplier - betAmount).toLocaleString("en-US", { maximumFractionDigits: activeCurrency === 'BTC' ? 8 : 4 })}</span>
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
                    CLIMBING...
                  </span>
                ) : (
                  "Place Bet"
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
                  {netProfit >= 0 ? "+" : ""}
                  {displayCryptoInFiat 
                    ? formatValue(convert(netProfit, activeCurrency, selectedFiatCurrency), selectedFiatCurrency, true)
                    : formatValue(netProfit, activeCurrency)
                  }
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
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#00e701] opacity-[0.03] blur-[120px] rounded-full" />
              </div>

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
                            Payout: +{displayCryptoInFiat 
                              ? formatValue(convert(currentResult.payout, activeCurrency, selectedFiatCurrency), selectedFiatCurrency, true)
                              : formatValue(currentResult.payout, activeCurrency)
                            }
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
                            Loss: -{displayCryptoInFiat 
                              ? formatValue(convert(betAmount, activeCurrency, selectedFiatCurrency), selectedFiatCurrency, true)
                              : formatValue(betAmount, activeCurrency)
                            }
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
                            {displayCryptoInFiat 
                              ? formatValue(convert(bet.bet_amount, bet.currency_code || "USDT", selectedFiatCurrency), selectedFiatCurrency, true)
                              : formatValue(bet.bet_amount, bet.currency_code || "USDT")
                            }
                          </td>
                          <td className="py-3 px-5 text-right font-mono text-[#b1bad3]">
                            {bet.target_multiplier.toFixed(2)}x
                          </td>
                          <td className={`py-3 px-5 text-right font-mono font-bold ${bet.is_win ? "text-[#00e701]" : "text-rose-400"}`}>
                            {bet.result_multiplier.toFixed(2)}x
                          </td>
                          <td className={`py-3 px-5 text-right font-mono font-bold ${bet.is_win ? "text-[#00e701]" : "text-gray-500"}`}>
                            {bet.is_win 
                              ? `+${displayCryptoInFiat 
                                ? formatValue(convert(bet.payout, bet.currency_code || "USDT", selectedFiatCurrency), selectedFiatCurrency, true)
                                : formatValue(bet.payout, bet.currency_code || "USDT")
                              }`
                              : `-${displayCryptoInFiat 
                                ? formatValue(convert(bet.bet_amount, bet.currency_code || "USDT", selectedFiatCurrency), selectedFiatCurrency, true)
                                : formatValue(bet.bet_amount, bet.currency_code || "USDT")
                              }`
                            }
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

      {/* Wallet Settings Modal Dialog Block */}
      {isWalletSettingsOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-lg bg-[#1a2c38] border-2 border-[#2d4456] rounded-2xl overflow-hidden shadow-2xl"
          >
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-[#2d4456] flex items-center justify-between bg-[#162630]">
              <div className="flex items-center gap-2">
                <Coins className="w-5 h-5 text-[#00e701]" />
                <h3 className="text-sm font-black text-white uppercase tracking-wider">Stake Wallet Hub</h3>
              </div>
              <button 
                onClick={() => setIsWalletSettingsOpen(false)}
                className="p-1.5 hover:bg-[#2f4553] text-gray-400 hover:text-white rounded-lg transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Navigation Tabs */}
            <div className="flex bg-[#0f1923] p-1 border-b border-[#2d4456]/40">
              <button
                onClick={() => {
                  setWalletSettingsTab("overview");
                  setSwapError(null);
                  setSwapSuccess(null);
                }}
                className={`w-1/3 py-2.5 text-xs font-bold uppercase tracking-wider transition ${walletSettingsTab === "overview" ? "text-[#00e701] border-b-2 border-[#00e701]" : "text-gray-400 hover:text-white"}`}
              >
                Overview
              </button>
              <button
                onClick={() => {
                  setWalletSettingsTab("buy");
                  setSwapError(null);
                  setSwapSuccess(null);
                }}
                className={`w-1/3 py-2.5 text-xs font-bold uppercase tracking-wider transition ${walletSettingsTab === "buy" ? "text-[#00e701] border-b-2 border-[#00e701]" : "text-gray-400 hover:text-white"}`}
              >
                Buy Crypto
              </button>
              <button
                onClick={() => {
                  setWalletSettingsTab("swap");
                  setSwapError(null);
                  setSwapSuccess(null);
                }}
                className={`w-1/3 py-2.5 text-xs font-bold uppercase tracking-wider transition ${walletSettingsTab === "swap" ? "text-[#00e701] border-b-2 border-[#00e701]" : "text-gray-400 hover:text-white"}`}
              >
                Coins Swap
              </button>
            </div>

            {/* Modal Body Content */}
            <div className="p-6">
              
              {/* Tab 1: Wallet Overview & Preferences */}
              {walletSettingsTab === "overview" && (
                <div className="space-y-6">
                  {/* Visual Preferences */}
                  <div className="space-y-4 bg-[#0f1923] p-4 rounded-xl border border-[#2d4456]/40">
                    <span className="text-[10px] text-[#557086] font-bold uppercase tracking-wider block">Wallet Settings</span>
                    
                    {/* Hide Zero Balances Toggle */}
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col text-left">
                        <span className="text-xs font-bold text-white">Hide Zero Balances</span>
                        <span className="text-[10px] text-[#557086]">Do not display wallets holding 0 tokens</span>
                      </div>
                      <button
                        onClick={() => setHideZeroBalances(!hideZeroBalances)}
                        className={`w-12 h-6 rounded-full p-0.5 transition-all duration-200 ${hideZeroBalances ? 'bg-[#00e701]' : 'bg-[#2f4553]'}`}
                      >
                        <div className={`w-5 h-5 bg-[#0f1923] rounded-full shadow-md transform transition-transform duration-200 ${hideZeroBalances ? 'translate-x-6' : 'translate-x-0'}`} />
                      </button>
                    </div>

                    <hr className="border-[#2d4456]/40" />

                    {/* Display Crypto in Fiat Toggle */}
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col text-left">
                        <span className="text-xs font-bold text-white">Display Crypto in Fiat</span>
                        <span className="text-[10px] text-[#557086]">Show virtual crypto balances converted into real-time fiat</span>
                      </div>
                      <button
                        onClick={() => setDisplayCryptoInFiat(!displayCryptoInFiat)}
                        className={`w-12 h-6 rounded-full p-0.5 transition-all duration-200 ${displayCryptoInFiat ? 'bg-[#00e701]' : 'bg-[#2f4553]'}`}
                      >
                        <div className={`w-5 h-5 bg-[#0f1923] rounded-full shadow-md transform transition-transform duration-200 ${displayCryptoInFiat ? 'translate-x-6' : 'translate-x-0'}`} />
                      </button>
                    </div>

                    {/* Fiat currency select list */}
                    {displayCryptoInFiat && (
                      <div className="pt-2 animate-in slide-in-from-top-2 duration-150">
                        <label className="block text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1.5">Select Fiat Currency for Display</label>
                        <select
                          value={selectedFiatCurrency}
                          onChange={(e) => setSelectedFiatCurrency(e.target.value)}
                          className="w-full px-3 py-2 bg-[#1a2c38] border border-[#2d4456] rounded-lg text-white font-medium text-xs focus:outline-none"
                        >
                          {SUPPORTED_FIAT_CURRENCIES.map(code => (
                            <option key={code} value={code}>{code} (Exchange Display)</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  {/* Portfolio breakdown list */}
                  <div className="space-y-2">
                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block">Your Wallet Balances Portfolio</span>
                    <div className="grid grid-cols-2 gap-2 max-h-[160px] overflow-y-auto pr-1">
                      {SUPPORTED_ACTIVE_CURRENCIES.map(cur => {
                        const curBal = balances[cur] ?? 0;
                        return (
                          <div key={cur} className="p-2.5 bg-[#0f1923] rounded-lg border border-[#2d4456]/40 flex items-center justify-between">
                            <span className="font-mono text-xs font-extrabold text-white">{cur}</span>
                            <div className="text-right">
                              <span className="font-mono text-xs font-black text-[#00e701] block">
                                {curBal.toLocaleString("en-US", { maximumFractionDigits: cur === 'BTC' ? 8 : 4 })}
                              </span>
                              <span className="text-[9px] text-[#557086] font-bold block">
                                {formatValue(convert(curBal, cur, "USD"), "USD", true)}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 2: Buy Crypto (Visual Placeholder) */}
              {walletSettingsTab === "buy" && (
                <div className="space-y-4 text-center py-6">
                  <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-[#00e701]/30 flex items-center justify-center mx-auto text-[#00e701]">
                    <CreditCard className="w-8 h-8" />
                  </div>
                  <div>
                    <h4 className="font-black text-white text-base uppercase">Instant Virtual Credit Card purchase</h4>
                    <p className="text-xs text-[#557086] mt-2 leading-relaxed max-w-sm mx-auto">
                      Aap instant virtual debit/credit cards ke dwara direct virtual tokens purchase kar sakte hain. Free Faucet mode test network live hai, refill buttons se claim karein!
                    </p>
                  </div>
                  <div className="p-4 bg-[#0f1923] rounded-xl border border-[#2d4456]/40 text-left max-w-sm mx-auto space-y-2 text-xs">
                    <span className="text-gray-400 font-bold uppercase text-[9px] tracking-wider block">Visa / Mastercard Simulator</span>
                    <div className="flex justify-between items-center text-white">
                      <span>Card Number:</span>
                      <span className="font-mono font-bold">•••• •••• •••• 4920</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        // Mock add to active currency
                        const amt = FAUCET_AMOUNTS[activeCurrency] ?? 100;
                        setBalances(prev => ({
                          ...prev,
                          [activeCurrency]: (prev[activeCurrency] ?? 0) + amt
                        }));
                        setSwapSuccess(`Mock payment successful! Charged credit card. Added ${amt} ${activeCurrency} directly to wallet.`);
                        setWalletSettingsTab("overview");
                      }}
                      className="w-full py-2 bg-[#00e701] hover:bg-[#1fff20] text-[#01080e] font-extrabold text-xs uppercase rounded-lg transition"
                    >
                      Credit mock {FAUCET_AMOUNTS[activeCurrency] ?? 100} {activeCurrency}
                    </button>
                  </div>
                </div>
              )}

              {/* Tab 3: Coins Swap (Exchange Engine) */}
              {walletSettingsTab === "swap" && (
                <form onSubmit={handleSwap} className="space-y-4">
                  
                  {/* Selectors grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1.5">Swap Source (Deduct)</label>
                      <select
                        value={swapSource}
                        onChange={(e) => setSwapSource(e.target.value)}
                        className="w-full px-3 py-2 bg-[#0f1923] border border-[#2d4456] rounded-lg text-white font-medium text-xs focus:outline-none"
                      >
                        {SUPPORTED_ACTIVE_CURRENCIES.map(code => (
                          <option key={code} value={code}>{code} (Available: {(balances[code] ?? 0).toLocaleString("en-US", { maximumFractionDigits: 4 })})</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1.5">Swap Destination (Credit)</label>
                      <select
                        value={swapDest}
                        onChange={(e) => setSwapDest(e.target.value)}
                        className="w-full px-3 py-2 bg-[#0f1923] border border-[#2d4456] rounded-lg text-white font-medium text-xs focus:outline-none"
                      >
                        {SUPPORTED_ACTIVE_CURRENCIES.map(code => (
                          <option key={code} value={code}>{code}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Swap Amount */}
                  <div>
                    <label className="block text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1.5">Amount to Swap ({swapSource})</label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        step="any"
                        placeholder="0.00"
                        value={swapAmount}
                        onChange={(e) => setSwapAmount(e.target.value)}
                        className="w-full px-3 py-2 bg-[#0f1923] border border-[#2d4456] rounded-lg text-white font-mono text-xs focus:outline-none"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setSwapAmount(String(balances[swapSource] ?? 0))}
                        className="px-3 bg-[#2f4553] text-white hover:bg-[#3d5a6d] font-bold text-xs rounded-lg transition"
                      >
                        MAX
                      </button>
                    </div>
                  </div>

                  {/* Swap rate visualizer */}
                  {swapAmount && !isNaN(parseFloat(swapAmount)) && (
                    <div className="p-3.5 bg-[#0f1923] rounded-lg border border-[#2d4456]/40 space-y-1.5 text-xs">
                      <span className="text-[#557086] text-[9px] font-bold uppercase tracking-wider block">Live Swaps Transaction Review</span>
                      <div className="flex justify-between text-gray-300">
                        <span>Deducting:</span>
                        <span className="font-mono font-bold text-rose-400">-{parseFloat(swapAmount)} {swapSource}</span>
                      </div>
                      <div className="flex justify-between text-gray-300">
                        <span>Crediting (Estimated):</span>
                        <span className="font-mono font-bold text-[#00e701]">+{convert(parseFloat(swapAmount), swapSource, swapDest).toLocaleString("en-US", { maximumFractionDigits: 6 })} {swapDest}</span>
                      </div>
                      <div className="flex justify-between text-gray-500 text-[10px]">
                        <span>Conversion Rate:</span>
                        <span className="font-mono">1 {swapSource} = {convert(1, swapSource, swapDest).toLocaleString("en-US", { maximumFractionDigits: 6 })} {swapDest}</span>
                      </div>
                    </div>
                  )}

                  {/* Swap errors */}
                  {swapError && (
                    <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs rounded-lg">
                      ⚠️ {swapError}
                    </div>
                  )}

                  {/* Swap Success */}
                  {swapSuccess && (
                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-[#00e701] text-xs rounded-lg">
                      🎉 {swapSuccess}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={swapLoading}
                    className="w-full py-3 bg-[#00e701] hover:bg-[#1fff20] text-[#01080e] font-black text-xs uppercase rounded-lg transition-all"
                  >
                    {swapLoading ? "Processing Swap Exchange..." : "Confirm Swap"}
                  </button>

                </form>
              )}

            </div>
          </motion.div>
        </div>
      )}

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
