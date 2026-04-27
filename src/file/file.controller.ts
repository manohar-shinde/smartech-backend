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
import { PrivateFileDownloadDto } from './dto/private-file-download.dto';
import { UploadFileDto } from './dto/upload-file.dto';
import type { Response } from 'express';
import { getErrorStatusCode } from 'src/common/http-status.util';

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
      return res.status(getErrorStatusCode(result)).json(result);
    }
    return res.status(201).json(result);
  }

  @Post('uploadPublic')
  @UseInterceptors(FileInterceptor('file'))
  async uploadPublic(
    @Req() req: any,
    @UploadedFile() file: any,
    @Body() body: UploadFileDto,
    @Res() res: Response,
  ) {
    const result = await this.fileService.uploadPublicFileForUser(
      req?.user?.id,
      req?.token,
      file,
      body,
    );
    if (!result.success) {
      return res.status(getErrorStatusCode(result)).json(result);
    }
    return res.status(201).json(result);
  }

  @Get()
  async listMyFiles(@Req() req: any, @Res() res: Response) {
    const result = await this.fileService.listFilesForUser(req?.user?.id);
    if (!result.success) {
      return res.status(getErrorStatusCode(result)).json(result);
    }
    return res.status(200).json(result);
  }

  /**
   * JSON body: `file_path` in the `private-files` bucket. Access is allowed if the path
   * is under the current user's folder (`{userId}/...`) or under org/site
   * (`{organizationId}/{siteId}/...`) and the user is an owner or member of that org and
   * the site belongs to the org. Optional `expires_in` (seconds, 60–3600, default 600).
   */
  @Post('private-download')
  async getPrivateDownload(
    @Req() req: any,
    @Body() body: PrivateFileDownloadDto,
    @Res() res: Response,
  ) {
    const result = await this.fileService.getPrivateFileDownloadUrl(
      req?.user?.id,
      body.file_path,
      body.expires_in ?? 60 * 10,
    );
    if (!result.success) {
      return res.status(getErrorStatusCode(result)).json(result);
    }
    return res.status(200).json({
      success: true,
      message: 'Download link created',
      data: result.data,
    });
  }

  /** Query `path` (same rules as `POST /file/private-download` body `file_path`). */
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
      return res.status(getErrorStatusCode(result)).json(result);
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
      return res.status(getErrorStatusCode(result)).json(result);
    }

    if (!result.data?.redirect_url) {
      return res
        .status(500)
        .json({ success: false, message: 'Redirect URL not available' });
    }

    return res.redirect(result.data.redirect_url);
  }

  @Delete()
  async deleteFile(
    @Req() req: any,
    @Query('path') path: string | undefined,
    @Res() res: Response,
  ) {
    const result = await this.fileService.deleteFileByPath(req?.user?.id, path || '');
    if (!result.success) {
      return res.status(getErrorStatusCode(result)).json(result);
    }
    return res.status(200).json(result);
  }
}
