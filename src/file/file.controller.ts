import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Query,
  Res,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FileService } from './file.service';
import { UploadFileDto } from './dto/upload-file.dto';
import type { Response } from 'express';

@Controller('file')
export class FileController {
  constructor(private readonly fileService: FileService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @Req() req: any,
    @UploadedFile() file: any,
    @Body() body: UploadFileDto,
    @Res() res: Response,
  ) {
    const result = await this.fileService.uploadFileForUser(
      req?.user?.id,
      file,
      body,
    );
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.status(201).json(result);
  }

  @Get()
  async listMyFiles(@Req() req: any, @Res() res: Response) {
    const result = await this.fileService.listFilesForUser(req?.user?.id);
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.status(200).json(result);
  }

  @Get('download-url')
  async getDownloadUrl(
    @Req() req: any,
    @Res() res: Response,
    @Query('path') path?: string,
    @Query('expiresIn') expiresIn?: string,
  ) {
    const expiresInSeconds = expiresIn ? parseInt(expiresIn, 10) : 60 * 10;
    const result = await this.fileService.getDownloadUrlByPath(
      req?.user?.id,
      path || '',
      expiresInSeconds,
    );
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.status(200).json(result);
  }

  @Get('open')
  async openFile(
    @Req() req: any,
    @Res() res: Response,
    @Query('path') path?: string,
  ) {
    const result = await this.fileService.getOpenUrlForUserPath(
      req?.user?.id,
      path || '',
    );

    if (!result.success) {
      return res.status(400).json(result);
    }

    if (!result.data?.redirect_url) {
      return res
        .status(500)
        .json({ success: false, message: 'Redirect URL not available' });
    }

    return res.redirect(result.data.redirect_url);
  }

  @Delete()
  deleteFile(@Req() req: any, @Query('path') path?: string) {
    return this.fileService.deleteFileByPath(req?.user?.id, path || '');
  }
}
