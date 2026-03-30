import { Controller, Delete, Get, Param, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DriveService } from './drive.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

interface AuthRequest {
  user: { id: string };
}

@UseGuards(JwtAuthGuard)
@Controller('teams/:teamId/drive')
export class DriveController {
  constructor(private readonly driveService: DriveService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @Param('teamId') teamId: string,
    @Req() req: AuthRequest,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.driveService.upload(teamId, req.user.id, file);
  }

  @Get()
  findAll(
    @Param('teamId') teamId: string,
    @Req() req: AuthRequest,
  ) {
    return this.driveService.findAll(teamId, req.user.id);
  }

  @Delete(':fileId')
  remove(
    @Param('teamId') teamId: string,
    @Param('fileId') fileId: string,
    @Req() req: AuthRequest,
  ) {
    return this.driveService.remove(teamId, fileId, req.user.id);
  }
}
