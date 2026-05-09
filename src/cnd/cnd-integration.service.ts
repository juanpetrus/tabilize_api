import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { chromium, Browser, Page } from 'playwright';
import * as cheerio from 'cheerio';
import * as forge from 'node-forge';
import { PrismaService } from '../database/index.js';
import { StorageService } from '../storage/storage.service.js';
import { CertificatesService } from '../certificates/certificates.service.js';
import { CndType, CndStatus } from '../../generated/prisma/enums.js';

interface CndResult {
  success: boolean;
  status: CndStatus;
  issueDate: Date | null;
  expirationDate: Date | null;
  protocolNumber: string | null;
  pdfBuffer: Buffer | null;
  message: string;
}

@Injectable()
export class CndIntegrationService {
  private readonly logger = new Logger(CndIntegrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly certificates: CertificatesService,
  ) {}

  // ─── Consultar CNDT (TST - Justiça do Trabalho) ─────────────────────────────

  async consultarCNDT(cnpj: string): Promise<CndResult> {
    const cnpjLimpo = cnpj.replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) {
      throw new BadRequestException('CNPJ inválido');
    }

    let browser: Browser | null = null;

    try {
      this.logger.log(`Iniciando consulta CNDT para CNPJ: ${cnpjLimpo}`);

      browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const context = await browser.newContext({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 720 },
      });

      const page = await context.newPage();

      // Acessa a página de consulta
      await page.goto('https://cndt-certidao.tst.jus.br/inicio.faces', {
        waitUntil: 'networkidle',
        timeout: 30000,
      });

      // Aguarda o formulário carregar
      await page.waitForSelector('input[id*="cpfCnpj"]', { timeout: 10000 });

      // Preenche o CNPJ
      await page.fill('input[id*="cpfCnpj"]', cnpjLimpo);

      // Clica no botão de consulta
      const submitButton = await page.$(
        'input[type="submit"][value*="Consultar"], button[id*="btnConsultar"]',
      );
      if (submitButton) {
        await submitButton.click();
      } else {
        // Tenta encontrar o botão de outra forma
        await page.click(
          'button:has-text("Consultar"), input[value*="Consultar"]',
        );
      }

      // Aguarda resultado
      await page.waitForLoadState('networkidle', { timeout: 30000 });

      // Verifica se há resultado
      const content = await page.content();
      const $ = cheerio.load(content);

      // Verifica diferentes cenários de resultado
      const resultado = this.parseTSTResult($, page);

