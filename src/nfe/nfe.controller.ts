import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { NfeService } from './nfe.service.js';
import { CreateNfeDto } from './dto/create-nfe.dto.js';
import { UpdateNfeDto } from './dto/update-nfe.dto.js';
import { CreateNfeItemDto } from './dto/create-nfe-item.dto.js';
import { UpdateNfeItemDto } from './dto/update-nfe-item.dto.js';
import { CreateNfePagamentoDto } from './dto/create-nfe-pagamento.dto.js';
import { CancelNfeDto } from './dto/cancel-nfe.dto.js';
import { CceNfeDto } from './dto/cce-nfe.dto.js';
import { InutilizarNfeDto } from './dto/inutilizar-nfe.dto.js';
import { SendNfeEmailDto } from './dto/send-nfe-email.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { NfeStatus } from '../../generated/prisma/enums.js';

interface AuthRequest {
  user: { id: string };
}

@UseGuards(JwtAuthGuard)
@Controller('teams/:teamId/companies/:companyId/nfe')
export class NfeController {
  constructor(private readonly nfeService: NfeService) {}

  /**
   * Listar NF-es de uma empresa (paginado, filtros: status, customerId, dataInicio, dataFim)
   */
  @Get()
  findAllByCompany(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Query('status') status: NfeStatus,
    @Query('customerId') customerId: string,
    @Query('dataInicio') dataInicio: string,
    @Query('dataFim') dataFim: string,
    @Query('page') page: string,
    @Query('pageSize') pageSize: string,
    @Req() req: AuthRequest,
  ) {
    return this.nfeService.findAllByCompany(teamId, companyId, req.user.id, {
      status,
      customerId,
      dataInicio,
      dataFim,
      page: page ? parseInt(page) : undefined,
      pageSize: pageSize ? parseInt(pageSize) : undefined,
    });
  }

  /**
   * Buscar NF-e específica (inclui itens com produto e pagamentos)
   */
  @Get(':nfeId')
  findOne(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Param('nfeId') nfeId: string,
    @Req() req: AuthRequest,
  ) {
    return this.nfeService.findOne(teamId, companyId, nfeId, req.user.id);
  }

  /**
   * Criar rascunho de NF-e
   */
  @Post()
  createDraft(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Body() dto: CreateNfeDto,
    @Req() req: AuthRequest,
  ) {
    return this.nfeService.createDraft(teamId, companyId, req.user.id, dto);
  }

  /**
   * Atualizar cabeçalho do rascunho
   */
  @Patch(':nfeId')
  updateDraft(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Param('nfeId') nfeId: string,
    @Body() dto: UpdateNfeDto,
    @Req() req: AuthRequest,
  ) {
    return this.nfeService.updateDraft(
      teamId,
      companyId,
      nfeId,
      req.user.id,
      dto,
    );
  }

  /**
   * Excluir rascunho (hard delete; só status=RASCUNHO)
   */
  @Delete(':nfeId')
  deleteDraft(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Param('nfeId') nfeId: string,
    @Req() req: AuthRequest,
  ) {
    return this.nfeService.deleteDraft(teamId, companyId, nfeId, req.user.id);
  }

  /**
   * Adicionar item à NF-e (recalcula totais)
   */
  @Post(':nfeId/items')
  addItem(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Param('nfeId') nfeId: string,
    @Body() dto: CreateNfeItemDto,
    @Req() req: AuthRequest,
  ) {
    return this.nfeService.addItem(teamId, companyId, nfeId, req.user.id, dto);
  }

  /**
   * Atualizar item da NF-e (recalcula totais)
   */
  @Patch(':nfeId/items/:itemId')
  updateItem(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Param('nfeId') nfeId: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateNfeItemDto,
    @Req() req: AuthRequest,
  ) {
    return this.nfeService.updateItem(
      teamId,
      companyId,
      nfeId,
      itemId,
      req.user.id,
      dto,
    );
  }

  /**
   * Remover item da NF-e (reordena; recalcula totais)
   */
  @Delete(':nfeId/items/:itemId')
  removeItem(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Param('nfeId') nfeId: string,
    @Param('itemId') itemId: string,
    @Req() req: AuthRequest,
  ) {
    return this.nfeService.removeItem(
      teamId,
      companyId,
      nfeId,
      itemId,
      req.user.id,
    );
  }

  /**
   * Adicionar pagamento à NF-e
   */
  @Post(':nfeId/payments')
  addPayment(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Param('nfeId') nfeId: string,
    @Body() dto: CreateNfePagamentoDto,
    @Req() req: AuthRequest,
  ) {
    return this.nfeService.addPayment(
      teamId,
      companyId,
      nfeId,
      req.user.id,
      dto,
    );
  }

