import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { gunzipSync, gzipSync } from 'zlib';
import { PrismaService } from '../database/index.js';
import { CreateNfeDto } from './dto/create-nfe.dto.js';
import { UpdateNfeDto } from './dto/update-nfe.dto.js';
import { CreateNfeItemDto } from './dto/create-nfe-item.dto.js';
import { UpdateNfeItemDto } from './dto/update-nfe-item.dto.js';
import { CreateNfePagamentoDto } from './dto/create-nfe-pagamento.dto.js';
import { SendNfeEmailDto } from './dto/send-nfe-email.dto.js';
import { NfeStatus } from '../../generated/prisma/enums.js';
import {
  NfeXmlBuilderService,
  NfeWithRelations,
} from './services/nfe-xml-builder.service.js';
import { NfeSignerService } from './services/nfe-signer.service.js';
import { NfeTransmitterService } from './services/nfe-transmitter.service.js';
import { NfeEventBuilderService } from './services/nfe-event-builder.service.js';
import { NfeInutilizacaoBuilderService } from './services/nfe-inutilizacao-builder.service.js';
import { NfeEventTransmitterService } from './services/nfe-event-transmitter.service.js';
import { NfeDanfeService } from './services/nfe-danfe.service.js';
import { MailService } from '../mail/mail.service.js';
import {
  gerarCNF,
  montarChaveAcesso,
  UF_TO_CUF,
} from './helpers/nfe-chave.helper.js';

const FORMAS_PAGAMENTO_VALIDAS = [
  '01', '02', '03', '04', '05',
  '10', '11', '12', '13', '14',
  '15', '16', '17', '18', '19',
  '90', '99',
] as const;

