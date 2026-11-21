import type { UserRow } from '@sm/contract';

export type { Me, Role } from '@sm/contract';

export type UserStatus = 'active' | 'invited' | 'off';

/** A person (super admin or store manager) as the People screen uses it: status as a key, mobile always a string ('' when none). */
export type PersonRow = Omit<UserRow, 'status' | 'mobile' | 'created_at'> & { mobile: string; status: UserStatus };
/** Older name, kept for existing imports. */
export type ManagerRow = PersonRow;
