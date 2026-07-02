import { useState, useEffect } from "react";
import { getSupabaseClient, isConfigured } from "./supabase";
import OnboardingGuide from "./components/OnboardingGuide";
import AuthView from "./components/AuthView";
import GameView from "./components/GameView";
import AdminLogin from "./components/AdminLogin";
import AdminDashboard from "./components/AdminDashboard";

export default function App() {
  // Simple Pathname-based Routing for Secure Admin Panel
  if (window.location.pathname === "/admin/login") {
    return <AdminLogin />;
  }
  if (window.location.pathname === "/admin/dashboard") {
    return <AdminDashboard />;
  }

  const [user, setUser] = useState<any>(null);
  const [authChecking, setAuthChecking] = useState<boolean>(true);

  const supabase = getSupabaseClient();

  useEffect(() => {
    if (!isConfigured || !supabase) {
      setAuthChecking(false);
      return;
    }

    // Check current active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAuthChecking(false);
    });

    // Listen for auth state changes (sign in, sign out, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
        setAuthChecking(false);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // 1. If Supabase keys are not set yet, guide the user to configure them!
  if (!isConfigured) {
    return <OnboardingGuide />;
  }

  // 2. Loading state while verifying token/session
  if (authChecking) {
    return (
      <div className="min-h-screen bg-[#0f212e] text-white flex flex-col items-center justify-center gap-4" id="app-loading-screen">
        <div className="relative flex items-center justify-center">
          <div className="w-12 h-12 rounded-full border-4 border-emerald-500/25 border-t-emerald-400 animate-spin" />
        </div>
        <p className="text-gray-400 font-bold text-xs uppercase tracking-widest animate-pulse">
          Verifying Connection...
        </p>
      </div>
    );
  }

  // 3. User is signed in, show Main Limbo Game View
  if (user) {
    return (
      <GameView
        user={user}
        onSignOut={async () => {
          if (supabase) {
            await supabase.auth.signOut();
            setUser(null);
          }
        }}
      />
    );
  }

  // 4. Otherwise show the high-contrast sign-in & registration screen
  return (
    <AuthView
      onAuthSuccess={() => {
        if (supabase) {
          supabase.auth.getUser().then(({ data: { user: currentUser } }) => {
            setUser(currentUser);
          });
        }
      }}
    />
  );
}
