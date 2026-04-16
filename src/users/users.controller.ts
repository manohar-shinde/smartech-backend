import { Body, Controller, Headers, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { UsersService } from './users.service';
import { Public } from 'src/auth/public.decorator';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Public()
  @Post('register')
  async create(@Body() body: any, @Res() res: Response) {
    const result = await this.usersService.createUser(body);
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.status(201).json(result);
  }

  @Public()
  @Post('login')
  async login(@Body() body: any, @Res() res: Response) {
    const { email, password } = body;
    const result = await this.usersService.loginUser(email, password);
    if (!result.success) {
      return res.status(401).json(result);
    }
    return res.status(200).json(result);
  }

  @Public()
  @Post('refresh')
  async refresh(@Body() body: { refreshToken: string }, @Res() res: Response) {
    const result = await this.usersService.refreshUserSession(
      body?.refreshToken,
    );
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.status(200).json(result);
  }

  @Post('logout')
  async logout(
    @Headers('authorization') authorization: string,
    @Body() body: { refreshToken: string },
    @Res() res: Response,
  ) {
    const sessionToken = authorization?.startsWith('Bearer ')
      ? authorization.slice(7)
      : '';
    const result = await this.usersService.logoutUser(
      sessionToken,
      body?.refreshToken,
    );
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.status(200).json(result);
  }
}