@Injectable()
export class NfeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly xmlBuilder: NfeXmlBuilderService,
    private readonly signer: NfeSignerService,
    private readonly transmitter: NfeTransmitterService,
    private readonly eventBuilder: NfeEventBuilderService,
    private readonly inutBuilder: NfeInutilizacaoBuilderService,
    private readonly eventTransmitter: NfeEventTransmitterService,
    private readonly nfeDanfeService: NfeDanfeService,
    private readonly mailService: MailService,
  ) {}

  // ─── Listar NF-es de uma empresa (paginado) ────────────────────────────────

  async findAllByCompany(
    teamId: string,
    companyId: string,
    userId: string,
    options: {
      status?: NfeStatus;
      customerId?: string;
      dataInicio?: string;
      dataFim?: string;
      page?: number;
      pageSize?: number;
    } = {},
  ) {
    await this.ensureTeamMember(teamId, userId);
    await this.ensureCompanyBelongsToTeam(teamId, companyId);

    const page =
      Number.isFinite(options.page) && (options.page as number) > 0
        ? Math.trunc(options.page as number)
        : 1;
    const pageSize =
      Number.isFinite(options.pageSize) && (options.pageSize as number) > 0
        ? Math.min(100, Math.trunc(options.pageSize as number))
        : 20;

    const dateField =
      options.status && options.status !== NfeStatus.RASCUNHO
        ? 'dataAutorizacao'
        : 'createdAt';

    const where = {
      companyId,
      isActive: true,
      ...(options.status ? { status: options.status } : {}),
      ...(options.customerId ? { customerId: options.customerId } : {}),
      ...(options.dataInicio || options.dataFim
        ? {
            [dateField]: {
              ...(options.dataInicio
                ? { gte: new Date(options.dataInicio) }
                : {}),
              ...(options.dataFim ? { lte: new Date(options.dataFim) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.nfe.findMany({
        where,
        include: {
          customer: {
            select: { id: true, name: true, cpfCnpj: true, tipoPessoa: true },
          },
          _count: { select: { itens: true, pagamentos: true } },
        },
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.nfe.count({ where }),
    ]);

    return {
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }

  // ─── Buscar NF-e específica ───────────────────────────────────────────────

  async findOne(
    teamId: string,
    companyId: string,
    nfeId: string,
    userId: string,
  ) {
    await this.ensureTeamMember(teamId, userId);
    await this.ensureCompanyBelongsToTeam(teamId, companyId);

    const nfe = await this.prisma.nfe.findFirst({
      where: { id: nfeId, companyId, isActive: true },
      include: {
        customer: true,
        itens: {
          include: {
            product: {
              select: {
                id: true,
                codigoInterno: true,
                descricao: true,
                unidade: true,
              },
            },
          },
          orderBy: { ordem: 'asc' },
        },
        pagamentos: true,
      },
    });

    if (!nfe) throw new NotFoundException('NF-e não encontrada');
    return nfe;
  }

  // ─── Criar rascunho ───────────────────────────────────────────────────────

  async createDraft(
    teamId: string,
    companyId: string,
    userId: string,
    dto: CreateNfeDto,
  ) {
    await this.ensureTeamMember(teamId, userId);
    await this.ensureCompanyBelongsToTeam(teamId, companyId);
    await this.ensureCustomerBelongsToCompany(companyId, dto.customerId);

    const nfeConfig = await this.prisma.companyNfeConfig.findUnique({
      where: { companyId },
    });
    const serie = nfeConfig?.serie ?? '1';

    return this.prisma.nfe.create({
      data: {
        companyId,
        customerId: dto.customerId,
        serie,
        status: NfeStatus.RASCUNHO,
        naturezaOperacao: dto.naturezaOperacao,
        tipoOperacao: dto.tipoOperacao,
        modFrete: dto.modFrete ?? 'SEM_TRANSPORTE',
        finalidade: dto.finalidade ?? 'NORMAL',
        indicadorPresenca: dto.indicadorPresenca,
        observacoesFiscais: dto.observacoesFiscais,
        observacoesContrib: dto.observacoesContrib,
      },
    });
  }

  // ─── Atualizar rascunho (cabeçalho) ──────────────────────────────────────

  async updateDraft(
    teamId: string,
    companyId: string,
    nfeId: string,
    userId: string,
    dto: UpdateNfeDto,
  ) {
    await this.ensureTeamMember(teamId, userId);
    await this.ensureCompanyBelongsToTeam(teamId, companyId);

    const nfe = await this.prisma.nfe.findFirst({
      where: { id: nfeId, companyId, isActive: true },
    });
    if (!nfe) throw new NotFoundException('NF-e não encontrada');
    if (nfe.status !== NfeStatus.RASCUNHO) {
      throw new BadRequestException('Só rascunhos podem ser editados');
    }

    if (dto.customerId) {
      await this.ensureCustomerBelongsToCompany(companyId, dto.customerId);
    }

    return this.prisma.nfe.update({
      where: { id: nfeId },
      data: {
        ...(dto.customerId !== undefined && { customerId: dto.customerId }),
        ...(dto.naturezaOperacao !== undefined && {
          naturezaOperacao: dto.naturezaOperacao,
        }),
        ...(dto.tipoOperacao !== undefined && {
          tipoOperacao: dto.tipoOperacao,
        }),
        ...(dto.modFrete !== undefined && { modFrete: dto.modFrete }),
        ...(dto.finalidade !== undefined && { finalidade: dto.finalidade }),
        ...(dto.indicadorPresenca !== undefined && {
          indicadorPresenca: dto.indicadorPresenca,
        }),
        ...(dto.observacoesFiscais !== undefined && {
          observacoesFiscais: dto.observacoesFiscais,
        }),
        ...(dto.observacoesContrib !== undefined && {
          observacoesContrib: dto.observacoesContrib,
        }),
      },
    });
  }

  // ─── Deletar rascunho ────────────────────────────────────────────────────

  async deleteDraft(
    teamId: string,
    companyId: string,
    nfeId: string,
    userId: string,
  ) {
    await this.ensureTeamMember(teamId, userId);
    await this.ensureCompanyBelongsToTeam(teamId, companyId);

    const nfe = await this.prisma.nfe.findFirst({
      where: { id: nfeId, companyId, isActive: true },
    });
    if (!nfe) throw new NotFoundException('NF-e não encontrada');
    if (nfe.status !== NfeStatus.RASCUNHO) {
      throw new BadRequestException('Só rascunhos podem ser excluídos');
    }

    return this.prisma.nfe.delete({ where: { id: nfeId } });
  }

  // ─── Adicionar item ───────────────────────────────────────────────────────

  async addItem(
    teamId: string,
    companyId: string,
    nfeId: string,
    userId: string,
    dto: CreateNfeItemDto,
  ) {
    await this.ensureTeamMember(teamId, userId);
    await this.ensureCompanyBelongsToTeam(teamId, companyId);

    const nfe = await this.prisma.nfe.findFirst({
      where: { id: nfeId, companyId, isActive: true },
    });
    if (!nfe) throw new NotFoundException('NF-e não encontrada');
    if (nfe.status !== NfeStatus.RASCUNHO) {
      throw new BadRequestException('Só rascunhos podem ser editados');
    }

    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, companyId, isActive: true },
    });
    if (!product) throw new NotFoundException('Produto não encontrado');

    const maxOrdem = await this.prisma.nfeItem.aggregate({
      where: { nfeId },
      _max: { ordem: true },
    });
    const ordem = (maxOrdem._max.ordem ?? 0) + 1;

    const cfop = dto.cfop ?? product.cfopPadrao ?? '';
    const unidade = dto.unidade ?? product.unidade;
    const origem = dto.origem ?? product.origem;
    const cstIcms = dto.cstIcms ?? product.cstIcmsPadrao ?? product.csosnPadrao ?? undefined;

    const desconto = dto.desconto ?? 0;
    const valorTotal = dto.quantidade * dto.valorUnitario - desconto;

    const aliquotaIcms = dto.aliquotaIcms ?? product.aliquotaIcms?.toNumber();
    const aliquotaPis = dto.aliquotaPis ?? product.aliquotaPis?.toNumber();
    const aliquotaCofins = dto.aliquotaCofins ?? product.aliquotaCofins?.toNumber();
    const aliquotaIpi = dto.aliquotaIpi ?? product.aliquotaIpi?.toNumber();

    const baseCalcIcms = dto.baseCalcIcms;
    const valorIcms =
      baseCalcIcms != null && aliquotaIcms != null
        ? (baseCalcIcms * aliquotaIcms) / 100
        : undefined;

    const baseCalcIcmsSt = dto.baseCalcIcmsSt;
    const valorIcmsSt =
      baseCalcIcmsSt != null && dto.aliquotaIcmsSt != null
        ? (baseCalcIcmsSt * dto.aliquotaIcmsSt) / 100
        : undefined;

    const baseCalcPis = dto.baseCalcPis;
    const valorPis =
      baseCalcPis != null && aliquotaPis != null
        ? (baseCalcPis * aliquotaPis) / 100
        : undefined;

    const baseCalcCofins = dto.baseCalcCofins;
    const valorCofins =
      baseCalcCofins != null && aliquotaCofins != null
        ? (baseCalcCofins * aliquotaCofins) / 100
        : undefined;

    const baseCalcIpi = dto.baseCalcIpi;
    const valorIpi =
      baseCalcIpi != null && aliquotaIpi != null
        ? (baseCalcIpi * aliquotaIpi) / 100
        : undefined;

    const item = await this.prisma.nfeItem.create({
      data: {
        nfeId,
        productId: dto.productId,
        ordem,
        cfop,
        unidade,
        origem,
        quantidade: String(dto.quantidade),
        valorUnitario: String(dto.valorUnitario),
        desconto: String(desconto),
        valorTotal: String(valorTotal),
        cstIcms,
        baseCalcIcms: baseCalcIcms != null ? String(baseCalcIcms) : undefined,
        aliquotaIcms: aliquotaIcms != null ? String(aliquotaIcms) : undefined,
        valorIcms: valorIcms != null ? String(valorIcms) : undefined,
        baseCalcIcmsSt:
          baseCalcIcmsSt != null ? String(baseCalcIcmsSt) : undefined,
        aliquotaIcmsSt:
          dto.aliquotaIcmsSt != null ? String(dto.aliquotaIcmsSt) : undefined,
        valorIcmsSt: valorIcmsSt != null ? String(valorIcmsSt) : undefined,
        cstPis: dto.cstPis,
        baseCalcPis: baseCalcPis != null ? String(baseCalcPis) : undefined,
        aliquotaPis: aliquotaPis != null ? String(aliquotaPis) : undefined,
        valorPis: valorPis != null ? String(valorPis) : undefined,
        cstCofins: dto.cstCofins,
        baseCalcCofins:
          baseCalcCofins != null ? String(baseCalcCofins) : undefined,
        aliquotaCofins:
          aliquotaCofins != null ? String(aliquotaCofins) : undefined,
        valorCofins: valorCofins != null ? String(valorCofins) : undefined,
        cstIpi: dto.cstIpi,
        baseCalcIpi: baseCalcIpi != null ? String(baseCalcIpi) : undefined,
        aliquotaIpi: aliquotaIpi != null ? String(aliquotaIpi) : undefined,
        valorIpi: valorIpi != null ? String(valorIpi) : undefined,
      },
    });

    await this.recalcTotals(nfeId);
    return item;
  }

  // ─── Atualizar item ───────────────────────────────────────────────────────

  async updateItem(
    teamId: string,
    companyId: string,
    nfeId: string,
    itemId: string,
    userId: string,
    dto: UpdateNfeItemDto,
  ) {
    await this.ensureTeamMember(teamId, userId);
    await this.ensureCompanyBelongsToTeam(teamId, companyId);

    const nfe = await this.prisma.nfe.findFirst({
      where: { id: nfeId, companyId, isActive: true },
    });
    if (!nfe) throw new NotFoundException('NF-e não encontrada');
    if (nfe.status !== NfeStatus.RASCUNHO) {
      throw new BadRequestException('Só rascunhos podem ser editados');
    }

    const item = await this.prisma.nfeItem.findFirst({
      where: { id: itemId, nfeId },
    });
    if (!item) throw new NotFoundException('Item não encontrado');

    const quantidade =
      dto.quantidade != null ? dto.quantidade : item.quantidade.toNumber();
    const valorUnitario =
      dto.valorUnitario != null
        ? dto.valorUnitario
        : item.valorUnitario.toNumber();
    const desconto =
      dto.desconto != null ? dto.desconto : item.desconto.toNumber();
    const valorTotal = quantidade * valorUnitario - desconto;

    const baseCalcIcms =
      dto.baseCalcIcms !== undefined
        ? dto.baseCalcIcms
        : item.baseCalcIcms?.toNumber();
    const aliquotaIcms =
      dto.aliquotaIcms !== undefined
        ? dto.aliquotaIcms
        : item.aliquotaIcms?.toNumber();
    const valorIcms =
      baseCalcIcms != null && aliquotaIcms != null
        ? (baseCalcIcms * aliquotaIcms) / 100
        : null;

    const baseCalcIcmsSt =
      dto.baseCalcIcmsSt !== undefined
        ? dto.baseCalcIcmsSt
        : item.baseCalcIcmsSt?.toNumber();
    const aliquotaIcmsSt =
      dto.aliquotaIcmsSt !== undefined
        ? dto.aliquotaIcmsSt
        : item.aliquotaIcmsSt?.toNumber();
    const valorIcmsSt =
      baseCalcIcmsSt != null && aliquotaIcmsSt != null
        ? (baseCalcIcmsSt * aliquotaIcmsSt) / 100
        : null;

    const baseCalcPis =
      dto.baseCalcPis !== undefined
        ? dto.baseCalcPis
        : item.baseCalcPis?.toNumber();
    const aliquotaPis =
      dto.aliquotaPis !== undefined
        ? dto.aliquotaPis
        : item.aliquotaPis?.toNumber();
    const valorPis =
      baseCalcPis != null && aliquotaPis != null
        ? (baseCalcPis * aliquotaPis) / 100
        : null;

    const baseCalcCofins =
      dto.baseCalcCofins !== undefined
        ? dto.baseCalcCofins
        : item.baseCalcCofins?.toNumber();
    const aliquotaCofins =
      dto.aliquotaCofins !== undefined
        ? dto.aliquotaCofins
        : item.aliquotaCofins?.toNumber();
    const valorCofins =
      baseCalcCofins != null && aliquotaCofins != null
        ? (baseCalcCofins * aliquotaCofins) / 100
        : null;

    const baseCalcIpi =
      dto.baseCalcIpi !== undefined
        ? dto.baseCalcIpi
        : item.baseCalcIpi?.toNumber();
    const aliquotaIpi =
      dto.aliquotaIpi !== undefined
        ? dto.aliquotaIpi
        : item.aliquotaIpi?.toNumber();
    const valorIpi =
      baseCalcIpi != null && aliquotaIpi != null
        ? (baseCalcIpi * aliquotaIpi) / 100
        : null;

    const updated = await this.prisma.nfeItem.update({
      where: { id: itemId },
      data: {
        quantidade: String(quantidade),
        valorUnitario: String(valorUnitario),
        desconto: String(desconto),
        valorTotal: String(valorTotal),
        ...(dto.cfop !== undefined && { cfop: dto.cfop }),
        ...(dto.unidade !== undefined && { unidade: dto.unidade }),
        ...(dto.origem !== undefined && { origem: dto.origem }),
        ...(dto.cstIcms !== undefined && { cstIcms: dto.cstIcms }),
        baseCalcIcms: baseCalcIcms != null ? String(baseCalcIcms) : null,
        aliquotaIcms: aliquotaIcms != null ? String(aliquotaIcms) : null,
        valorIcms: valorIcms != null ? String(valorIcms) : null,
        baseCalcIcmsSt:
          baseCalcIcmsSt != null ? String(baseCalcIcmsSt) : null,
        aliquotaIcmsSt:
          aliquotaIcmsSt != null ? String(aliquotaIcmsSt) : null,
        valorIcmsSt: valorIcmsSt != null ? String(valorIcmsSt) : null,
        ...(dto.cstPis !== undefined && { cstPis: dto.cstPis }),
        baseCalcPis: baseCalcPis != null ? String(baseCalcPis) : null,
        aliquotaPis: aliquotaPis != null ? String(aliquotaPis) : null,
        valorPis: valorPis != null ? String(valorPis) : null,
        ...(dto.cstCofins !== undefined && { cstCofins: dto.cstCofins }),
        baseCalcCofins:
          baseCalcCofins != null ? String(baseCalcCofins) : null,
        aliquotaCofins:
          aliquotaCofins != null ? String(aliquotaCofins) : null,
        valorCofins: valorCofins != null ? String(valorCofins) : null,
        ...(dto.cstIpi !== undefined && { cstIpi: dto.cstIpi }),
        baseCalcIpi: baseCalcIpi != null ? String(baseCalcIpi) : null,
        aliquotaIpi: aliquotaIpi != null ? String(aliquotaIpi) : null,
        valorIpi: valorIpi != null ? String(valorIpi) : null,
      },
    });

    await this.recalcTotals(nfeId);
    return updated;
  }

  // ─── Remover item ─────────────────────────────────────────────────────────

  async removeItem(
    teamId: string,
    companyId: string,
    nfeId: string,
    itemId: string,
    userId: string,
  ) {
    await this.ensureTeamMember(teamId, userId);
    await this.ensureCompanyBelongsToTeam(teamId, companyId);

    const nfe = await this.prisma.nfe.findFirst({
      where: { id: nfeId, companyId, isActive: true },
    });
    if (!nfe) throw new NotFoundException('NF-e não encontrada');
    if (nfe.status !== NfeStatus.RASCUNHO) {
      throw new BadRequestException('Só rascunhos podem ser editados');
    }

    const item = await this.prisma.nfeItem.findFirst({
      where: { id: itemId, nfeId },
    });
    if (!item) throw new NotFoundException('Item não encontrado');

    await this.prisma.nfeItem.delete({ where: { id: itemId } });

    // Reordenar itens com ordem > removida
    await this.prisma.nfeItem.updateMany({
      where: { nfeId, ordem: { gt: item.ordem } },
      data: { ordem: { decrement: 1 } },
    });

    await this.recalcTotals(nfeId);
    return { message: 'Item removido com sucesso' };
  }

  // ─── Adicionar pagamento ──────────────────────────────────────────────────

  async addPayment(
    teamId: string,
    companyId: string,
    nfeId: string,
    userId: string,
    dto: CreateNfePagamentoDto,
  ) {
    await this.ensureTeamMember(teamId, userId);
    await this.ensureCompanyBelongsToTeam(teamId, companyId);

    const nfe = await this.prisma.nfe.findFirst({
      where: { id: nfeId, companyId, isActive: true },
    });
    if (!nfe) throw new NotFoundException('NF-e não encontrada');
    if (nfe.status !== NfeStatus.RASCUNHO) {
      throw new BadRequestException('Só rascunhos podem ser editados');
    }

    if (
      !(FORMAS_PAGAMENTO_VALIDAS as readonly string[]).includes(
        dto.formaPagamento,
      )
    ) {
      throw new BadRequestException(
        `Forma de pagamento inválida: ${dto.formaPagamento}`,
      );
    }

    if (dto.valor <= 0) {
      throw new BadRequestException('Valor do pagamento deve ser maior que zero');
    }

    return this.prisma.nfePagamento.create({
      data: {
        nfeId,
        formaPagamento: dto.formaPagamento,
        valor: String(dto.valor),
      },
    });
  }

  // ─── Remover pagamento ────────────────────────────────────────────────────

  async removePayment(
    teamId: string,
    companyId: string,
    nfeId: string,
    paymentId: string,
    userId: string,
  ) {
    await this.ensureTeamMember(teamId, userId);
    await this.ensureCompanyBelongsToTeam(teamId, companyId);

    const nfe = await this.prisma.nfe.findFirst({
      where: { id: nfeId, companyId, isActive: true },
    });
    if (!nfe) throw new NotFoundException('NF-e não encontrada');
    if (nfe.status !== NfeStatus.RASCUNHO) {
      throw new BadRequestException('Só rascunhos podem ser editados');
    }

    const pagamento = await this.prisma.nfePagamento.findFirst({
      where: { id: paymentId, nfeId },
    });
    if (!pagamento) throw new NotFoundException('Pagamento não encontrado');

    await this.prisma.nfePagamento.delete({ where: { id: paymentId } });
    return { message: 'Pagamento removido com sucesso' };
  }

  // ─── Recalcular totais (endpoint público) ─────────────────────────────────

  async recalculateTotals(
    teamId: string,
    companyId: string,
    nfeId: string,
    userId: string,
  ) {
    await this.ensureTeamMember(teamId, userId);
    await this.ensureCompanyBelongsToTeam(teamId, companyId);

    const nfe = await this.prisma.nfe.findFirst({
      where: { id: nfeId, companyId, isActive: true },
    });
    if (!nfe) throw new NotFoundException('NF-e não encontrada');

    return this.recalcTotals(nfeId);
  }

  // ─── Helper: recalcular totais a partir dos itens ─────────────────────────

  private async recalcTotals(nfeId: string) {
    const agg = await this.prisma.nfeItem.aggregate({
      where: { nfeId },
      _sum: {
        valorTotal: true,
        desconto: true,
        valorIcms: true,
        valorIcmsSt: true,
        valorIpi: true,
        valorPis: true,
        valorCofins: true,
      },
    });

    const current = await this.prisma.nfe.findUnique({
      where: { id: nfeId },
      select: {
        totalFrete: true,
        totalSeguro: true,
        totalOutros: true,
      },
    });

    const totalProdutos = agg._sum.valorTotal?.toNumber() ?? 0;
    const totalDesconto = agg._sum.desconto?.toNumber() ?? 0;
    const totalIcms = agg._sum.valorIcms?.toNumber() ?? 0;
    const totalIcmsSt = agg._sum.valorIcmsSt?.toNumber() ?? 0;
    const totalIpi = agg._sum.valorIpi?.toNumber() ?? 0;
    const totalPis = agg._sum.valorPis?.toNumber() ?? 0;
    const totalCofins = agg._sum.valorCofins?.toNumber() ?? 0;

    const totalFrete = current?.totalFrete?.toNumber() ?? 0;
    const totalSeguro = current?.totalSeguro?.toNumber() ?? 0;
    const totalOutros = current?.totalOutros?.toNumber() ?? 0;

    // Fórmula NF-e: vNF = vProd - vDesc + vFrete + vSeg + vOutro + vICMSST + vIPI
    const totalNota =
      totalProdutos - totalDesconto + totalFrete + totalSeguro + totalOutros + totalIcmsSt + totalIpi;

    return this.prisma.nfe.update({
      where: { id: nfeId },
      data: {
        totalProdutos: String(totalProdutos),
        totalDesconto: String(totalDesconto),
        totalIcms: String(totalIcms),
        totalIcmsSt: String(totalIcmsSt),
        totalIpi: String(totalIpi),
        totalPis: String(totalPis),
        totalCofins: String(totalCofins),
        totalNota: String(totalNota),
      },
    });
  }

  // ─── Preview do XML assinado (Fase 4b: gera + assina, NÃO transmite) ──────

  async preview(
    teamId: string,
    companyId: string,
    userId: string,
    nfeId: string,
  ) {
    await this.ensureTeamMember(teamId, userId);
    await this.ensureCompanyBelongsToTeam(teamId, companyId);

    const nfe = await this.prisma.nfe.findFirst({
      where: { id: nfeId, companyId, isActive: true },
      include: {
        customer: true,
        itens: {
          include: { product: true },
          orderBy: { ordem: 'asc' },
        },
        pagamentos: true,
      },
    });
    if (!nfe) throw new NotFoundException('NF-e não encontrada');

    if (nfe.status !== NfeStatus.RASCUNHO) {
      throw new BadRequestException(
        'Preview só pode ser gerado em NF-e com status RASCUNHO',
      );
    }
    if (nfe.itens.length === 0) {
      throw new BadRequestException('NF-e sem itens');
    }

    const company = await this.prisma.company.findFirst({
      where: { id: companyId, isActive: true },
      include: {
        fiscalProfile: true,
        fiscalAddress: true,
        nfeConfig: true,
      },
    });
    if (!company) throw new NotFoundException('Empresa não encontrada');

    if (!company.cnpj) {
      throw new BadRequestException(
        'Empresa sem CNPJ — emissão de NF-e exige CNPJ',
      );
    }
    if (!company.fiscalProfile) {
      throw new BadRequestException(
        'Empresa sem perfil fiscal cadastrado (CompanyFiscalProfile)',
      );
    }
    if (!company.fiscalAddress) {
      throw new BadRequestException(
        'Empresa sem endereço fiscal cadastrado (CompanyAddress)',
      );
    }
    if (!company.nfeConfig) {
      throw new BadRequestException(
        'Empresa sem configuração de NF-e (CompanyNfeConfig)',
      );
    }
    if (!company.fiscalAddress.uf) {
      throw new BadRequestException('Empresa sem UF no endereço fiscal');
    }

    const cUF = UF_TO_CUF[company.fiscalAddress.uf];
    if (!cUF) {
      throw new BadRequestException(
        `UF do emitente inválida: ${company.fiscalAddress.uf}`,
      );
    }

    // Valida existência do certificado A1 ativo (sem expor exceções genéricas)
    const cert = await this.prisma.companyCertificate.findUnique({
      where: { companyId, isActive: true },
    });
    if (!cert) {
      throw new BadRequestException(
        'Certificado digital A1 ativo não encontrado para a empresa',
      );
    }
    if (cert.expiresAt && cert.expiresAt < new Date()) {
      throw new BadRequestException(
        'Certificado digital A1 expirado — renove antes de emitir',
      );
    }

    // Atribui número provisório (apenas no XML — NÃO incrementa ultimaNfe nesta fase)
    const numero = nfe.numero ?? company.nfeConfig.ultimaNfe + 1;

    // Gera cNF garantindo que != nNF (regra do schema NF-e)
    let cNF = gerarCNF();
    while (cNF === String(numero).padStart(8, '0')) {
      cNF = gerarCNF();
    }

    const dhEmi = new Date();

    const chave = montarChaveAcesso({
      cUF,
      dhEmi,
      cnpj: company.cnpj,
      mod: '55',
      serie: nfe.serie,
      nNF: numero,
      tpEmis: '1',
      cNF,
    });

    // Hidrata `nfe` com o numero atribuído (o builder valida que numero != null).
    // Tipagem explícita preserva o GetPayload depois do spread.
    const nfeForBuilder: NfeWithRelations = { ...nfe, numero };

    const xmlNFe = this.xmlBuilder.build(
      nfeForBuilder,
      company,
      chave,
      cNF,
      dhEmi,
    );

    const xmlAssinado = await this.signer.sign({
      xml: xmlNFe,
      uri: `#NFe${chave}`,
      xpath: "//*[local-name()='infNFe']",
      companyId,
    });

    // Persiste no banco: numero (se ainda não tinha), chave, xmlAssinado (gzip+base64)
    const xmlAssinadoGzipB64 = gzipSync(
      Buffer.from(xmlAssinado, 'utf8'),
    ).toString('base64');

    await this.prisma.nfe.update({
      where: { id: nfeId },
      data: {
        ...(nfe.numero == null ? { numero } : {}),
        chave,
        xmlAssinado: xmlAssinadoGzipB64,
        // status permanece RASCUNHO — transmissão é Fase 4c
      },
    });

    return { xml: xmlAssinado, chave };
  }

  // ─── Transmissão à SEFAZ (Fase 4c) ────────────────────────────────────────

  async transmit(
    teamId: string,
    companyId: string,
    userId: string,
    nfeId: string,
  ) {
    await this.ensureTeamMember(teamId, userId);
    await this.ensureCompanyBelongsToTeam(teamId, companyId);

    const nfe = await this.prisma.nfe.findFirst({
      where: { id: nfeId, companyId, isActive: true },
      include: {
        customer: true,
        itens: {
          include: { product: true },
          orderBy: { ordem: 'asc' },
        },
        pagamentos: true,
      },
    });
    if (!nfe) throw new NotFoundException('NF-e não encontrada');

    if (nfe.status !== NfeStatus.RASCUNHO) {
      throw new BadRequestException(
        'Apenas notas em rascunho podem ser transmitidas',
      );
    }
    if (nfe.itens.length === 0) {
      throw new BadRequestException('NF-e sem itens');
    }

    const company = await this.prisma.company.findFirst({
      where: { id: companyId, isActive: true },
      include: {
        fiscalProfile: true,
        fiscalAddress: true,
        nfeConfig: true,
      },
    });
    if (!company) throw new NotFoundException('Empresa não encontrada');

    if (!company.cnpj) {
      throw new BadRequestException(
        'Empresa sem CNPJ — emissão de NF-e exige CNPJ',
      );
    }
    if (!company.fiscalProfile) {
      throw new BadRequestException(
        'Empresa sem perfil fiscal cadastrado (CompanyFiscalProfile)',
      );
    }
    if (!company.fiscalAddress) {
      throw new BadRequestException(
        'Empresa sem endereço fiscal cadastrado (CompanyAddress)',
      );
    }
    if (!company.nfeConfig) {
      throw new BadRequestException(
        'Empresa sem configuração de NF-e (CompanyNfeConfig)',
      );
    }
    if (!company.fiscalAddress.uf) {
      throw new BadRequestException('Empresa sem UF no endereço fiscal');
    }

    const cUF = UF_TO_CUF[company.fiscalAddress.uf];
    if (!cUF) {
      throw new BadRequestException(
        `UF do emitente inválida: ${company.fiscalAddress.uf}`,
      );
    }

    const cert = await this.prisma.companyCertificate.findUnique({
      where: { companyId, isActive: true },
    });
    if (!cert) {
      throw new BadRequestException(
        'Certificado digital A1 ativo não encontrado para a empresa',
      );
    }
    if (cert.expiresAt && cert.expiresAt < new Date()) {
      throw new BadRequestException(
        'Certificado digital A1 expirado — renove antes de emitir',
      );
    }

    // 1) Incremento atômico do número (queima número se falhar no envio)
    const updatedConfig = await this.prisma.companyNfeConfig.update({
      where: { companyId },
      data: { ultimaNfe: { increment: 1 } },
    });
    const numero = updatedConfig.ultimaNfe;

    // 2) Gera cNF (garante que != nNF) e dhEmi
    let cNF = gerarCNF();
    while (cNF === String(numero).padStart(8, '0')) {
      cNF = gerarCNF();
    }
    const dhEmi = new Date();

    // 3) Monta chave de acesso fresh
    const chave = montarChaveAcesso({
      cUF,
      dhEmi,
      cnpj: company.cnpj,
      mod: '55',
      serie: nfe.serie,
      nNF: numero,
      tpEmis: '1',
      cNF,
    });

    // 4) Marca status como PROCESSANDO + persiste número/chave
    await this.prisma.nfe.update({
      where: { id: nfeId },
      data: {
        numero,
        chave,
        status: NfeStatus.PROCESSANDO,
      },
    });

    // 5) Build + Sign — se falhar AQUI, devolve número (decrement) e
    // restaura o rascunho. Não chegou a queimar nada na SEFAZ.
    const nfeForBuilder: NfeWithRelations = { ...nfe, numero };

    let xmlAssinado: string;
    try {
      const xmlNFe = this.xmlBuilder.build(
        nfeForBuilder,
        company,
        chave,
        cNF,
        dhEmi,
      );
      xmlAssinado = await this.signer.sign({
        xml: xmlNFe,
        uri: `#NFe${chave}`,
        xpath: "//*[local-name()='infNFe']",
        companyId,
      });
    } catch (err: unknown) {
      // Devolve o número usado — a nota nem saiu da nossa API
      await this.prisma.companyNfeConfig.update({
        where: { companyId },
        data: { ultimaNfe: { decrement: 1 } },
      });
      await this.prisma.nfe.update({
        where: { id: nfeId },
        data: {
          numero: null,
          chave: null,
          status: NfeStatus.RASCUNHO,
        },
      });
      throw err;
    }

    // 6) Persiste xmlAssinado (gzip+base64) antes de enviar
    const xmlAssinadoGzipB64 = gzipSync(
      Buffer.from(xmlAssinado, 'utf8'),
    ).toString('base64');
    await this.prisma.nfe.update({
      where: { id: nfeId },
      data: { xmlAssinado: xmlAssinadoGzipB64 },
    });

    // 7) Transmite (em erro de rede o status fica PROCESSANDO e o erro propaga)
    const resultado = await this.transmitter.transmit({
      xmlNFeAssinado: xmlAssinado,
      chave,
      cnpjEmitente: company.cnpj,
      companyId,
      uf: company.fiscalAddress.uf,
      ambiente: company.nfeConfig.ambiente,
    });

    // 8) Decisão baseada no cStat retornado
    if (resultado.cStat === '100' && resultado.protocolo && resultado.xmlProtNFe) {
      const nfeAssinadaSemDecl = xmlAssinado.replace(
        /^\s*<\?xml[^?]*\?>\s*/i,
        '',
      );
      const nfeProc =
        `<?xml version="1.0" encoding="UTF-8"?>` +
        `<nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">` +
        `${nfeAssinadaSemDecl}` +
        `${resultado.xmlProtNFe}` +
        `</nfeProc>`;
      const xmlAutorizadoGzipB64 = gzipSync(
        Buffer.from(nfeProc, 'utf8'),
      ).toString('base64');

      await this.prisma.nfe.update({
        where: { id: nfeId },
        data: {
          status: NfeStatus.AUTORIZADA,
          cStat: resultado.cStat,
          xMotivo: resultado.xMotivo,
          protocoloAutorizacao: resultado.protocolo,
          dataAutorizacao: resultado.dhRecbto ?? new Date(),
          xmlAutorizado: xmlAutorizadoGzipB64,
        },
      });

      return {
        status: NfeStatus.AUTORIZADA,
        cStat: resultado.cStat,
        xMotivo: resultado.xMotivo,
        protocolo: resultado.protocolo,
      };
    }

    if (resultado.cStat === '110') {
      // Denegada — número queimado (inutilização irrelevante na denegada)
      await this.prisma.nfe.update({
        where: { id: nfeId },
        data: {
          status: NfeStatus.DENEGADA,
          cStat: resultado.cStat,
          xMotivo: resultado.xMotivo,
        },
      });

      return {
        status: NfeStatus.DENEGADA,
        cStat: resultado.cStat,
        xMotivo: resultado.xMotivo,
      };
    }

    // Rejeitada (recuperável — após correção pode retransmitir, mas com novo número)
    await this.prisma.nfe.update({
      where: { id: nfeId },
      data: {
        status: NfeStatus.REJEITADA,
        cStat: resultado.cStat,
        xMotivo: resultado.xMotivo,
      },
    });

    return {
      status: NfeStatus.REJEITADA,
      cStat: resultado.cStat,
      xMotivo: resultado.xMotivo,
    };
  }

  // ─── Cancelamento (evento 110111) ─────────────────────────────────────────

  async cancelar(
    teamId: string,
    companyId: string,
    userId: string,
    nfeId: string,
    justificativa: string,
  ) {
    await this.ensureTeamMember(teamId, userId);
    await this.ensureCompanyBelongsToTeam(teamId, companyId);

    if (
      !justificativa ||
      justificativa.length < 15 ||
      justificativa.length > 255
    ) {
      throw new BadRequestException(
        'Justificativa deve ter entre 15 e 255 caracteres',
      );
    }

    const nfe = await this.prisma.nfe.findFirst({
      where: { id: nfeId, companyId, isActive: true },
    });
    if (!nfe) throw new NotFoundException('NF-e não encontrada');

    if (nfe.status !== NfeStatus.AUTORIZADA) {
      throw new BadRequestException(
        'Apenas notas autorizadas podem ser canceladas',
      );
    }
    if (!nfe.chave) {
      throw new BadRequestException('NF-e sem chave de acesso');
    }
    if (!nfe.protocoloAutorizacao) {
      throw new BadRequestException(
        'NF-e sem protocolo de autorização — não é possível cancelar',
      );
    }

    const eventosCancelamento = await this.prisma.nfeEvento.count({
      where: { nfeId, tpEvento: '110111' },
    });
    const sequencia = eventosCancelamento + 1;
    if (sequencia > 1) {
      throw new BadRequestException('Nota já cancelada ou em processo');
    }

    const company = await this.prisma.company.findFirst({
      where: { id: companyId, isActive: true },
      include: {
        fiscalProfile: true,
        fiscalAddress: true,
        nfeConfig: true,
      },
    });
    if (!company) throw new NotFoundException('Empresa não encontrada');
    if (!company.cnpj) {
      throw new BadRequestException('Empresa sem CNPJ');
    }
    if (!company.fiscalAddress?.uf) {
      throw new BadRequestException('Empresa sem UF no endereço fiscal');
    }
    if (!company.nfeConfig) {
      throw new BadRequestException('Empresa sem configuração de NF-e');
    }
    const cUF = UF_TO_CUF[company.fiscalAddress.uf];
    if (!cUF) {
      throw new BadRequestException(
        `UF do emitente inválida: ${company.fiscalAddress.uf}`,
      );
    }

    const evento = await this.prisma.nfeEvento.create({
      data: {
        nfeId,
        tpEvento: '110111',
        sequencia,
        justificativa,
        status: 'PENDING',
      },
    });

    const dhEvento = new Date();
    const built = this.eventBuilder.build({
      tipo: 'CANCELAMENTO',
      chave: nfe.chave,
      cnpj: company.cnpj,
      cUF,
      ambiente: company.nfeConfig.ambiente,
      sequencia,
      dhEvento,
      justificativa,
      nProtNFe: nfe.protocoloAutorizacao,
    });

    const xmlAssinado = await this.signer.sign({
      xml: built.xml,
      uri: `#${built.idEvento}`,
      xpath: "//*[local-name()='infEvento']",
      companyId,
    });

    const resultado = await this.eventTransmitter.transmitEvento({
      xmlEnvEventoAssinado: xmlAssinado,
      uf: company.fiscalAddress.uf,
      ambiente: company.nfeConfig.ambiente,
      companyId,
    });

    const sucesso = resultado.cStat === '135' || resultado.cStat === '136';

    await this.prisma.nfeEvento.update({
      where: { id: evento.id },
      data: {
        status: sucesso ? 'AUTORIZADO' : 'REJEITADO',
        cStat: resultado.cStat,
        xMotivo: resultado.xMotivo,
        protocolo: resultado.protocolo ?? null,
        xmlEnvio: xmlAssinado,
        xmlResposta: resultado.xmlResposta,
      },
    });

    if (sucesso) {
      await this.prisma.nfe.update({
        where: { id: nfeId },
        data: {
          status: NfeStatus.CANCELADA,
          justifCancelamento: justificativa,
          dataCancelamento: resultado.dhRegEvento ?? new Date(),
        },
      });
    }

    return {
      status: sucesso ? 'AUTORIZADO' : 'REJEITADO',
      cStat: resultado.cStat,
      xMotivo: resultado.xMotivo,
      protocolo: resultado.protocolo,
    };
  }

  // ─── Carta de Correção (evento 110110) ────────────────────────────────────

  async cartaCorrecao(
    teamId: string,
    companyId: string,
    userId: string,
    nfeId: string,
    textoCorrecao: string,
  ) {
    await this.ensureTeamMember(teamId, userId);
    await this.ensureCompanyBelongsToTeam(teamId, companyId);

    if (
      !textoCorrecao ||
      textoCorrecao.length < 15 ||
      textoCorrecao.length > 1000
    ) {
      throw new BadRequestException(
        'Texto de correção deve ter entre 15 e 1000 caracteres',
      );
    }

    const nfe = await this.prisma.nfe.findFirst({
      where: { id: nfeId, companyId, isActive: true },
    });
    if (!nfe) throw new NotFoundException('NF-e não encontrada');

    if (nfe.status !== NfeStatus.AUTORIZADA) {
      throw new BadRequestException(
        'Apenas notas autorizadas podem receber CC-e',
      );
    }
    if (!nfe.chave) {
      throw new BadRequestException('NF-e sem chave de acesso');
    }

    const cceCount = await this.prisma.nfeEvento.count({
      where: { nfeId, tpEvento: '110110' },
    });
    const sequencia = cceCount + 1;
    if (sequencia > 20) {
      throw new BadRequestException('Limite de 20 CC-e por nota atingido');
    }

    const company = await this.prisma.company.findFirst({
      where: { id: companyId, isActive: true },
      include: {
        fiscalProfile: true,
        fiscalAddress: true,
        nfeConfig: true,
      },
    });
    if (!company) throw new NotFoundException('Empresa não encontrada');
    if (!company.cnpj) {
      throw new BadRequestException('Empresa sem CNPJ');
    }
    if (!company.fiscalAddress?.uf) {
      throw new BadRequestException('Empresa sem UF no endereço fiscal');
    }
    if (!company.nfeConfig) {
      throw new BadRequestException('Empresa sem configuração de NF-e');
    }
    const cUF = UF_TO_CUF[company.fiscalAddress.uf];
    if (!cUF) {
      throw new BadRequestException(
        `UF do emitente inválida: ${company.fiscalAddress.uf}`,
      );
    }

    const evento = await this.prisma.nfeEvento.create({
      data: {
        nfeId,
        tpEvento: '110110',
        sequencia,
        status: 'PENDING',
      },
    });

    const dhEvento = new Date();
    const built = this.eventBuilder.build({
      tipo: 'CARTA_CORRECAO',
      chave: nfe.chave,
      cnpj: company.cnpj,
      cUF,
      ambiente: company.nfeConfig.ambiente,
      sequencia,
      dhEvento,
      textoCorrecao,
    });

    const xmlAssinado = await this.signer.sign({
      xml: built.xml,
      uri: `#${built.idEvento}`,
      xpath: "//*[local-name()='infEvento']",
      companyId,
    });

    const resultado = await this.eventTransmitter.transmitEvento({
      xmlEnvEventoAssinado: xmlAssinado,
      uf: company.fiscalAddress.uf,
      ambiente: company.nfeConfig.ambiente,
      companyId,
    });

    const sucesso = resultado.cStat === '135' || resultado.cStat === '136';

    await this.prisma.nfeEvento.update({
      where: { id: evento.id },
      data: {
        status: sucesso ? 'AUTORIZADO' : 'REJEITADO',
        cStat: resultado.cStat,
        xMotivo: resultado.xMotivo,
        protocolo: resultado.protocolo ?? null,
        xmlEnvio: xmlAssinado,
        xmlResposta: resultado.xmlResposta,
      },
    });

    // CC-e não altera o status da Nfe — permanece AUTORIZADA
    return {
      status: sucesso ? 'AUTORIZADO' : 'REJEITADO',
      cStat: resultado.cStat,
      xMotivo: resultado.xMotivo,
      protocolo: resultado.protocolo,
      sequencia,
    };
  }

  // ─── Inutilização de numeração ────────────────────────────────────────────

  async inutilizar(
    teamId: string,
    companyId: string,
    userId: string,
    dto: {
      serie: string;
      numeroInicial: number;
      numeroFinal: number;
      justificativa: string;
    },
  ) {
    await this.ensureTeamMember(teamId, userId);
    await this.ensureCompanyBelongsToTeam(teamId, companyId);

    const { serie, numeroInicial, numeroFinal, justificativa } = dto;

    if (!/^\d{1,3}$/.test(serie)) {
      throw new BadRequestException('Série inválida (1 a 3 dígitos numéricos)');
    }
    if (!Number.isInteger(numeroInicial) || numeroInicial < 1) {
      throw new BadRequestException(
        'Número inicial deve ser inteiro >= 1',
      );
    }
    if (!Number.isInteger(numeroFinal) || numeroFinal < numeroInicial) {
      throw new BadRequestException(
        'Número final deve ser inteiro >= numeroInicial',
      );
    }
    if (numeroFinal - numeroInicial + 1 > 999) {
      throw new BadRequestException(
        'Range de inutilização não pode exceder 999 números (limite SEFAZ)',
      );
    }
    if (
      !justificativa ||
      justificativa.length < 15 ||
      justificativa.length > 255
    ) {
      throw new BadRequestException(
        'Justificativa deve ter entre 15 e 255 caracteres',
      );
    }

    const ano = new Date().getFullYear();

    // Idempotência: se já existe registro para mesma faixa+ano, devolve o existente
    const existente = await this.prisma.nfeInutilizacao.findUnique({
      where: {
        companyId_serie_numeroInicial_numeroFinal_ano: {
          companyId,
          serie,
          numeroInicial,
          numeroFinal,
          ano,
        },
      },
    });
    if (existente) {
      return {
        status: existente.status,
        cStat: existente.cStat ?? null,
        xMotivo: existente.xMotivo ?? null,
        protocolo: existente.protocolo ?? null,
        id: existente.id,
      };
    }

    const company = await this.prisma.company.findFirst({
      where: { id: companyId, isActive: true },
      include: {
        fiscalProfile: true,
        fiscalAddress: true,
        nfeConfig: true,
      },
    });
    if (!company) throw new NotFoundException('Empresa não encontrada');
    if (!company.cnpj) {
      throw new BadRequestException('Empresa sem CNPJ');
    }
    if (!company.fiscalAddress?.uf) {
      throw new BadRequestException('Empresa sem UF no endereço fiscal');
    }
    if (!company.nfeConfig) {
      throw new BadRequestException('Empresa sem configuração de NF-e');
    }
    const cUF = UF_TO_CUF[company.fiscalAddress.uf];
    if (!cUF) {
      throw new BadRequestException(
        `UF do emitente inválida: ${company.fiscalAddress.uf}`,
      );
    }

    const registro = await this.prisma.nfeInutilizacao.create({
      data: {
        companyId,
        serie,
        numeroInicial,
        numeroFinal,
        ano,
        justificativa,
        status: 'PENDING',
      },
    });

    const built = this.inutBuilder.build({
      cUF,
      ano,
      cnpj: company.cnpj,
      serie,
      numeroInicial,
      numeroFinal,
      justificativa,
      ambiente: company.nfeConfig.ambiente,
    });

    const xmlAssinado = await this.signer.sign({
      xml: built.xml,
      uri: `#${built.idInut}`,
      xpath: "//*[local-name()='infInut']",
      companyId,
    });

    const resultado = await this.eventTransmitter.transmitInutilizacao({
      xmlInutNFeAssinado: xmlAssinado,
      uf: company.fiscalAddress.uf,
      ambiente: company.nfeConfig.ambiente,
      companyId,
    });

    const homologada = resultado.cStat === '102' || resultado.cStat === '563';

    await this.prisma.nfeInutilizacao.update({
      where: { id: registro.id },
      data: {
        status: homologada ? 'HOMOLOGADA' : 'REJEITADA',
        cStat: resultado.cStat,
        xMotivo: resultado.xMotivo,
        protocolo: resultado.protocolo ?? null,
        dhRecbto: resultado.dhRecbto ?? null,
        xmlEnvio: xmlAssinado,
        xmlResposta: resultado.xmlResposta,
      },
    });

    return {
      status: homologada ? 'HOMOLOGADA' : 'REJEITADA',
      cStat: resultado.cStat,
      xMotivo: resultado.xMotivo,
      protocolo: resultado.protocolo,
      id: registro.id,
    };
  }

  // ─── Gerar DANFE (Fase 4e) ────────────────────────────────────────────────

  async gerarDanfe(
    teamId: string,
    companyId: string,
    userId: string,
    nfeId: string,
  ): Promise<Buffer> {
    await this.ensureTeamMember(teamId, userId);
    await this.ensureCompanyBelongsToTeam(teamId, companyId);

    const nfe = await this.prisma.nfe.findFirst({
      where: { id: nfeId, companyId, isActive: true },
      select: { id: true },
    });
    if (!nfe) throw new NotFoundException('NF-e não encontrada');

    return this.nfeDanfeService.gerar(nfeId);
  }

  // ─── Download XML autorizado (Fase 4e) ────────────────────────────────────

  async downloadXml(
    teamId: string,
    companyId: string,
    userId: string,
    nfeId: string,
  ): Promise<{ xml: string; chave: string; numero: number; serie: string }> {
    await this.ensureTeamMember(teamId, userId);
    await this.ensureCompanyBelongsToTeam(teamId, companyId);

    const nfe = await this.prisma.nfe.findFirst({
      where: { id: nfeId, companyId, isActive: true },
      select: {
        status: true,
        xmlAutorizado: true,
        chave: true,
        numero: true,
        serie: true,
      },
    });
    if (!nfe) throw new NotFoundException('NF-e não encontrada');

    if (nfe.status !== NfeStatus.AUTORIZADA) {
      throw new BadRequestException('Apenas notas autorizadas possuem XML autorizado para download');
    }
    if (!nfe.xmlAutorizado) {
      throw new BadRequestException(
        'XML autorizado não disponível — re-transmita a nota',
      );
    }

    const xml = gunzipSync(Buffer.from(nfe.xmlAutorizado, 'base64')).toString('utf-8');

    return {
      xml,
      chave: nfe.chave ?? '',
      numero: nfe.numero ?? 0,
      serie: nfe.serie,
    };
  }

  // ─── Enviar email ao destinatário (Fase 4e) ───────────────────────────────

  async enviarEmail(
    teamId: string,
    companyId: string,
    userId: string,
    nfeId: string,
    dto: SendNfeEmailDto,
  ): Promise<{ enviado: boolean; to: string }> {
    await this.ensureTeamMember(teamId, userId);
    await this.ensureCompanyBelongsToTeam(teamId, companyId);

    const nfe = await this.prisma.nfe.findFirst({
      where: { id: nfeId, companyId, isActive: true },
      select: {
        status: true,
        xmlAutorizado: true,
        chave: true,
        numero: true,
        serie: true,
        customer: { select: { email: true, name: true } },
      },
    });
    if (!nfe) throw new NotFoundException('NF-e não encontrada');

    if (nfe.status !== NfeStatus.AUTORIZADA) {
      throw new BadRequestException('Apenas notas autorizadas podem ser enviadas por email');
    }
    if (!nfe.xmlAutorizado) {
      throw new BadRequestException(
        'XML autorizado não disponível — re-transmita a nota',
      );
    }
    if (!nfe.customer?.email) {
      throw new BadRequestException(
        'Destinatário sem email cadastrado — atualize o cadastro do cliente antes de enviar',
      );
    }

    const company = await this.prisma.company.findFirst({
      where: { id: companyId, isActive: true },
      include: { fiscalProfile: true },
    });
    if (!company) throw new NotFoundException('Empresa não encontrada');

    const emitenteNome =
      company.fiscalProfile?.nomeFantasia?.trim() || company.name;

    const xmlBuffer = gunzipSync(Buffer.from(nfe.xmlAutorizado, 'base64'));
    const pdfBuffer = await this.nfeDanfeService.gerar(nfeId);

    await this.mailService.sendNfeToCustomer({
      to: nfe.customer.email,
      customerName: nfe.customer.name,
      emitenteNome,
      numero: nfe.numero ?? 0,
      serie: nfe.serie,
      chave: nfe.chave ?? '',
      xmlBuffer,
      pdfBuffer,
      ...(dto.cc && dto.cc.length > 0 ? { cc: dto.cc } : {}),
    });

    return { enviado: true, to: nfe.customer.email };
  }

  // ─── Helpers de autorização ───────────────────────────────────────────────

  private async ensureTeamMember(teamId: string, userId: string) {
    const member = await this.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId }, isActive: true },
    });
    if (!member) throw new ForbiddenException('Você não é membro dessa equipe');
    return member;
  }

  private async ensureCompanyBelongsToTeam(teamId: string, companyId: string) {
    const company = await this.prisma.company.findFirst({
      where: { id: companyId, teamId, isActive: true },
    });
    if (!company) throw new NotFoundException('Empresa não encontrada');
    return company;
  }

  private async ensureCustomerBelongsToCompany(
    companyId: string,
    customerId: string,
  ) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, companyId, isActive: true },
    });
    if (!customer) throw new NotFoundException('Cliente não encontrado');
    return customer;
  }
}
