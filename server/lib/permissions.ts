/** All workspace permission actions. Super Admin always receives the full set. */
export const ALL_ACTIONS = [
  "view",
  "add",
  "edit",
  "book",
  "hold",
  "cancel",
  "payment_view",
  "payment_entry",
  "approve",
  "reports",
  "export",
] as const;

export type Action = (typeof ALL_ACTIONS)[number];

export function isSuperAdminRole(role: { name: string; isSystem?: boolean }) {
  return role.name === "Super Admin" || (Boolean(role.isSystem) && /super\s*admin/i.test(role.name));
}
