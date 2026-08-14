import type { PermissionKey, UserAccount } from "../lib/domain.ts";


export function hasPermission(user: UserAccount, permission: PermissionKey): boolean {
  return user.permissions.includes(permission);
}
