import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { SefazService } from './sefaz.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

interface AuthRequest {
  user: { id: string };
}

@UseGuards(JwtAuthGuard)
@Controller('teams/:teamId/sefaz')
export class SefazOverviewController {
  constructor(private readonly sefazService: SefazService) {}

  @Get()
  list(
    @Param('teamId') teamId: string,
    @Req() req: AuthRequest,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.sefazService.listForTeam(teamId, req.user.id, {
      search,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
  }
}
