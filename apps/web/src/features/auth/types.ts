import type { UserRow } from '@sm/contract';

export type { Me, Role } from '@sm/contract';

export type UserStatus = 'active' | 'invited' | 'off';

/** A store manager row as the screen uses it: status as a key, mobile always a string. */
export type ManagerRow = Omit<UserRow, 'status' | 'mobile' | 'created_at'> & { mobile: string; status: UserStatus };
