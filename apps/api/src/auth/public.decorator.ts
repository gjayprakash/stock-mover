import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'auth:public';
/** Route (or controller) needs no signed-in user, even when AUTH_REQUIRED=true. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
