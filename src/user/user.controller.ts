import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { UserService } from './user.service';
import { ChangePasswordDto } from './dto/change-password.dto';
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
  @Get('check-email')
  async checkEmail(
    @Query('email') email: string | undefined,
    @Res() res: Response,
  ) {
    const result = await this.userService.checkEmailExists(email);
    if (!result.success) {
      return res.status(getErrorStatusCode(result)).json(result);
    }
    return res.status(200).json(result);
  }

  @Public()
  @Get('check-phone')
  async checkPhone(
    @Query('phone') phone: string | undefined,
    @Res() res: Response,
  ) {
    const result = await this.userService.checkPhoneExists(phone);
    if (!result.success) {
      return res.status(getErrorStatusCode(result)).json(result);
    }
    return res.status(200).json(result);
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

  @Post('change-password')
  async changePassword(
    @Req() req: any,
    @Body() body: ChangePasswordDto,
    @Res() res: Response,
  ) {
    const result = await this.userService.changePassword(
      req?.user?.id,
      req?.user?.email,
      body.oldPassword,
      body.newPassword,
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
