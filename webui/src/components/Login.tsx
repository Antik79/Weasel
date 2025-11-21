import { useState } from "react";
import { Lock } from "lucide-react";
import logo from "../assets/weasel-logo.png";
import { api } from "../api/client";

const AUTH_TOKEN_KEY = "weasel.auth.token";

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setAuthToken(token: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearAuthToken() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AUTH_TOKEN_KEY);
}

interface LoginProps {
  onLogin: () => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // Try to authenticate by making a test request with the password as token
      const response = await fetch("/api/system/status", {
        headers: {
          "X-Weasel-Token": password,
          "X-Weasel-Csrf": "login",
          "Content-Type": "application/json"
        }
      });

      if (response.ok) {
        setAuthToken(password);
        onLogin();
      } else {
        setError("Invalid password. Please try again.");
      }
    } catch (err) {
      setError("Failed to connect. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <img
            src={logo}
            alt="Weasel"
            className="h-16 w-16 rounded-lg border border-slate-800 shadow-lg object-cover mx-auto mb-4"
          />
          <h2 className="text-3xl font-semibold text-white">Weasel Console</h2>
          <p className="text-slate-400 mt-2">Enter your password to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="panel space-y-4">
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-text w-full pl-10"
                placeholder="Enter password"
                autoFocus
                required
                disabled={loading}
              />
              <Lock
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
            </div>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn-primary w-full"
            disabled={loading || !password}
          >
            {loading ? "Authenticating..." : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
}

