import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { PartnerJwtGuard } from '../partner-auth/guards/partner-jwt.guard.js';
import { PartnersService } from './partners.service.js';
import { LandingPagesService } from '../landing-pages/landing-pages.service.js';

interface PartnerRequest {
  user: { id: string; email: string; slug: string; status: string };
}

@UseGuards(PartnerJwtGuard)
@Controller('partner')
export class PartnersPartnerController {
  constructor(
    private readonly partnersService: PartnersService,
    private readonly landingPagesService: LandingPagesService,
  ) {}

  @Get('dashboard')
  dashboard(@Req() req: PartnerRequest) {
    return this.partnersService.dashboard(req.user.id);
  }

  @Get('referred-teams')
  referredTeams(@Req() req: PartnerRequest) {
    return this.partnersService.listReferredTeams(req.user.id);
  }

  @Get('materials')
  materials() {
    return this.partnersService.listMaterialsForPartner();
  }

  @Get('landing-pages')
  landingPages(@Req() req: PartnerRequest) {
    return this.landingPagesService.listForPartner(req.user.slug);
  }
}
