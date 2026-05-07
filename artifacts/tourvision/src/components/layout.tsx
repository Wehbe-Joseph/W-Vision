import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { LayoutDashboard, PlusCircle, LayoutGrid, BarChart2, Settings, CreditCard, Menu, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

function NavItems() {
  const [location] = useLocation();
  const nav = [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { label: "New Tour", href: "/dashboard/new-tour", icon: PlusCircle },
    { label: "My Tours", href: "/dashboard/tours", icon: LayoutGrid },
    { label: "Analytics", href: "/dashboard/analytics", icon: BarChart2 },
    { label: "Settings", href: "/dashboard/settings", icon: Settings },
    { label: "Billing", href: "/dashboard/billing", icon: CreditCard },
  ];

  return (
    <nav className="flex flex-col gap-2 p-4">
      {nav.map((item) => {
        const active = location === item.href;
        return (
          <Link key={item.href} href={item.href} className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-accent"}`}>
            <item.icon className="w-5 h-5" />
            <span className="font-medium">{item.label}</span>
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
      <header className="md:hidden flex items-center justify-between p-4 border-b border-border bg-card">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-primary" />
          <span className="font-serif font-bold text-xl tracking-tight">TourVision</span>
        </div>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon"><Menu /></Button>
          </SheetTrigger>
          <SheetContent side="left" className="bg-card w-[240px] p-0 flex flex-col border-r border-border">
             <div className="p-4 border-b border-border flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-primary" />
                <span className="font-serif font-bold text-xl tracking-tight">TourVision</span>
              </div>
              <div className="p-4 border-b border-border flex items-center gap-3">
                <Avatar className="h-10 w-10 border border-border">
                  <AvatarFallback className="bg-muted text-foreground">
                    {user?.firstName?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col">
                  <span className="text-sm font-bold">{user?.firstName ?? user?.email ?? "User"}</span>
                  <span className="text-xs text-muted-foreground uppercase">Free Plan</span>
                </div>
              </div>
              <div className="flex-1 overflow-auto"><NavItems /></div>
              <div className="p-4 border-t border-border mt-auto">
                <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:text-destructive" onClick={logout}>
                  <LogOut className="w-4 h-4 mr-2" /> Logout
                </Button>
              </div>
          </SheetContent>
        </Sheet>
      </header>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-[240px] flex-col border-r border-border bg-card">
        <div className="p-6 border-b border-border flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-primary" />
          <span className="font-serif font-bold text-2xl tracking-tight">TourVision</span>
        </div>
        <div className="p-4 border-b border-border flex items-center gap-3">
          <Avatar className="h-10 w-10 border border-border">
            <AvatarFallback className="bg-muted text-foreground">
              {user?.firstName?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? "U"}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <span className="text-sm font-bold">{user?.firstName ?? user?.email ?? "User"}</span>
            <span className="text-xs text-primary uppercase font-mono">Free Plan</span>
          </div>
        </div>
        <div className="flex-1 py-4 overflow-y-auto">
          <NavItems />
        </div>
        <div className="p-4 border-t border-border mt-auto flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex justify-between text-xs text-muted-foreground font-mono">
              <span>Tours used</span>
              <span>4 of 15</span>
            </div>
            <Progress value={26} className="h-2" />
            <Link href="/dashboard/billing" className="text-xs text-primary hover:underline">Upgrade for more →</Link>
          </div>
          <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:text-destructive" onClick={logout}>
            <LogOut className="w-4 h-4 mr-2" /> Logout
          </Button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-h-0 overflow-auto relative">
        {children}
      </main>
    </div>
  );
}