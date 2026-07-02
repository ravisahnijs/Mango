import { createClient } from "@supabase/supabase-js";

// Check environment variables safely
const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY || "";

// Mask secret keys for safe debugging output
const maskedAnonKey = supabaseAnonKey 
  ? `${supabaseAnonKey.substring(0, 8)}...${supabaseAnonKey.substring(supabaseAnonKey.length - 8)}`
  : "Not Configured";

// We check if they are set and not placeholder values
export const isConfigured = 
  supabaseUrl && 
  supabaseAnonKey && 
  supabaseUrl !== "https://your-project-id.supabase.co" && 
  supabaseAnonKey !== "your-anon-key" &&
  supabaseUrl.trim().length > 0 &&
  supabaseAnonKey.trim().length > 0;

console.log("Supabase Connection Parameters Debug:", {
  url: supabaseUrl || "Not Configured",
  anonKeyMasked: maskedAnonKey,
  isConfigured,
  urlValidFormat: supabaseUrl.startsWith("https://")
});

// Lazy-initialize the client if configured to avoid crashing on start
let supabaseClientInstance: any = null;

export function getSupabaseClient() {
  if (!isConfigured) {
    return null;
  }
  if (!supabaseClientInstance) {
    try {
      supabaseClientInstance = createClient(supabaseUrl, supabaseAnonKey);
      console.log("Supabase Client initialized successfully.");
    } catch (err) {
      console.error("Critical error while calling createClient:", err);
    }
  }
  return supabaseClientInstance;
}
