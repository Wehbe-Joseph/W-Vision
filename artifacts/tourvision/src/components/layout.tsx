import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { LayoutDashboard, PlusCircle, LayoutGrid, BarChart2, Settings, CreditCard, Menu, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, dot: "bg-[#00C853]" },
  { label: "New Tour", href: "/dashboard/new-tour", icon: PlusCircle, dot: "bg-primary" },
  { label: "My Tours", href: "/dashboard/tours", icon: LayoutGrid, dot: "bg-[#FFD000]" },
  { label: "Analytics", href: "/dashboard/analytics", icon: BarChart2, dot: "bg-[#00C853]" },
  { label: "Settings", href: "/dashboard/settings", icon: Settings, dot: "bg-muted-foreground" },
  { label: "Billing", href: "/dashboard/billing", icon: CreditCard, dot: "bg-primary" },
];

function NavItems() {
  const [location] = useLocation();

  return (
    <nav className="flex flex-col gap-1 p-3">
      {navItems.map((item) => {
        const active = location === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 px-3 py-2.5 transition-all border-2 ${
              active
                ? "bg-foreground text-background border-foreground"
                : "border-transparent hover:border-foreground hover:bg-accent"
            }`}
          >
            <span className={`w-2 h-2 shrink-0 ${active ? "bg-primary" : item.dot}`} />
            <span className="font-bold text-sm uppercase tracking-wide">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Mobile header */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 border-b-2 border-foreground bg-card">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 bg-primary" />
          <span className="font-serif text-xl tracking-tight">TOURVISION</span>
        </div>
        <Sheet>
          <SheetTrigger asChild>
            <button className="border-2 border-foreground p-1.5">
              <Menu className="w-5 h-5" />
            </button>
          </SheetTrigger>
          <SheetContent side="left" className="bg-card w-[260px] p-0 flex flex-col border-r-2 border-foreground rounded-none">
            <div className="px-4 py-4 border-b-2 border-foreground flex items-center gap-2">
              <span className="w-2.5 h-2.5 bg-primary" />
              <span className="font-serif text-xl tracking-tight">TOURVISION</span>
            </div>
            <div className="px-4 py-3 border-b-2 border-foreground flex items-center gap-3">
              <Avatar className="h-9 w-9 rounded-none border-2 border-foreground">
                <AvatarFallback className="bg-foreground text-background font-bold text-sm rounded-none">
                  {user?.firstName?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? "U"}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col">
                <span className="text-sm font-bold uppercase">{user?.firstName ?? user?.email ?? "User"}</span>
                <span className="text-xs text-muted-foreground font-mono uppercase tracking-wide">Free Plan</span>
              </div>
            </div>
            <div className="flex-1 overflow-auto py-2"><NavItems /></div>
            <div className="p-3 border-t-2 border-foreground mt-auto">
              <button
                onClick={logout}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm font-bold uppercase tracking-wide text-muted-foreground hover:text-foreground border-2 border-transparent hover:border-foreground transition-all"
              >
                <LogOut className="w-4 h-4" /> Logout
              </button>
            </div>
          </SheetContent>
        </Sheet>
      </header>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-[240px] flex-col border-r-2 border-foreground bg-card">
        {/* Logo */}
        <div className="px-5 py-5 border-b-2 border-foreground flex items-center gap-2">
          <span className="w-3 h-3 bg-primary" />
          <span className="font-serif text-2xl tracking-tight">TOURVISION</span>
        </div>

        {/* User */}
        <div className="px-4 py-3 border-b-2 border-foreground flex items-center gap-3">
          <Avatar className="h-9 w-9 rounded-none border-2 border-foreground">
            <AvatarFallback className="bg-foreground text-background font-bold text-sm rounded-none">
              {user?.firstName?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? "U"}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-bold uppercase truncate">{user?.firstName ?? user?.email ?? "User"}</span>
            <span className="text-xs text-muted-foreground font-mono uppercase tracking-wide">Free Plan</span>
          </div>
        </div>

        {/* Nav */}
        <div className="flex-1 py-2 overflow-y-auto">
          <NavItems />
        </div>

        {/* Footer */}
        <div className="p-4 border-t-2 border-foreground mt-auto flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <div className="flex justify-between text-xs text-muted-foreground font-mono uppercase">
              <span>Tours used</span>
              <span>4 / 15</span>
            </div>
            <div className="w-full h-2 bg-accent border border-foreground/20">
              <div className="h-full bg-foreground" style={{ width: "26%" }} />
            </div>
            <Link href="/dashboard/billing" className="text-xs font-bold uppercase text-primary hover:underline">
              Upgrade →
            </Link>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-2 px-3 py-2 text-sm font-bold uppercase tracking-wide text-muted-foreground hover:text-foreground border-2 border-transparent hover:border-foreground transition-all w-full"
          >
            <LogOut className="w-4 h-4" /> Logout
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-h-0 overflow-auto relative">
        {children}
      </main>
    </div>
  );
}
