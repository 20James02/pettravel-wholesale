import type { PermissionKey, UserAccount } from "../lib/domain.ts";


export function hasPermission(user: UserAccount, permission: PermissionKey): boolean {
  if (user.role === "super_admin") return true;
  return user.permissions.includes(permission);
}
