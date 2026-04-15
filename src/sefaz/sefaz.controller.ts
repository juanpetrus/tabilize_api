import { Body, Controller, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { SefazService } from './sefaz.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';

interface AuthRequest {
  user: { id: string };
}

@UseGuards(JwtAuthGuard)
@Controller('teams/:teamId/companies/:companyId/sefaz')
export class SefazController {
  constructor(private readonly sefazService: SefazService) {}

  // Sincroniza com SEFAZ e salva documentos
  @Get('sync')
  fetchNfe(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Req() req: AuthRequest,
  ) {
    return this.sefazService.fetchNfe(teamId, companyId, req.user.id);
  }

  // Lista NF-es salvas
  @Get('nfes')
  listNFes(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Req() req: AuthRequest,
    @Query('tipo') tipo?: string,
    @Query('status') status?: string,
    @Query('modelo') modelo?: string,
    @Query('dataInicio') dataInicio?: string,
    @Query('dataFim') dataFim?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.sefazService.listNFes(teamId, companyId, req.user.id, {
      tipo, status, modelo, dataInicio, dataFim,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  // Busca NF-e na SEFAZ pela chave, cria ou atualiza no banco
  @Post('nfes/buscar-por-chave')
  buscarNFePorChave(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Req() req: AuthRequest,
    @Body('chave') chave: string,
  ) {
    return this.sefazService.buscarNFePorChave(teamId, companyId, req.user.id, chave);
  }

  // Detalhe de uma NF-e com histórico de eventos
  @Get('nfes/:nfeId')
  getNFe(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Param('nfeId') nfeId: string,
    @Req() req: AuthRequest,
  ) {
    return this.sefazService.getNFe(teamId, companyId, req.user.id, nfeId);
  }

  // Consulta NF-e na SEFAZ pela chave e atualiza banco com XML completo
  @Post('nfes/:nfeId/consultar')
  consultarNFe(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Param('nfeId') nfeId: string,
    @Req() req: AuthRequest,
    @Query('force') force?: string,
  ) {
    return this.sefazService.consultarNFe(teamId, companyId, req.user.id, nfeId, force === 'true');
  }

  // Manifestação do destinatário
  @Post('nfes/:nfeId/manifestar')
  manifestar(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Param('nfeId') nfeId: string,
    @Req() req: AuthRequest,
    @Body('tipo') tipo: 'CIENCIA' | 'CONFIRMADA' | 'DESCONHECIMENTO' | 'NAO_REALIZADA',
    @Body('justificativa') justificativa?: string,
  ) {
    return this.sefazService.manifestar(teamId, companyId, req.user.id, nfeId, tipo, justificativa);
  }

  // XML completo da NF-e
  @Get('nfes/:nfeId/xml')
  getNFeXml(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Param('nfeId') nfeId: string,
    @Req() req: AuthRequest,
  ) {
    return this.sefazService.getNFeXml(teamId, companyId, req.user.id, nfeId);
  }

  // DANFE em PDF
  @Get('nfes/:nfeId/danfe')
  async getDanfe(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Param('nfeId') nfeId: string,
    @Req() req: AuthRequest,
    @Res() res: Response,
  ) {
    const pdf = await this.sefazService.getDanfe(teamId, companyId, req.user.id, nfeId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="danfe-${nfeId}.pdf"`);
    res.send(pdf);
  }
}
