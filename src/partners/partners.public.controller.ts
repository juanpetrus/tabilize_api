import { Controller, NotFoundException, Param, Post } from '@nestjs/common';
import { PartnersService } from './partners.service.js';

@Controller('partners')
export class PartnersPublicController {
  constructor(private readonly partnersService: PartnersService) {}

  /**
   * Registra um clique no link do parceiro e retorna os dados pro frontend
   * setar o cookie `tabilize_ref=<slug>`. Retorna 404 se slug inexistente,
   * inativo ou parceiro não aprovado — sem vazar qual é o motivo.
   */
  @Post('track/:slug')
  async track(@Param('slug') slug: string) {
    const tracked = await this.partnersService.trackBySlug(slug);
    if (!tracked) throw new NotFoundException('Link de parceiro inválido');
    return tracked;
  }
}
