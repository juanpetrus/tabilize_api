import { Body, Controller, Post } from '@nestjs/common';
import { LeadsService } from './leads.service.js';
import { CreateLeadLpDto } from './dto/create-lead-lp.dto.js';

@Controller('leads')
export class LeadsPublicController {
  constructor(private readonly leadsService: LeadsService) {}

  /**
   * Endpoint público para o formulário das Landing Pages.
   * Frontend envia dados do form + landingPageId + partnerSlug (cookie).
   */
  @Post('landing-page')
  createFromLandingPage(@Body() dto: CreateLeadLpDto) {
    return this.leadsService.createFromLandingPage(dto);
  }
}
