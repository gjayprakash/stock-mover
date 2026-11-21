import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'auth:public';
/** Route (or controller) needs no signed-in user. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
