import type { UserRole } from "@/lib/auth";

export type Permission =
  | "dashboard:read"
  | "reports:read"
  | "customers:read"
  | "customers:write"
  | "customers:delete"
  | "vehicles:read"
  | "vehicles:write"
  | "vehicles:delete"
  | "mechanics:read"
  | "mechanics:write"
  | "services:read"
  | "services:write"
  | "services:delete"
  | "appointments:read"
  | "appointments:write"
  | "receptions:read"
  | "receptions:write"
  | "inspections:read"
  | "inspections:write"
  | "diagnostics:read"
  | "diagnostics:write"
  | "quotations:read"
  | "quotations:write"
  | "jobCards:manage"
  | "mechanic:jobs"
  | "spareParts:read"
  | "spareParts:write"
  | "spareParts:delete"
  | "invoices:read"
  | "invoices:write"
  | "payments:read"
  | "payments:write"
  | "expenses:manage"
  | "users:manage"
  | "leave:apply"
  | "leave:manage"
  | "audit:read";

const allPermissions: readonly Permission[] = [
  "dashboard:read",
  "reports:read",
  "customers:read",
  "customers:write",
  "customers:delete",
  "vehicles:read",
  "vehicles:write",
  "vehicles:delete",
  "mechanics:read",
  "mechanics:write",
  "services:read",
  "services:write",
  "services:delete",
  "appointments:read",
  "appointments:write",
  "receptions:read",
  "receptions:write",
  "inspections:read",
  "inspections:write",
  "diagnostics:read",
  "diagnostics:write",
  "quotations:read",
  "quotations:write",
  "jobCards:manage",
  "mechanic:jobs",
  "spareParts:read",
  "spareParts:write",
  "spareParts:delete",
  "invoices:read",
  "invoices:write",
  "payments:read",
  "payments:write",
  "expenses:manage",
  "users:manage",
  "leave:apply",
  "leave:manage",
  "audit:read",
];

const rolePermissions: Record<UserRole, readonly Permission[]> = {
  ADMIN: allPermissions,
  SUPER_ADMIN: allPermissions,
  GARAGE_MANAGER: [
    "dashboard:read",
    "reports:read",
    "customers:read",
    "customers:write",
    "customers:delete",
    "vehicles:read",
    "vehicles:write",
    "vehicles:delete",
    "mechanics:read",
    "mechanics:write",
    "services:read",
    "services:write",
    "services:delete",
    "appointments:read",
    "appointments:write",
    "receptions:read",
    "receptions:write",
    "inspections:read",
    "inspections:write",
    "diagnostics:read",
    "diagnostics:write",
    "quotations:read",
    "quotations:write",
    "jobCards:manage",
    "spareParts:read",
    "spareParts:write",
    "spareParts:delete",
    "invoices:read",
    "invoices:write",
    "payments:read",
    "payments:write",
    "expenses:manage",
    "leave:apply",
    "leave:manage",
  ],
  SERVICE_ADVISOR: [
    "dashboard:read",
    "customers:read",
    "customers:write",
    "vehicles:read",
    "vehicles:write",
    "mechanics:read",
    "services:read",
    "appointments:read",
    "appointments:write",
    "receptions:read",
    "receptions:write",
    "inspections:read",
    "inspections:write",
    "diagnostics:read",
    "diagnostics:write",
    "quotations:read",
    "quotations:write",
    "jobCards:manage",
    "leave:apply",
  ],
  MECHANIC: [
    "dashboard:read",
    "mechanic:jobs",
    "spareParts:read",
    "inspections:read",
    "inspections:write",
    "diagnostics:read",
    "diagnostics:write",
    "leave:apply",
  ],
  STOREKEEPER: ["dashboard:read", "spareParts:read", "spareParts:write", "leave:apply"],
  ACCOUNTANT: [
    "dashboard:read",
    "reports:read",
    "invoices:read",
    "invoices:write",
    "payments:read",
    "payments:write",
    "expenses:manage",
    "leave:apply",
  ],
  CUSTOMER: [],
};

const homePaths: Record<UserRole, string> = {
  ADMIN: "/dashboard",
  SUPER_ADMIN: "/dashboard",
  GARAGE_MANAGER: "/dashboard",
  SERVICE_ADVISOR: "/dashboard",
  MECHANIC: "/dashboard",
  STOREKEEPER: "/dashboard",
  ACCOUNTANT: "/dashboard",
  CUSTOMER: "/customer/dashboard",
};

export function hasPermission(role: UserRole, permission: Permission) {
  return rolePermissions[role].includes(permission);
}

export function getRoleHomePath(role: UserRole) {
  return homePaths[role];
}
