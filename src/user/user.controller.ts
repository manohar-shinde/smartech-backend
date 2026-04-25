import { Body, Controller, Headers, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { UserService } from './user.service';
import { Public } from 'src/auth/public.decorator';
import { getErrorStatusCode } from 'src/common/http-status.util';

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Public()
  @Post('register')
  async create(@Body() body: any, @Res() res: Response) {
    const result = await this.userService.createUser(body);
    if (!result.success) {
      return res.status(getErrorStatusCode(result)).json(result);
    }
    return res.status(201).json(result);
  }

  @Public()
  @Post('login')
  async login(@Body() body: any, @Res() res: Response) {
    const { email, password } = body;
    const result = await this.userService.loginUser(email, password);
    if (!result.success) {
      return res.status(getErrorStatusCode(result)).json(result);
    }
    return res.status(200).json(result);
  }

  @Public()
  @Post('refresh')
  async refresh(@Body() body: { refreshToken: string }, @Res() res: Response) {
    const result = await this.userService.refreshUserSession(
      body?.refreshToken,
    );
    if (!result.success) {
      return res.status(getErrorStatusCode(result)).json(result);
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
    const result = await this.userService.logoutUser(
      sessionToken,
      body?.refreshToken,
    );
    if (!result.success) {
      return res.status(getErrorStatusCode(result)).json(result);
    }
    return res.status(200).json(result);
  }
}
