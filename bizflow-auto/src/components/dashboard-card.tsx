import { ModuleIcon, type ModuleIconName } from "@/components/module-icon";

type DashboardCardProps = {
  title: string;
  value: string;
  icon: ModuleIconName;
  change?: string;
  className?: string;
};

export function DashboardCard({ title, value, icon, change, className = "" }: DashboardCardProps) {
  return (
    <div className={`min-w-0 rounded-xl border border-slate-200 ${className || "bg-white"} p-4 shadow-soft`}>
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/80 text-blue-600 shadow-sm">
          <ModuleIcon name={icon} />
        </span>
        {title}
      </div>
      <div className="mt-3 flex items-end justify-between">
        <div className="truncate text-2xl font-black text-slate-900 sm:text-3xl">{value}</div>
        {change && <div className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">{change}</div>}
      </div>
    </div>
  );
}
