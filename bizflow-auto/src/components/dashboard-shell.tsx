import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { LogoutButton } from "@/components/logout-button";
import { DashboardSearch } from "@/components/dashboard-search";
import { ModuleIcon, type ModuleIconName } from "@/components/module-icon";
import { getSessionUser, type UserRole } from "@/lib/auth";
import { getRoleHomePath, hasPermission, type Permission } from "@/lib/permissions";

type NavGroup = {
  label: string;
  items: {
    href: string;
    label: string;
    shortLabel: string;
    icon: ModuleIconName;
    permission?: Permission;
    roles?: UserRole[];
  }[];
};

const navGroups: NavGroup[] = [
  {
    label: "Account",
    items: [
      { href: "/customer/dashboard", label: "My account", shortLabel: "Home", icon: "home", roles: ["CUSTOMER"] },
      { href: "/customer/dashboard#vehicles", label: "My cars", shortLabel: "Cars", icon: "vehicle", roles: ["CUSTOMER"] },
      { href: "/customer/dashboard#book-service", label: "Book service", shortLabel: "Book", icon: "appointment", roles: ["CUSTOMER"] },
      { href: "/customer/quotations", label: "Quotes", shortLabel: "Quotes", icon: "quote", roles: ["CUSTOMER"] },
      { href: "/customer/dashboard#reminders", label: "Reminders", shortLabel: "Remind", icon: "service", roles: ["CUSTOMER"] },
      { href: "/customer/dashboard#appointments", label: "Bookings", shortLabel: "Jobs", icon: "job", roles: ["CUSTOMER"] },
      { href: "/customer/dashboard#invoices", label: "Bills", shortLabel: "Bills", icon: "invoice", roles: ["CUSTOMER"] },
    ],
  },
  {
    label: "Home",
    items: [
      { href: "/dashboard", label: "Dashboard", shortLabel: "Dashboard", icon: "home", permission: "dashboard:read" },
      { href: "/reports", label: "Reports", shortLabel: "Reports", icon: "report", permission: "reports:read" },
      { href: "/mechanic/dashboard", label: "Jobs", shortLabel: "Jobs", icon: "job", roles: ["MECHANIC"] },
    ],
  },
  {
    label: "Work",
    items: [
      { href: "/leave", label: "Leave", shortLabel: "Leave", icon: "leave", roles: ["ADMIN", "SUPER_ADMIN", "GARAGE_MANAGER", "SERVICE_ADVISOR", "MECHANIC", "STOREKEEPER", "ACCOUNTANT"] },
      { href: "/customers", label: "Customers", shortLabel: "Clients", icon: "customer", permission: "customers:read" },
      { href: "/vehicles", label: "Vehicles", shortLabel: "Cars", icon: "vehicle", permission: "vehicles:read" },
      { href: "/mechanics", label: "Mechanics", shortLabel: "Techs", icon: "mechanic", permission: "mechanics:read" },
      { href: "/services", label: "Services", shortLabel: "Services", icon: "service", permission: "services:read" },
      { href: "/appointments", label: "Appointments", shortLabel: "Bookings", icon: "appointment", permission: "appointments:read" },
      { href: "/receptions", label: "Vehicle Reception", shortLabel: "Intake", icon: "reception", permission: "receptions:read" },
      { href: "/inspections", label: "Inspections & Diagnostics", shortLabel: "Inspect", icon: "inspection", permission: "inspections:read" },
      { href: "/quotations", label: "Quotations", shortLabel: "Quotes", icon: "quote", permission: "quotations:read" },
      { href: "/job-cards", label: "Job Cards", shortLabel: "Jobs", icon: "job", permission: "jobCards:manage" },
      { href: "/spare-parts", label: "Spare Parts", shortLabel: "Parts", icon: "parts", permission: "spareParts:read" },
      { href: "/procurement", label: "Procurement", shortLabel: "Orders", icon: "procurement", permission: "spareParts:write" },
    ],
  },
  {
    label: "Money",
    items: [
      { href: "/invoices", label: "Invoices", shortLabel: "Invoices", icon: "invoice", permission: "invoices:read" },
      { href: "/payments", label: "Payments", shortLabel: "Pay", icon: "payment", permission: "payments:read" },
      { href: "/expenses", label: "Expenses", shortLabel: "Costs", icon: "expense", permission: "expenses:manage" },
    ],
  },
  {
    label: "Admin",
    items: [
      { href: "/users", label: "Users & roles", shortLabel: "Users", icon: "users", permission: "users:manage" },
      { href: "/audit-logs", label: "Audit logs", shortLabel: "Audit", icon: "audit", permission: "audit:read" },
    ],
  },
];

