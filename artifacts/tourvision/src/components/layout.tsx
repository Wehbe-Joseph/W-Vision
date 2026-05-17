import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import {
  LayoutDashboard,
  PlusCircle,
  LayoutGrid,
  BarChart2,
  Settings,
  CreditCard,
  Menu,
  LogOut,
  Download,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import WVisionLogo from "@/components/WVisionLogo";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "New Tour", href: "/dashboard/new-tour", icon: PlusCircle },
  { label: "Import Listing", href: "/dashboard/import", icon: Download },
  { label: "My Tours", href: "/dashboard/tours", icon: LayoutGrid },
  { label: "Analytics", href: "/dashboard/analytics", icon: BarChart2 },
  { label: "Billing", href: "/dashboard/billing", icon: CreditCard },
  { label: "Settings", href: "/dashboard/settings", icon: Settings },
];

function NavItems() {
  const [location] = useLocation();

  return (
    <nav className="flex flex-col gap-3">
      {navItems.map((item) => {
        const active = location === item.href;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            title={item.label}
            className={`group relative h-12 w-12 rounded-full border transition-all flex items-center justify-center ${
              active
                ? "bg-[#111827] text-white border-[#111827]"
                : "bg-white text-zinc-500 border-zinc-200 hover:text-zinc-900 hover:border-zinc-300"
            }`}
          >
            <Icon className="w-5 h-5" />
            <span className="absolute left-14 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-md bg-zinc-900 px-2 py-1 text-[11px] text-white opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity">
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-[#f5f4ef] flex flex-col md:flex-row">
      {/* Mobile header */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-zinc-200 bg-white">
        <div className="flex items-center gap-2">
          <WVisionLogo className="h-6 w-auto object-contain" />
        </div>
        <Sheet>
          <SheetTrigger asChild>
            <button className="rounded-full border border-zinc-300 bg-white p-2">
              <Menu className="w-5 h-5" />
            </button>
          </SheetTrigger>
          <SheetContent side="left" className="bg-[#f5f4ef] w-[280px] p-4 flex flex-col border-r border-zinc-200">
            <div className="px-2 py-2 flex items-center gap-2">
              <WVisionLogo className="h-7 w-auto object-contain" />
            </div>
            <div className="mt-4 rounded-2xl bg-white border border-zinc-200 p-3 flex items-center gap-3">
              <Avatar className="h-10 w-10 border border-zinc-200">
                <AvatarFallback className="bg-zinc-900 text-white font-semibold text-sm">
                  {user?.firstName?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? "U"}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col">
                <span className="text-sm font-semibold">{user?.firstName ?? user?.email ?? "User"}</span>
                <span className="text-xs text-zinc-500">WVision Account</span>
              </div>
            </div>
            <div className="mt-5 rounded-3xl bg-white border border-zinc-200 p-3 w-fit">
              <NavItems />
            </div>
            <div className="mt-auto pt-4">
              <button
                onClick={logout}
                className="h-12 w-12 rounded-full border border-zinc-200 bg-white text-zinc-500 hover:text-zinc-900 inline-flex items-center justify-center"
                title="Logout"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </SheetContent>
        </Sheet>
      </header>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-[128px] py-5 px-3">
        <div className="w-full rounded-[28px] bg-white border border-zinc-200 flex flex-col items-center py-4 px-2">
          <WVisionLogo className="h-9 w-auto object-contain" />
          <span className="text-[11px] text-zinc-600 mt-1 font-medium">WVision</span>

          <div className="mt-6 rounded-3xl bg-[#f5f4ef] border border-zinc-200 p-2">
            <NavItems />
          </div>

          <div className="mt-auto flex flex-col items-center gap-3 pt-4">
            <button
              onClick={logout}
              className="h-11 w-11 rounded-full border border-zinc-200 bg-white text-zinc-500 hover:text-zinc-900 inline-flex items-center justify-center"
              title="Logout"
            >
              <LogOut className="w-4.5 h-4.5" />
            </button>
            <Avatar className="h-11 w-11 border border-zinc-200">
              <AvatarFallback className="bg-zinc-900 text-white font-semibold text-sm">
                {user?.firstName?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? "U"}
              </AvatarFallback>
            </Avatar>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-h-0 overflow-auto relative px-1 md:px-2">
        {children}
      </main>
    </div>
  );
}
