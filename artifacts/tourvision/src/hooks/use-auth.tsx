import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useLocation } from "wouter";

type User = {
  id: string;
  name: string;
  email: string;
  subscriptionTier: 'free' | 'pro' | 'unlimited';
};

type AuthContextType = {
  user: User | null;
  isAuthenticated: boolean;
  login: () => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem("tourvision_user");
    return saved ? JSON.parse(saved) : null;
  });
  const [, setLocation] = useLocation();

  const login = () => {
    const mockUser: User = { id: "1", name: "Agent Smith", email: "agent@example.com", subscriptionTier: "pro" };
    setUser(mockUser);
    localStorage.setItem("tourvision_user", JSON.stringify(mockUser));
    setLocation("/dashboard");
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("tourvision_user");
    setLocation("/login");
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}