      await browser.close();
      return resultado;
    } catch (error) {
      this.logger.error(
        `Erro na consulta CNDT: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
      );
      if (browser) await browser.close();

      return {
        success: false,
        status: CndStatus.ERROR,
        issueDate: null,
        expirationDate: null,
        protocolNumber: null,
        pdfBuffer: null,
        message: `Erro na consulta: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
      };
    }
  }

  private async parseTSTResult(
    $: cheerio.CheerioAPI,
    page: Page,
  ): Promise<CndResult> {
    // Verifica se a certidão é negativa (empresa sem débitos)
    const certidaoNegativa =
      $('*:contains("CERTIDÃO NEGATIVA")').length > 0 ||
      $('*:contains("certidão negativa")').length > 0;

    const certidaoPositiva =
      $('*:contains("CERTIDÃO POSITIVA")').length > 0 ||
      $('*:contains("certidão positiva")').length > 0;

    const naoEncontrado =
      $('*:contains("não foi encontrad")').length > 0 ||
      $('*:contains("Nenhum resultado")').length > 0;

    if (naoEncontrado) {
      return {
        success: false,
        status: CndStatus.ERROR,
        issueDate: null,
        expirationDate: null,
        protocolNumber: null,
        pdfBuffer: null,
        message: 'CNPJ não encontrado no sistema do TST',
      };
    }

    // Tenta extrair informações da certidão
    let pdfBuffer: Buffer | null = null;
    let protocolo: string | null = null;
    let dataEmissao: Date | null = null;
    let dataValidade: Date | null = null;

    // Busca número do protocolo
    const protocoloMatch = $('body')
      .text()
      .match(/(?:Código|Protocolo|Número)[:\s]*(\d{4,}[\d./-]*\d)/i);
    if (protocoloMatch) {
      protocolo = protocoloMatch[1];
    }

    // Busca data de emissão
    const dataEmissaoMatch = $('body')
      .text()
      .match(/(?:Emitida em|Emissão|Data)[:\s]*(\d{2}\/\d{2}\/\d{4})/i);
    if (dataEmissaoMatch) {
      const [dia, mes, ano] = dataEmissaoMatch[1].split('/');
      dataEmissao = new Date(parseInt(ano), parseInt(mes) - 1, parseInt(dia));
    }

    // Busca data de validade
    const dataValidadeMatch = $('body')
      .text()
      .match(/(?:Válida até|Validade)[:\s]*(\d{2}\/\d{2}\/\d{4})/i);
    if (dataValidadeMatch) {
      const [dia, mes, ano] = dataValidadeMatch[1].split('/');
      dataValidade = new Date(parseInt(ano), parseInt(mes) - 1, parseInt(dia));
    }

    // Tenta fazer download do PDF se disponível
    try {
      const downloadButton = await page.$(
        'a:has-text("PDF"), a:has-text("Download"), a:has-text("Imprimir"), button:has-text("PDF")',
      );
      if (downloadButton) {
        const [download] = await Promise.all([
          page.waitForEvent('download', { timeout: 10000 }).catch(() => null),
          downloadButton.click(),
        ]);

        if (download) {
          const path = await download.path();
          if (path) {
            const fs = await import('fs/promises');
            pdfBuffer = await fs.readFile(path);
          }
        }
      }
    } catch {
      // Se não conseguir baixar PDF, apenas continua
      this.logger.warn('Não foi possível baixar o PDF da CNDT');
    }

    // Se não encontrou data de emissão, usa a data atual
    if (!dataEmissao) {
      dataEmissao = new Date();
    }

    // Se não encontrou data de validade, calcula 180 dias (padrão CNDT)
    if (!dataValidade) {
      dataValidade = new Date();
      dataValidade.setDate(dataValidade.getDate() + 180);
    }

    if (certidaoNegativa) {
      return {
        success: true,
        status: CndStatus.VALID,
        issueDate: dataEmissao,
        expirationDate: dataValidade,
        protocolNumber: protocolo,
        pdfBuffer,
        message:
          'Certidão Negativa de Débitos Trabalhistas emitida com sucesso',
      };
    }

    if (certidaoPositiva) {
      // Verifica se é positiva com efeito de negativa
      const efeitoNegativa = $('*:contains("efeito de negativa")').length > 0;

      return {
        success: true,
        status: efeitoNegativa
          ? CndStatus.POSITIVE_NEGATIVE
          : CndStatus.POSITIVE,
        issueDate: dataEmissao,
        expirationDate: dataValidade,
        protocolNumber: protocolo,
        pdfBuffer,
        message: efeitoNegativa
          ? 'Certidão Positiva com Efeito de Negativa emitida'
          : 'Certidão Positiva - há débitos pendentes',
      };
    }

    // Se chegou aqui, não conseguiu determinar o resultado
    return {
      success: false,
      status: CndStatus.PENDING,
      issueDate: null,
      expirationDate: null,
      protocolNumber: null,
      pdfBuffer: null,
      message: 'Não foi possível determinar o resultado da consulta',
    };
  }

  // ─── Consultar CRF (FGTS - Caixa) ───────────────────────────────────────────

  async consultarCRF(cnpj: string): Promise<CndResult> {
    const cnpjLimpo = cnpj.replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) {
      throw new BadRequestException('CNPJ inválido');
    }

    let browser: Browser | null = null;

    try {
      this.logger.log(`Iniciando consulta CRF para CNPJ: ${cnpjLimpo}`);

      browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const context = await browser.newContext({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 720 },
      });

      const page = await context.newPage();

      // Acessa a página de consulta
      await page.goto(
        'https://consulta-crf.caixa.gov.br/consultacrf/pages/consultaEmpregador.jsf',
        {
          waitUntil: 'networkidle',
          timeout: 30000,
        },
      );

      // Aguarda o formulário carregar
      await page.waitForSelector(
        'input[id*="inscricao"], input[name*="inscricao"]',
        { timeout: 10000 },
      );

      // Preenche o CNPJ
      await page.fill(
        'input[id*="inscricao"], input[name*="inscricao"]',
        cnpjLimpo,
      );

      // Verifica se há CAPTCHA
      const captchaElement = await page.$(
        'img[id*="captcha"], div[class*="captcha"], iframe[src*="recaptcha"]',
      );

      if (captchaElement) {
        this.logger.warn('CAPTCHA detectado no portal FGTS');

        await browser.close();
        return {
          success: false,
          status: CndStatus.PENDING,
          issueDate: null,
          expirationDate: null,
          protocolNumber: null,
          pdfBuffer: null,
          message: 'Portal FGTS requer CAPTCHA - consulta manual necessária',
        };
      }

      // Clica no botão de consulta
      await page.click(
        'button[id*="consultar"], input[type="submit"][value*="Consultar"]',
      );

      // Aguarda resultado
      await page.waitForLoadState('networkidle', { timeout: 30000 });

      const content = await page.content();
      const $ = cheerio.load(content);

      const resultado = this.parseFGTSResult($, page);

      await browser.close();
      return resultado;
    } catch (error) {
      this.logger.error(
        `Erro na consulta CRF: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
      );
      if (browser) await browser.close();

      return {
        success: false,
        status: CndStatus.ERROR,
        issueDate: null,
        expirationDate: null,
        protocolNumber: null,
        pdfBuffer: null,
        message: `Erro na consulta: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
      };
    }
  }

  private async parseFGTSResult(
    $: cheerio.CheerioAPI,
    page: Page,
  ): Promise<CndResult> {
    // Verifica se o CRF está regular
    const regular =
      $('*:contains("REGULAR")').length > 0 ||
      $('*:contains("regular")').length > 0;

    const irregular =
      $('*:contains("IRREGULAR")').length > 0 ||
      $('*:contains("irregular")').length > 0 ||
      $('*:contains("pendência")').length > 0;

    const naoEncontrado =
      $('*:contains("não foi encontrad")').length > 0 ||
      $('*:contains("Nenhum resultado")').length > 0;

    if (naoEncontrado) {
      return {
        success: false,
        status: CndStatus.ERROR,
        issueDate: null,
        expirationDate: null,
        protocolNumber: null,
        pdfBuffer: null,
        message: 'CNPJ não encontrado no sistema da Caixa',
      };
    }

    let pdfBuffer: Buffer | null = null;
    let protocolo: string | null = null;
    let dataEmissao: Date | null = null;
    let dataValidade: Date | null = null;

    // Busca número do CRF
    const protocoloMatch = $('body')
      .text()
      .match(/(?:CRF|Protocolo|Número)[:\s]*(\d{4,}[\d./-]*\d)/i);
    if (protocoloMatch) {
      protocolo = protocoloMatch[1];
    }

    // Busca data de emissão
    const dataEmissaoMatch = $('body')
      .text()
      .match(/(?:Emissão|Data)[:\s]*(\d{2}\/\d{2}\/\d{4})/i);
    if (dataEmissaoMatch) {
      const [dia, mes, ano] = dataEmissaoMatch[1].split('/');
      dataEmissao = new Date(parseInt(ano), parseInt(mes) - 1, parseInt(dia));
    }

    // Busca data de validade
    const dataValidadeMatch = $('body')
      .text()
      .match(/(?:Válido até|Validade)[:\s]*(\d{2}\/\d{2}\/\d{4})/i);
    if (dataValidadeMatch) {
      const [dia, mes, ano] = dataValidadeMatch[1].split('/');
      dataValidade = new Date(parseInt(ano), parseInt(mes) - 1, parseInt(dia));
    }

    // Tenta baixar PDF
    try {
      const downloadButton = await page.$(
        'a:has-text("PDF"), a:has-text("Imprimir"), button:has-text("Gerar")',
      );
      if (downloadButton) {
        const [download] = await Promise.all([
          page.waitForEvent('download', { timeout: 10000 }).catch(() => null),
          downloadButton.click(),
        ]);

        if (download) {
          const path = await download.path();
          if (path) {
            const fs = await import('fs/promises');
            pdfBuffer = await fs.readFile(path);
          }
        }
      }
    } catch {
      this.logger.warn('Não foi possível baixar o PDF do CRF');
    }

    if (!dataEmissao) {
      dataEmissao = new Date();
    }

    // CRF tem validade de 30 dias
    if (!dataValidade) {
      dataValidade = new Date();
      dataValidade.setDate(dataValidade.getDate() + 30);
    }

    if (regular) {
      return {
        success: true,
        status: CndStatus.VALID,
        issueDate: dataEmissao,
        expirationDate: dataValidade,
        protocolNumber: protocolo,
        pdfBuffer,
        message: 'CRF Regular - Empresa em dia com o FGTS',
      };
    }

    if (irregular) {
      return {
        success: true,
        status: CndStatus.POSITIVE,
        issueDate: dataEmissao,
        expirationDate: null,
        protocolNumber: protocolo,
        pdfBuffer: null,
        message: 'CRF Irregular - Há pendências com o FGTS',
      };
    }

    return {
      success: false,
      status: CndStatus.PENDING,
      issueDate: null,
      expirationDate: null,
      protocolNumber: null,
      pdfBuffer: null,
      message: 'Não foi possível determinar o resultado da consulta',
    };
  }

  // ─── Consultar CND Federal (Receita Federal / PGFN) ─────────────────────────

  async consultarCNDFederal(
    cnpj: string,
    companyId: string,
  ): Promise<CndResult> {
    const cnpjLimpo = cnpj.replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) {
      throw new BadRequestException('CNPJ inválido');
    }

    // Verifica se tem certificado ativo
    let certData: { fileBuffer: Buffer; password: string };
    try {
      certData = await this.certificates.getForIntegration(companyId);
    } catch {
      return {
        success: false,
        status: CndStatus.PENDING,
        issueDate: null,
        expirationDate: null,
        protocolNumber: null,
        pdfBuffer: null,
        message:
          'Certificado digital A1 não encontrado ou expirado. Cadastre um certificado válido para consultar CND Federal.',
      };
    }

    let browser: Browser | null = null;

    try {
      this.logger.log(`Iniciando consulta CND Federal para CNPJ: ${cnpjLimpo}`);

      // Extrai certificado e chave do PFX para uso no Playwright
      const { cert, key } = this.extractCertAndKey(
        certData.fileBuffer,
        certData.password,
      );

      browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      // Cria contexto com certificado SSL client
      const context = await browser.newContext({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 720 },
        clientCertificates: [
          {
            origin: 'https://solucoes.receita.fazenda.gov.br',
            certPath: undefined,
            keyPath: undefined,
            cert: Buffer.from(cert),
            key: Buffer.from(key),
          },
        ],
      });

      const page = await context.newPage();

      // Acessa o portal de emissão de CND
      await page.goto(
        'https://solucoes.receita.fazenda.gov.br/Servicos/certidaointernet/PJ/Emitir',
        {
          waitUntil: 'networkidle',
          timeout: 60000,
        },
      );

      // Aguarda a página carregar - pode redirecionar para login por certificado
      await page.waitForLoadState('networkidle', { timeout: 30000 });

      // Verifica se precisa preencher o CNPJ ou se já foi preenchido automaticamente
      const cnpjInput = await page.$('input[name*="cnpj"], input[id*="cnpj"]');
      if (cnpjInput) {
        await cnpjInput.fill(cnpjLimpo);
        // Clica no botão de consulta
        const submitBtn = await page.$(
          'button[type="submit"], input[type="submit"], button:has-text("Emitir"), button:has-text("Consultar")',
        );
        if (submitBtn) {
          await submitBtn.click();
          await page.waitForLoadState('networkidle', { timeout: 30000 });
        }
      }

      // Aguarda resultado
      await page.waitForTimeout(3000);

      const content = await page.content();
      const $ = cheerio.load(content);

      const resultado = await this.parseFederalResult($, page);

      await browser.close();
      return resultado;
    } catch (error) {
      this.logger.error(
        `Erro na consulta CND Federal: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
      );
      if (browser) await browser.close();

      return {
        success: false,
        status: CndStatus.ERROR,
        issueDate: null,
        expirationDate: null,
        protocolNumber: null,
        pdfBuffer: null,
        message: `Erro na consulta: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
      };
    }
  }

  private extractCertAndKey(
    pfxBuffer: Buffer,
    password: string,
  ): { cert: string; key: string } {
    const p12Asn1 = forge.asn1.fromDer(pfxBuffer.toString('binary'));
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);

    const keyBags = p12.getBags({
      bagType: forge.pki.oids.pkcs8ShroudedKeyBag,
    });
    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });

    const privateKey = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0]?.key;
    const certificate = certBags[forge.pki.oids.certBag]?.[0]?.cert;

    if (!privateKey || !certificate) {
      throw new BadRequestException('Certificado inválido ou corrompido');
    }

    return {
      cert: forge.pki.certificateToPem(certificate),
      key: forge.pki.privateKeyToPem(privateKey),
    };
  }

  private async parseFederalResult(
    $: cheerio.CheerioAPI,
    page: Page,
  ): Promise<CndResult> {
    const bodyText = $('body').text().toLowerCase();

    // Verifica diferentes cenários de resultado
    const certidaoNegativa =
      bodyText.includes('certidão negativa') ||
      bodyText.includes('nada consta') ||
      bodyText.includes('não constam pendências');

    const certidaoPositiva =
      bodyText.includes('certidão positiva') ||
      bodyText.includes('existem pendências') ||
      bodyText.includes('débitos');

    const positivaComEfeito =
      bodyText.includes('positiva com efeitos de negativa') ||
      bodyText.includes('efeito de negativa');

    const erroAcesso =
      bodyText.includes('acesso negado') ||
      bodyText.includes('certificado não autorizado') ||
      bodyText.includes('não foi possível');

    if (erroAcesso) {
      return {
        success: false,
        status: CndStatus.ERROR,
        issueDate: null,
        expirationDate: null,
        protocolNumber: null,
        pdfBuffer: null,
        message:
          'Acesso negado. Verifique se o certificado é da empresa consultada.',
      };
    }

    let pdfBuffer: Buffer | null = null;
    let protocolo: string | null = null;
    let dataEmissao: Date | null = null;
    let dataValidade: Date | null = null;

    // Busca código de controle / protocolo
    const protocoloMatch = $('body')
      .text()
      .match(
        /(?:Código de Controle|Protocolo|Número)[:\s]*([A-Z0-9]{4}[\s.-]?[A-Z0-9]{4}[\s.-]?[A-Z0-9]{4}[\s.-]?[A-Z0-9]{4})/i,
      );
    if (protocoloMatch) {
      protocolo = protocoloMatch[1].replace(/[\s.-]/g, '');
    }

    // Busca data de emissão
    const dataEmissaoMatch = $('body')
      .text()
      .match(/(?:Emitida em|Emissão|Data)[:\s]*(\d{2}\/\d{2}\/\d{4})/i);
    if (dataEmissaoMatch) {
      const [dia, mes, ano] = dataEmissaoMatch[1].split('/');
      dataEmissao = new Date(parseInt(ano), parseInt(mes) - 1, parseInt(dia));
    }

    // Busca data de validade (CND Federal tem validade de 180 dias)
    const dataValidadeMatch = $('body')
      .text()
      .match(/(?:Válida até|Validade)[:\s]*(\d{2}\/\d{2}\/\d{4})/i);
    if (dataValidadeMatch) {
      const [dia, mes, ano] = dataValidadeMatch[1].split('/');
      dataValidade = new Date(parseInt(ano), parseInt(mes) - 1, parseInt(dia));
    }

    // Tenta baixar o PDF
    try {
      const downloadButton = await page.$(
        'a:has-text("PDF"), a:has-text("Imprimir"), a:has-text("Baixar"), button:has-text("Imprimir")',
      );
      if (downloadButton) {
        const [download] = await Promise.all([
          page.waitForEvent('download', { timeout: 15000 }).catch(() => null),
          downloadButton.click(),
        ]);

        if (download) {
          const path = await download.path();
          if (path) {
            const fs = await import('fs/promises');
            pdfBuffer = await fs.readFile(path);
          }
        }
      }
    } catch {
      this.logger.warn('Não foi possível baixar o PDF da CND Federal');
    }

    if (!dataEmissao) {
      dataEmissao = new Date();
    }

    // CND Federal tem validade de 180 dias
    if (!dataValidade) {
      dataValidade = new Date();
      dataValidade.setDate(dataValidade.getDate() + 180);
    }

    if (certidaoNegativa) {
      return {
        success: true,
        status: CndStatus.VALID,
        issueDate: dataEmissao,
        expirationDate: dataValidade,
        protocolNumber: protocolo,
        pdfBuffer,
        message: 'Certidão Negativa de Débitos Federais emitida com sucesso',
      };
    }

    if (positivaComEfeito) {
      return {
        success: true,
        status: CndStatus.POSITIVE_NEGATIVE,
        issueDate: dataEmissao,
        expirationDate: dataValidade,
        protocolNumber: protocolo,
        pdfBuffer,
        message: 'Certidão Positiva com Efeitos de Negativa emitida',
      };
    }

    if (certidaoPositiva) {
      return {
        success: true,
        status: CndStatus.POSITIVE,
        issueDate: dataEmissao,
        expirationDate: null,
        protocolNumber: protocolo,
        pdfBuffer: null,
        message:
          'Certidão Positiva - há débitos pendentes com a Receita Federal',
      };
    }

    return {
      success: false,
      status: CndStatus.PENDING,
      issueDate: null,
      expirationDate: null,
      protocolNumber: null,
      pdfBuffer: null,
      message:
        'Não foi possível determinar o resultado da consulta. Tente novamente.',
    };
  }

  // ─── Verificar se empresa tem certificado ativo ─────────────────────────────

  async hasCertificateActive(companyId: string): Promise<boolean> {
    try {
      await this.certificates.getForIntegration(companyId);
      return true;
    } catch {
      return false;
    }
  }

  // ─── Sincronizar CND de uma empresa ─────────────────────────────────────────

  async syncCnd(
    teamId: string,
    companyId: string,
    userId: string,
    type: CndType,
  ) {
    // Verifica permissão
    const member = await this.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId }, isActive: true },
    });
    if (!member)
      throw new BadRequestException('Você não é membro dessa equipe');

    const company = await this.prisma.company.findFirst({
      where: { id: companyId, teamId, isActive: true },
    });
    if (!company) throw new BadRequestException('Empresa não encontrada');
    if (!company.cnpj)
      throw new BadRequestException('Empresa sem CNPJ cadastrado');

    let resultado: CndResult;

    switch (type) {
      case CndType.TRABALHISTA:
        resultado = await this.consultarCNDT(company.cnpj);
        break;

      case CndType.FGTS:
        resultado = await this.consultarCRF(company.cnpj);
        break;

      case CndType.FEDERAL:
        resultado = await this.consultarCNDFederal(company.cnpj, companyId);
        break;

      default:
        throw new BadRequestException(
          `Consulta automática não disponível para ${type}. ` +
            'Tipos suportados: FEDERAL (requer certificado), TRABALHISTA (CNDT/TST) e FGTS (CRF).',
        );
    }

    // Salva/atualiza a CND no banco
    let fileUrl: string | null = null;
    let fileName: string | null = null;

    if (resultado.pdfBuffer) {
      const timestamp = Date.now();
      fileName = `${type.toLowerCase()}_${timestamp}.pdf`;
      fileUrl = await this.storage.upload(
        {
          buffer: resultado.pdfBuffer,
          originalname: fileName,
          mimetype: 'application/pdf',
        } as Express.Multer.File,
        `cnd/${companyId}`,
      );
    }

    const cnd = await this.prisma.cnd.upsert({
      where: {
        companyId_type: { companyId, type },
      },
      create: {
        companyId,
        type,
        status: resultado.status,
        issueDate: resultado.issueDate,
        expirationDate: resultado.expirationDate,
        protocolNumber: resultado.protocolNumber,
        fileUrl,
        fileName,
        autoSync: true,
        lastSyncAt: new Date(),
        lastError: resultado.success ? null : resultado.message,
      },
      update: {
        status: resultado.status,
        issueDate: resultado.issueDate ?? undefined,
        expirationDate: resultado.expirationDate ?? undefined,
        protocolNumber: resultado.protocolNumber ?? undefined,
        ...(fileUrl && { fileUrl, fileName }),
        lastSyncAt: new Date(),
        lastError: resultado.success ? null : resultado.message,
      },
    });

    return {
      success: resultado.success,
      message: resultado.message,
      cnd,
    };
  }

  // ─── Sincronizar todas as CNDs de uma empresa ───────────────────────────────

  async syncAllCnds(teamId: string, companyId: string, userId: string) {
    const results: { type: CndType; success: boolean; message: string }[] = [];

    // Sincroniza CND Federal (se tiver certificado)
    const hasCert = await this.hasCertificateActive(companyId);
    if (hasCert) {
      try {
        const federal = await this.syncCnd(
          teamId,
          companyId,
          userId,
          CndType.FEDERAL,
        );
        results.push({
          type: CndType.FEDERAL,
          success: federal.success,
          message: federal.message,
        });
      } catch (error) {
        results.push({
          type: CndType.FEDERAL,
          success: false,
          message: error instanceof Error ? error.message : 'Erro desconhecido',
        });
      }
    } else {
      results.push({
        type: CndType.FEDERAL,
        success: false,
        message: 'Certificado digital não encontrado - consulta ignorada',
      });
    }

    // Sincroniza CNDT (TST)
    try {
      const cndt = await this.syncCnd(
        teamId,
        companyId,
        userId,
        CndType.TRABALHISTA,
      );
      results.push({
        type: CndType.TRABALHISTA,
        success: cndt.success,
        message: cndt.message,
      });
    } catch (error) {
      results.push({
        type: CndType.TRABALHISTA,
        success: false,
        message: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    }

    // Sincroniza CRF (FGTS)
    try {
      const crf = await this.syncCnd(teamId, companyId, userId, CndType.FGTS);
      results.push({
        type: CndType.FGTS,
        success: crf.success,
        message: crf.message,
      });
    } catch (error) {
      results.push({
        type: CndType.FGTS,
        success: false,
        message: error instanceof Error ? error.message : 'Erro desconhecido',
      });
    }

    return results;
  }
}
