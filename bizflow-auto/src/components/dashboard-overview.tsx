import Link from "next/link";
import type { ReactNode } from "react";
import { DashboardCard } from "@/components/dashboard-card";
import { ModuleIcon, type ModuleIconName } from "@/components/module-icon";

export type DashboardMetric = {
  label: string;
  value: string;
  icon: ModuleIconName;
  tone?: "blue" | "green" | "purple" | "amber" | "rose";
};

export type DashboardAction = {
  label: string;
  href: string;
  icon: ModuleIconName;
  tone: "blue" | "green" | "purple" | "amber" | "cyan";
};

const metricTones = {
  blue: "border-blue-100 bg-blue-50/80",
  green: "border-emerald-100 bg-emerald-50/80",
  purple: "border-violet-100 bg-violet-50/80",
  amber: "border-amber-100 bg-amber-50/80",
  rose: "border-rose-100 bg-rose-50/80",
} as const;

const actionTones = {
  blue: "bg-blue-600 hover:bg-blue-700",
  green: "bg-emerald-600 hover:bg-emerald-700",
  purple: "bg-violet-600 hover:bg-violet-700",
  amber: "bg-orange-500 hover:bg-orange-600",
  cyan: "bg-cyan-600 hover:bg-cyan-700",
} as const;

function Panel({
  title,
  icon,
  href,
  rightSlot,
  children,
}: {
  title: string;
  icon: ModuleIconName;
  href?: string;
  rightSlot?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-soft sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-black text-slate-900">
          <ModuleIcon name={icon} className="h-4 w-4 text-blue-600" />
          {title}
        </h2>
        {rightSlot}
        {href && (
          <Link href={href} className="text-xs font-semibold text-blue-700 hover:underline">
            View all
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

export function DashboardOverview({
  metrics,
  chartTitle,
  chartIcon = "report",
  chart,
  scheduleTitle,
  scheduleIcon = "appointment",
  scheduleHref,
  schedule,
  recentTitle,
  recentIcon = "job",
  recentHref,
  recent,
  actions,
}: {
  metrics: DashboardMetric[];
  chartTitle: string;
  chartIcon?: ModuleIconName;
  chart: ReactNode;
  scheduleTitle: string;
  scheduleIcon?: ModuleIconName;
  scheduleHref?: string;
  schedule: ReactNode;
  recentTitle: string;
  recentIcon?: ModuleIconName;
  recentHref?: string;
  recent: ReactNode;
  actions: DashboardAction[];
}) {
  return (
    <div className="space-y-4 sm:space-y-5">
      <section aria-label="Key metrics" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {metrics.map((metric, index) => (
          <DashboardCard
            key={metric.label}
            title={metric.label}
            value={metric.value}
            icon={metric.icon}
            className={metricTones[metric.tone ?? (["blue", "green", "purple", "amber", "rose"] as const)[index % 5]]}
          />
        ))}
      </section>

      <div className="grid gap-4 lg:grid-cols-[1.65fr_0.95fr]">
        <Panel
          title={chartTitle}
          icon={chartIcon}
          rightSlot={<span className="rounded-md bg-blue-600 px-2.5 py-1 text-[10px] font-semibold text-white">7 Days</span>}
        >
          {chart}
        </Panel>
        <Panel title={scheduleTitle} icon={scheduleIcon} href={scheduleHref}>{schedule}</Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.65fr_0.95fr]">
        <Panel title={recentTitle} icon={recentIcon} href={recentHref}>{recent}</Panel>
        <Panel title="Quick actions" icon="service">
          <div className="grid gap-2">
            {actions.map((action) => (
              <Link
                key={`${action.href}-${action.label}`}
                href={action.href}
                className={`flex min-h-9 items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold text-white transition ${actionTones[action.tone]}`}
              >
                <ModuleIcon name={action.icon} />
                <span>{action.label}</span>
              </Link>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

export type DashboardSeries = {
  label: string;
  color: string;
  values: number[];
  kind: "bar" | "line";
};

export function DashboardTrendChart({ labels, series }: { labels: string[]; series: DashboardSeries[] }) {
  const chartWidth = 700;
  const chartHeight = 190;
  const left = 38;
  const top = 10;
  const innerWidth = chartWidth - left - 10;
  const innerHeight = chartHeight - top - 22;
  const maxValue = Math.max(1, ...series.flatMap(({ values }) => values));
  const xAt = (index: number) => left + (labels.length < 2 ? innerWidth / 2 : (index * innerWidth) / (labels.length - 1));
  const yAt = (value: number) => top + innerHeight - (value / maxValue) * innerHeight;
  const barSeries = series.filter((item) => item.kind === "bar");
  const barWidth = Math.min(26, innerWidth / Math.max(labels.length * 2, 1));

  return (
    <div>
      <div className="overflow-hidden">
        <svg
          role="img"
          aria-label={`${series.map((item) => item.label).join(", ")} over ${labels.length} days`}
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="h-40 w-full"
          preserveAspectRatio="none"
        >
          {[0, 1, 2, 3].map((line) => {
            const y = top + (innerHeight * line) / 3;
            return <line key={line} x1={left} y1={y} x2={chartWidth - 8} y2={y} stroke="#e2e8f0" strokeDasharray="4 5" />;
          })}
          {labels.map((label, index) => (
            <g key={`${label}-${index}`}>
              <line x1={xAt(index)} y1={top} x2={xAt(index)} y2={top + innerHeight} stroke="#f1f5f9" />
              <text x={xAt(index)} y={chartHeight - 4} textAnchor="middle" fill="#64748b" fontSize="11">{label}</text>
            </g>
          ))}
          {barSeries.map((item, seriesIndex) => item.values.map((value, index) => {
            const groupWidth = Math.min(38, innerWidth / Math.max(labels.length, 1));
            const x = xAt(index) - groupWidth / 2 + (seriesIndex - (barSeries.length - 1) / 2) * (barWidth + 2);
            const height = (value / maxValue) * innerHeight;
            return <rect key={`${item.label}-${index}`} x={x} y={top + innerHeight - height} width={barWidth} height={height} rx="3" fill={item.color}><title>{`${item.label}: ${value}`}</title></rect>;
          }))}
          {series.filter((item) => item.kind === "line").map((item) => {
            const points = item.values.map((value, index) => `${xAt(index)},${yAt(value)}`).join(" ");
            return (
              <g key={item.label}>
                <polyline points={points} fill="none" stroke={item.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
                {item.values.map((value, index) => (
                  <circle key={`${item.label}-${index}`} cx={xAt(index)} cy={yAt(value)} r="3.2" fill={item.color}>
                    <title>{`${item.label}: ${value}`}</title>
                  </circle>
                ))}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 border-t border-slate-100 pt-3">
        {series.map((item) => (
          <span key={item.label} className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}
