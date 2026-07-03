import { useState, useEffect } from "react";

// List of active wallet currencies supported by the user
export const SUPPORTED_ACTIVE_CURRENCIES = [
  "USDT",
  "INR",
  "BTC",
  "ETH",
  "LTC",
  "SOL",
  "DOGE",
  "BCH",
  "XRP"
] as const;

export type ActiveCurrency = typeof SUPPORTED_ACTIVE_CURRENCIES[number];

// List of fiat currencies supported for display mode
export const SUPPORTED_FIAT_CURRENCIES = [
  "USD", "EUR", "JPY", "INR", "CAD", "CNY", "IDR", "KRW", "PHP", "RUB", 
  "MXN", "PLN", "TRY", "VND", "ARS", "PEN", "CLP", "NGN", "AED", "BHD", 
  "CRC", "KWD", "MAD", "MYR"
] as const;

export type DisplayFiatCurrency = typeof SUPPORTED_FIAT_CURRENCIES[number];

// Robust hardcoded fallback prices in USD (used if API fails or is rate-limited)
const FALLBACK_PRICES_IN_USD: Record<string, number> = {
  // Crypto
  USDT: 1.0,
  BTC: 91200.0,
  ETH: 3120.0,
  LTC: 124.5,
  SOL: 176.4,
  DOGE: 0.224,
  BCH: 445.8,
  XRP: 1.12,
  // Fiat (Value of 1 Unit of Fiat in USD)
  USD: 1.0,
  EUR: 1.085,
  JPY: 0.00635,
  INR: 0.0120, // 1 INR = 0.012 USD (approx 83.5 INR per USD)
  CAD: 0.73,
  CNY: 0.138,
  IDR: 0.000061,
  KRW: 0.00072,
  PHP: 0.017,
  RUB: 0.011,
  MXN: 0.055,
  PLN: 0.25,
  TRY: 0.0305,
  VND: 0.000039,
  ARS: 0.0011,
  PEN: 0.267,
  CLP: 0.00108,
  NGN: 0.00067,
  AED: 0.272,
  BHD: 2.65,
  CRC: 0.0019,
  KWD: 3.25,
  MAD: 0.10,
  MYR: 0.212
};

const COINGECKO_MAP: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  LTC: "litecoin",
  SOL: "solana",
  DOGE: "dogecoin",
  BCH: "bitcoin-cash",
  XRP: "ripple",
  USDT: "tether"
};