  /**
   * Remover pagamento da NF-e
   */
  @Delete(':nfeId/payments/:paymentId')
  removePayment(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Param('nfeId') nfeId: string,
    @Param('paymentId') paymentId: string,
    @Req() req: AuthRequest,
  ) {
    return this.nfeService.removePayment(
      teamId,
      companyId,
      nfeId,
      paymentId,
      req.user.id,
    );
  }

  /**
   * Forçar recálculo de totais a partir dos itens
   */
  @Post(':nfeId/recalc')
  recalculateTotals(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Param('nfeId') nfeId: string,
    @Req() req: AuthRequest,
  ) {
    return this.nfeService.recalculateTotals(
      teamId,
      companyId,
      nfeId,
      req.user.id,
    );
  }

  /**
   * Gera preview do XML assinado da NF-e (sem transmitir à SEFAZ).
   * Persiste o XML em `Nfe.xmlAssinado` (gzip+base64). Status permanece RASCUNHO.
   */
  @Post(':nfeId/preview')
  preview(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Param('nfeId') nfeId: string,
    @Req() req: AuthRequest,
  ) {
    return this.nfeService.preview(teamId, companyId, req.user.id, nfeId);
  }

  /**
   * Transmite a NF-e à SEFAZ (modo síncrono via NFeAutorizacao4).
   * Incrementa o contador, gera nova chave, assina, envia e persiste o status final.
   */
  @Post(':nfeId/transmit')
  transmit(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Param('nfeId') nfeId: string,
    @Req() req: AuthRequest,
  ) {
    return this.nfeService.transmit(teamId, companyId, req.user.id, nfeId);
  }

  /**
   * Cancela uma NF-e autorizada (evento 110111 via NFeRecepcaoEvento4).
   * SEFAZ valida o prazo de 24h após autorização — rejeita se ultrapassado.
   */
  @Post(':nfeId/cancel')
  cancelar(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Param('nfeId') nfeId: string,
    @Body() dto: CancelNfeDto,
    @Req() req: AuthRequest,
  ) {
    return this.nfeService.cancelar(
      teamId,
      companyId,
      req.user.id,
      nfeId,
      dto.justificativa,
    );
  }

  /**
   * Envia Carta de Correção Eletrônica (CC-e) para uma NF-e autorizada
   * (evento 110110 via NFeRecepcaoEvento4). Limite de 20 sequências por nota.
   */
  @Post(':nfeId/cce')
  cartaCorrecao(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Param('nfeId') nfeId: string,
    @Body() dto: CceNfeDto,
    @Req() req: AuthRequest,
  ) {
    return this.nfeService.cartaCorrecao(
      teamId,
      companyId,
      req.user.id,
      nfeId,
      dto.textoCorrecao,
    );
  }

  /**
   * Inutiliza faixa de numeração de NF-e (via NFeInutilizacao4).
   * Endpoint não associado a uma NF-e específica — segue path próprio.
   */
  @Post('inutilizacoes')
  inutilizar(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Body() dto: InutilizarNfeDto,
    @Req() req: AuthRequest,
  ) {
    return this.nfeService.inutilizar(teamId, companyId, req.user.id, dto);
  }

  /**
   * Download da DANFE em PDF (apenas notas AUTORIZADAS).
   */
  @Get(':nfeId/danfe')
  async getDanfe(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Param('nfeId') nfeId: string,
    @Req() req: AuthRequest,
    @Res() res: Response,
  ) {
    const buffer = await this.nfeService.gerarDanfe(
      teamId,
      companyId,
      req.user.id,
      nfeId,
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="danfe-${nfeId}.pdf"`,
    );
    res.end(buffer);
  }

  /**
   * Download do XML autorizado da NF-e (apenas notas AUTORIZADAS).
   */
  @Get(':nfeId/xml')
  async getXml(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Param('nfeId') nfeId: string,
    @Req() req: AuthRequest,
    @Res() res: Response,
  ) {
    const { xml, chave } = await this.nfeService.downloadXml(
      teamId,
      companyId,
      req.user.id,
      nfeId,
    );
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${chave}-nfe.xml"`,
    );
    res.end(xml);
  }

  /**
   * Envia XML + DANFE por email ao destinatário (apenas notas AUTORIZADAS).
   */
  @Post(':nfeId/send-email')
  sendEmail(
    @Param('teamId') teamId: string,
    @Param('companyId') companyId: string,
    @Param('nfeId') nfeId: string,
    @Body() dto: SendNfeEmailDto,
    @Req() req: AuthRequest,
  ) {
    return this.nfeService.enviarEmail(
      teamId,
      companyId,
      req.user.id,
      nfeId,
      dto,
    );
  }
}