type DashboardShellProps = {
  title: string;
  subtitle: string;
  active: string;
  actions?: ReactNode;
  children: ReactNode;
};

export async function DashboardShell({ title, subtitle, active, actions, children }: DashboardShellProps) {
  const user = await getSessionUser();

  if (!user) redirect("/login");
  const isDashboard = active === "Dashboard" || active === "My account";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const canAccessItem = (item: NavGroup["items"][number]) =>
    (item.permission !== undefined && hasPermission(user.role, item.permission)) ||
    (item.roles?.includes(user.role) ?? false);
  const currentItem = navGroups.flatMap((group) => group.items).find((item) => item.label === active);
  if (!currentItem || !canAccessItem(currentItem)) {
    redirect(getRoleHomePath(user.role));
  }
  const visibleItems = navGroups.flatMap((group) => group.items).filter(canAccessItem);

  return (
    <div className="flex min-h-screen bg-[#f3f7fb] text-slate-900">
      <aside className="hidden w-[218px] shrink-0 flex-col bg-[#09213d] px-3 py-4 text-slate-100 lg:flex">
        <Link href={getRoleHomePath(user.role)} className="mb-5 flex items-center gap-2.5 px-2 py-1">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600">
            <ModuleIcon name="vehicle" className="h-6 w-6" />
          </span>
          <span>
            <span className="block text-base font-black leading-tight">BizFlow Auto</span>
            <span className="text-[10px] text-slate-400">Garage Management System</span>
          </span>
        </Link>

        <nav aria-label="Garage modules" className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          {visibleItems.map((item) => {
            const isActive = active === item.label;

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition ${
                  isActive
                    ? "bg-blue-600 text-white shadow-soft"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <ModuleIcon name={item.icon} />
                <span>{item.shortLabel}</span>
                <span className="sr-only">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="my-4 rounded-xl border border-blue-900 bg-[#102d4d] p-3 text-center">
          <ModuleIcon name="vehicle" className="mx-auto h-8 w-8 text-blue-300" />
          <p className="mt-2 text-xs font-semibold">Keep your vehicles running smoothly</p>
        </div>
        <div className="flex items-center gap-2 border-t border-slate-700 px-2 pt-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-600 text-xs font-bold">
            {user.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold">{user.name}</span>
            <span className="block truncate text-[10px] text-slate-400">{user.role.replaceAll("_", " ")}</span>
          </span>
          <LogoutButton compact />
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <div className="flex min-h-14 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-2 shadow-sm sm:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <Link href={getRoleHomePath(user.role)} className="font-black text-slate-900 lg:hidden">BizFlow Auto</Link>
            <details className="relative lg:hidden">
              <summary aria-label="Open garage modules" className="cursor-pointer list-none rounded-lg border border-slate-200 p-2 text-slate-700">
                <span aria-hidden="true">☰</span>
              </summary>
              <nav aria-label="Garage modules" className="absolute left-0 z-20 mt-2 max-h-[70vh] w-64 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
                {visibleItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active === item.label ? "page" : undefined}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${
                      active === item.label ? "bg-blue-600 text-white" : "text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <ModuleIcon name={item.icon} />
                    {item.label}
                  </Link>
                ))}
              </nav>
            </details>
            <div className="min-w-0 flex-1 md:max-w-[480px]">
              <DashboardSearch />
            </div>
            <span className="sr-only">{title}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-xs font-bold text-slate-800">{user.name}</p>
              <p className="text-[10px] text-slate-500">{user.role.replaceAll("_", " ")}</p>
            </div>
            <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-800 lg:hidden">
              {user.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}
            </span>
            <span className="hidden text-xs text-slate-500 md:inline">
              {new Date().toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}
            </span>
            <div className="lg:hidden"><LogoutButton /></div>
          </div>
        </div>

        <div className="mx-auto max-w-[1600px] p-4 sm:p-6">
          {isDashboard ? (
            <section className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-xl font-black text-slate-900 sm:text-2xl">{greeting}, {user.name} 👋</h1>
                <p className="mt-1 text-xs text-slate-500">{subtitle || "Here’s what’s happening in your garage today."}</p>
              </div>
              {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
              <span className="sr-only">{title}</span>
            </section>
          ) : (
            <header className="mb-5 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-soft sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-xl font-black text-slate-900 sm:text-2xl">{title}</h1>
                <p className="sr-only">{subtitle}</p>
              </div>
              {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
            </header>
          )}

          {children}
        </div>
      </main>
    </div>
  );
}
