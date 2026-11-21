import { Body, Controller, Get, Param, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { isHttps } from './http';
import { Roles } from './roles.decorator';
import { UsersService } from './users.service';

/** `https://<host>/invite#<token>`: the fragment never reaches server logs. */
const inviteUrl = (req: Request, token: string) => `${isHttps(req) ? 'https' : 'http'}://${req.headers.host}/invite#${token}`;

@Roles('super_admin')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Post()
  async create(@Body() body: Record<string, unknown>, @Req() req: Request) {
    const { user, token } = await this.users.create(body ?? {}, req.user!.id);
    return { user, invite_url: inviteUrl(req, token) };
  }

  @Get()
  list() {
    return this.users.list();
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.users.update(id, body ?? {});
  }

  @Post(':id/invite')
  async invite(@Param('id') id: string, @Req() req: Request) {
    return { invite_url: inviteUrl(req, await this.users.invite(id)) };
  }
}
