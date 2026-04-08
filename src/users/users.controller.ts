import { Controller, Post, Body, Headers } from '@nestjs/common';
import { UsersService } from './users.service';
import { Public } from 'src/auth/public.decorator';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Public()
  @Post('register')
  create(@Body() body: any) {
    return this.usersService.createUser(body);
  }

  @Public()
  @Post('login')
  login(@Body() body: any) {
    const { email, password } = body;
    return this.usersService.loginUser(email, password);
  }

  @Public()
  @Post('refresh')
  refresh(@Body() body: { refreshToken: string }) {
    return this.usersService.refreshUserSession(body?.refreshToken);
  }

  @Post('logout')
  logout(
    @Headers('authorization') authorization: string,
    @Body() body: { refreshToken: string },
  ) {
    const sessionToken = authorization?.startsWith('Bearer ')
      ? authorization.slice(7)
      : '';

    return this.usersService.logoutUser(sessionToken, body?.refreshToken);
  }
}