export function useExchangeRates() {
  const [pricesInUSD, setPricesInUSD] = useState<Record<string, number>>(FALLBACK_PRICES_IN_USD);
  const [loadingRates, setLoadingRates] = useState<boolean>(true);

  const fetchRates = async () => {
    try {
      console.log("[Exchange Rates Hook] Fetching live rates...");
      const updatedPrices = { ...FALLBACK_PRICES_IN_USD };

      // 1. Fetch Fiat Rates from open.er-api
      try {
        const res = await fetch("https://open.er-api.com/v6/latest/USD");
        if (res.ok) {
          const data = await res.json();
          if (data && data.rates) {
            SUPPORTED_FIAT_CURRENCIES.forEach(code => {
              if (data.rates[code] && data.rates[code] > 0) {
                // Value of 1 Unit in USD is 1 / rates[code]
                updatedPrices[code] = 1 / data.rates[code];
              }
            });
            // Update active INR value from fiat API as well
            if (data.rates.INR && data.rates.INR > 0) {
              updatedPrices["INR"] = 1 / data.rates.INR;
            }
          }
        }
      } catch (fiatErr) {
        console.warn("[Exchange Rates Hook] Fiat API fetch failed, using fallback:", fiatErr);
      }

      // 2. Fetch Crypto Prices from CoinGecko
      try {
        const cryptoIds = Object.values(COINGECKO_MAP).join(",");
        const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${cryptoIds}&vs_currencies=usd`);
        if (res.ok) {
          const data = await res.json();
          if (data) {
            Object.entries(COINGECKO_MAP).forEach(([code, geckoId]) => {
              if (data[geckoId] && data[geckoId].usd) {
                updatedPrices[code] = data[geckoId].usd;
              }
            });
          }
        }
      } catch (cryptoErr) {
        console.warn("[Exchange Rates Hook] Crypto API fetch failed (likely rate-limited), using fallback:", cryptoErr);
      }

      setPricesInUSD(updatedPrices);
      localStorage.setItem("limbo_exchange_prices", JSON.stringify(updatedPrices));
      localStorage.setItem("limbo_exchange_timestamp", Date.now().toString());
    } catch (e) {
      console.error("[Exchange Rates Hook] Error fetching exchange rates:", e);
    } finally {
      setLoadingRates(false);
    }
  };

  useEffect(() => {
    const cachedPrices = localStorage.getItem("limbo_exchange_prices");
    const cachedTimestamp = localStorage.getItem("limbo_exchange_timestamp");
    const cacheDuration = 5 * 60 * 1000; // 5 minutes

    if (cachedPrices && cachedTimestamp) {
      const parsedTime = parseInt(cachedTimestamp, 10);
      if (Date.now() - parsedTime < cacheDuration) {
        try {
          setPricesInUSD(JSON.parse(cachedPrices));
          setLoadingRates(false);
          return;
        } catch (e) {
          console.warn("[Exchange Rates Hook] Cached parse failed, refetching...", e);
        }
      }
    }

    fetchRates();
  }, []);

  // Universal Conversion: converts between any two supported currencies (crypto or fiat)
  const convert = (amount: number, fromCurrency: string, toCurrency: string): number => {
    const fromPrice = pricesInUSD[fromCurrency] || FALLBACK_PRICES_IN_USD[fromCurrency] || 1.0;
    const toPrice = pricesInUSD[toCurrency] || FALLBACK_PRICES_IN_USD[toCurrency] || 1.0;

    // Convert amount to base USD
    const amountInUSD = amount * fromPrice;
    // Convert USD to target currency
    return amountInUSD / toPrice;
  };

  // Helper to format currency values beautifully
  const formatValue = (amount: number, currency: string, isFiat: boolean = false): string => {
    if (isFiat) {
      const symbolMap: Record<string, string> = {
        USD: "$", EUR: "€", JPY: "¥", INR: "₹", CAD: "C$", CNY: "¥", IDR: "Rp", KRW: "₩", PHP: "₱", RUB: "₽", 
        MXN: "$", PLN: "zł", TRY: "₺", VND: "₫", ARS: "$", PEN: "S/.", CLP: "$", NGN: "₦", AED: "د.إ", BHD: ".د.ب", 
        CRC: "₡", KWD: "د.ك", MAD: "د.م.", MYR: "RM"
      };
      const symbol = symbolMap[currency] || "";
      // For fiat we typically want 2 decimals, except for JPY, KRW, VND, IDR, CLP etc. which are usually rounded
      const noDecimals = ["JPY", "KRW", "VND", "IDR", "CLP"].includes(currency);
      return `${symbol}${amount.toLocaleString("en-US", { 
        minimumFractionDigits: noDecimals ? 0 : 2, 
        maximumFractionDigits: noDecimals ? 0 : 2 
      })}`;
    } else {
      // For crypto, format nicely with appropriate precision
      const precisionMap: Record<string, number> = {
        USDT: 2, INR: 2, BTC: 8, ETH: 6, LTC: 5, SOL: 4, DOGE: 2, BCH: 5, XRP: 4
      };
      const precision = precisionMap[currency] !== undefined ? precisionMap[currency] : 4;
      return `${amount.toLocaleString("en-US", { 
        minimumFractionDigits: Math.min(2, precision), 
        maximumFractionDigits: precision 
      })} ${currency}`;
    }
  };

  return {
    pricesInUSD,
    loadingRates,
    convert,
    formatValue
  };
}
