import { useState } from "react";
import { Check, Copy, Database, Key } from "lucide-react";

export default function OnboardingGuide() {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="min-h-screen bg-[#0f1923] text-[#b1bad3] flex flex-col justify-between" id="onboarding-container">
      <div className="max-w-2xl mx-auto px-4 py-16 w-full flex-grow flex flex-col justify-center">
        {/* Header */}
        <div className="text-center mb-10" id="header-section">
          <div className="inline-flex items-center justify-center p-3 bg-[#00e701]/10 rounded-2xl mb-4 border border-[#00e701]/20">
            <Database className="w-8 h-8 text-[#00e701]" />
          </div>
          <h1 className="text-3xl md:text-4xl font-black tracking-tight text-white mb-3 font-sans">
            ⚡ LIMBO CASINO
          </h1>
          <p className="text-white font-bold text-lg">
            Supabase Connection Pending
          </p>
          <p className="text-[#b1bad3]/80 text-sm max-w-md mx-auto mt-2">
            Apka frontend ready hai, bas isse apne existing Supabase project se connect karein. Niche diye gaye credentials configure karein.
          </p>
        </div>

        <div className="space-y-6" id="steps-grid">
          {/* Environment Variables Setup */}
          <div className="bg-[#213743] rounded-xl border border-[#2d4456] p-6 md:p-8 shadow-2xl" id="step-env-vars">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Key className="w-5 h-5 text-[#00e701]" /> Setup Credentials
            </h3>
            <p className="text-[#b1bad3] text-sm mb-4 leading-relaxed">
              Apne workspace ke <strong>Settings &gt; Secrets</strong> (ya environment variables) me niche diye gaye keys ko submit karein:
            </p>
            
            <div className="space-y-4">
              <div>
                <div className="flex justify-between items-center text-xs text-[#557086] font-bold uppercase mb-1.5">
                  <span>Variable Name</span>
                  <span>Value Example</span>
                </div>
                <div className="bg-[#0f1923] p-3.5 rounded border-2 border-[#2f4553] font-mono text-xs text-white relative flex justify-between items-center">
                  <span>VITE_SUPABASE_URL</span>
                  <button
                    onClick={() => handleCopy("VITE_SUPABASE_URL", "var1")}
                    className="text-[#557086] hover:text-white transition"
                    title="Copy Name"
                  >
                    {copiedId === "var1" ? <Check className="w-4 h-4 text-[#00e701]" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center text-xs text-[#557086] font-bold uppercase mb-1.5">
                  <span>Variable Name</span>
                  <span>Value Example</span>
                </div>
                <div className="bg-[#0f1923] p-3.5 rounded border-2 border-[#2f4553] font-mono text-xs text-white relative flex justify-between items-center">
                  <span>VITE_SUPABASE_ANON_KEY</span>
                  <button
                    onClick={() => handleCopy("VITE_SUPABASE_ANON_KEY", "var2")}
                    className="text-[#557086] hover:text-white transition"
                    title="Copy Name"
                  >
                    {copiedId === "var2" ? <Check className="w-4 h-4 text-[#00e701]" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Verification Alert */}
        <div className="mt-8 p-4 bg-[#00e701]/10 border border-[#00e701]/20 rounded text-center" id="verify-alert">
          <p className="text-[#00e701] text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2">
            <span>💡</span> Credentials add karne ke baad preview load ho jayega!
          </p>
        </div>
      </div>

      {/* Footer */}
      <footer className="w-full text-center py-6 text-[10px] text-[#557086] border-t border-[#213743] bg-[#0f1923]" id="footer-section">
        Limbo Casino &bull; Immersive Casino Theme Mode &bull; Play Responsibly
      </footer>
    </div>
  );
}

