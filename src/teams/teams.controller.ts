import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { TeamsService } from './teams.service.js';
import { CreateTeamDto } from './dto/create-team.dto.js';
import { InviteMemberDto } from './dto/invite-member.dto.js';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

interface AuthRequest {
  user: { id: string };
}

@UseGuards(JwtAuthGuard)
@Controller('teams')
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Post()
  create(@Req() req: AuthRequest, @Body() dto: CreateTeamDto) {
    return this.teamsService.create(req.user.id, dto);
  }

  @Get()
  findMyTeams(@Req() req: AuthRequest) {
    return this.teamsService.findMyTeams(req.user.id);
  }

  @Get(':teamId')
  findOne(@Param('teamId') teamId: string, @Req() req: AuthRequest) {
    return this.teamsService.findOne(teamId, req.user.id);
  }

  @Patch(':teamId')
  updateTeam(
    @Param('teamId') teamId: string,
    @Req() req: AuthRequest,
    @Body('name') name: string,
  ) {
    return this.teamsService.updateTeam(teamId, req.user.id, name);
  }

  @Post(':teamId/members')
  inviteMember(
    @Param('teamId') teamId: string,
    @Req() req: AuthRequest,
    @Body() dto: InviteMemberDto,
  ) {
    return this.teamsService.inviteMember(teamId, req.user.id, dto);
  }

  @Patch(':teamId/members/:memberId/role')
  updateMemberRole(
    @Param('teamId') teamId: string,
    @Param('memberId') memberId: string,
    @Req() req: AuthRequest,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.teamsService.updateMemberRole(teamId, memberId, req.user.id, dto);
  }

  @Delete(':teamId/members/:memberId')
  removeMember(
    @Param('teamId') teamId: string,
    @Param('memberId') memberId: string,
    @Req() req: AuthRequest,
  ) {
    return this.teamsService.removeMember(teamId, memberId, req.user.id);
  }
}
