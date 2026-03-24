import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { LogIn, Mail, LogOut, User as UserIcon, Loader2, FolderOpen, Save, Settings, Database, Terminal } from "lucide-react";
import { User, AppTab } from "../types";

interface AuthProps {
  onUserChange: (user: User | null) => void;
  onTabChange: (tab: AppTab) => void;
  isDeveloper: boolean;
}

export default function Auth({ onUserChange, onTabChange, isDeveloper }: AuthProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const fetchUser = async () => {
    try {
      const res = await fetch("/api/auth/user");
      const data = await res.json();
      setUser(data.user);
      onUserChange(data.user);
    } catch (err) {
      console.error("Failed to fetch user:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUser();

    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin;
      if (!origin.endsWith(".run.app") && !origin.includes("localhost")) {
        return;
      }
      if (event.data?.type === "OAUTH_AUTH_SUCCESS") {
        fetchUser();
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const handleLogin = async () => {
    try {
      const res = await fetch(`/api/auth/google/url`);
      const { url } = await res.json();
      
      const width = 600;
      const height = 700;
      const left = window.screenX + (window.innerWidth - width) / 2;
      const top = window.screenY + (window.innerHeight - height) / 2;
      
      window.open(
        url,
        "oauth_popup",
        `width=${width},height=${height},left=${left},top=${top}`
      );
    } catch (err) {
      console.error(`Failed to start Google login:`, err);
      alert(`Failed to start Google login. Please check console.`);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setUser(null);
      onUserChange(null);
      setIsMenuOpen(false);
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-stone-400 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Checking session...</span>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={handleLogin}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-stone-200 rounded-xl text-sm font-medium text-stone-700 hover:bg-stone-50 transition-all shadow-sm"
        >
          <Mail className="w-4 h-4 text-red-500" />
          <span>Sign in with Google</span>
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        className="flex items-center gap-2 p-1 pr-3 bg-white border border-stone-200 rounded-full hover:bg-stone-50 transition-all shadow-sm"
      >
        {user.picture ? (
          <img
            src={user.picture}
            alt={user.name}
            className="w-8 h-8 rounded-full border border-stone-100"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
            <UserIcon className="w-4 h-4" />
          </div>
        )}
        <div className="text-left hidden sm:block">
          <p className="text-xs font-bold text-stone-900 leading-none">{user.name}</p>
          <p className="text-[10px] text-stone-500 leading-none mt-0.5 capitalize">{user.provider}</p>
        </div>
      </button>

      <AnimatePresence>
        {isMenuOpen && (
          <>
            <div 
              className="fixed inset-0 z-20" 
              onClick={() => setIsMenuOpen(false)} 
            />
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="absolute right-0 mt-2 w-56 bg-white border border-stone-200 rounded-2xl shadow-xl z-30 overflow-hidden"
            >
              <div className="p-4 border-b border-stone-100 bg-stone-50/50">
                <p className="text-sm font-bold text-stone-900">{user.name}</p>
                <p className="text-xs text-stone-500 truncate">{user.email}</p>
              </div>
              <div className="p-2">
                <button
                  onClick={() => { onTabChange("profiles"); setIsMenuOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm text-stone-700 hover:bg-stone-50 rounded-xl transition-colors"
                >
                  <FolderOpen className="w-4 h-4 text-stone-400" />
                  <span>My Profiles</span>
                </button>
                <button
                  onClick={() => { onTabChange("results"); setIsMenuOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm text-stone-700 hover:bg-stone-50 rounded-xl transition-colors"
                >
                  <Save className="w-4 h-4 text-stone-400" />
                  <span>Saved Results</span>
                </button>
                <button
                  onClick={() => { onTabChange("database"); setIsMenuOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm text-stone-700 hover:bg-stone-50 rounded-xl transition-colors"
                >
                  <Database className="w-4 h-4 text-stone-400" />
                  <span>Hardware DB</span>
                </button>
                
                {isDeveloper && (
                  <>
                    <div className="h-px bg-stone-100 my-1 mx-2" />
                    <button
                      onClick={() => { onTabChange("logs"); setIsMenuOpen(false); }}
                      className="w-full flex items-center gap-3 px-3 py-2 text-sm text-stone-700 hover:bg-stone-50 rounded-xl transition-colors"
                    >
                      <Terminal className="w-4 h-4 text-stone-400" />
                      <span>Dev Logs</span>
                    </button>
                  </>
                )}

                <div className="h-px bg-stone-100 my-1 mx-2" />
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out</span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
