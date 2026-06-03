import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { chromium as chromiumExtra } from 'playwright-extra';
import { chromium, Browser, Page } from 'playwright';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as cheerio from 'cheerio';
import * as forge from 'node-forge';
import { PrismaService } from '../database/index.js';
import { StorageService } from '../storage/storage.service.js';
import { CertificatesService } from '../certificates/certificates.service.js';
import { OcrWorkerService } from './ocr-worker.service.js';
import { CndType, CndStatus } from '../../generated/prisma/enums.js';

chromiumExtra.use(StealthPlugin());

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
    private readonly ocrWorker: OcrWorkerService,
  ) {}

  // ─── Consultar CNDT (TST - Justiça do Trabalho) ─────────────────────────────

  /**
   * Resolve o captcha visual do CNDT via Python+EasyOCR.
   *
   * Delega ao OcrWorkerService, que mantém UM processo Python vivo com o
   * modelo carregado e o reaproveita entre as N tentativas. Isso elimina o
   * cold-start (import torch + load do modelo) que, ao dar spawn por tentativa,
   * estourava o timeout de 30s no Railway e fazia o captcha nunca ser lido.
   *
   * Por que Python: o captcha tem círculos sobrepostos que derrotam OCR
   * tradicional (Tesseract). EasyOCR (PyTorch) com segmentação por
   * connected-components + opening morfológico atinge ~20% por tentativa,
   * suficiente para acertar em 5-10 retries.
   */
  private solveCaptchaCNDT(imageBuf: Buffer): Promise<string> {
    return this.ocrWorker.recognize(imageBuf);
  }

  async consultarCNDT(cnpj: string): Promise<CndResult> {
    const cnpjLimpo = cnpj.replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) {
      throw new BadRequestException('CNPJ inválido');
    }

    let browser: Browser | null = null;
    // 20 tentativas: filtro estrito (só submete com 6 chars) descarta a
    // maioria dos OCRs, então damos mais chances ao loop.
    const MAX_TENTATIVAS = 20;

    try {
      this.logger.log(`Iniciando consulta CNDT para CNPJ: ${cnpjLimpo}`);

      browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const context = await browser.newContext({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 900 },
        acceptDownloads: true,
      });

      const page = await context.newPage();

      for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
        this.logger.log(`CNDT tentativa ${tentativa}/${MAX_TENTATIVAS}`);

        await page.goto(
          'https://cndt-certidao.tst.jus.br/gerarCertidao.faces',
          { waitUntil: 'networkidle', timeout: 30000 },
        );

        await page.waitForSelector('input[id="gerarCertidaoForm:cpfCnpj"]', {
          timeout: 15000,
        });
        await page.fill('input[id="gerarCertidaoForm:cpfCnpj"]', cnpjLimpo);

        // Aguarda o captcha carregar com base64 válido (JSF renderiza via AJAX)
        const captchaSrc = await page
          .waitForFunction(
            () => {
              const img = document.querySelector(
                'img[id="idImgBase64"]',
              ) as HTMLImageElement | null;
              return img?.src && img.src.includes('base64,') ? img.src : null;
            },
            { timeout: 10000 },
          )
          .then((h) => h.jsonValue() as Promise<string | null>)
          .catch(() => null);

        if (!captchaSrc || !captchaSrc.includes('base64,')) {
          this.logger.warn('Captcha base64 não apareceu em 10s');
          continue;
        }

        const captchaBuf = Buffer.from(
          captchaSrc.split('base64,')[1],
          'base64',
        );

        const captchaTexto = await this.solveCaptchaCNDT(captchaBuf);
        this.logger.log(`Captcha OCR: "${captchaTexto}"`);

        // Captcha do TST sempre tem 6 chars. Se OCR não devolveu 6 exatos,
        // recarrega ao invés de gastar uma submissão garantidamente errada.
        if (captchaTexto.length !== 6) {
          this.logger.warn(
            `Captcha incompleto (${captchaTexto.length} chars, esperado 6), recarregando`,
          );
          continue;
        }

        await page.fill('input[id="idCampoResposta"]', captchaTexto);

        // Clica e aguarda download do PDF (TST baixa direto quando captcha está certo)
        const downloadPromise = page
          .waitForEvent('download', { timeout: 15000 })
          .catch(() => null);
        await page.click('input[id="gerarCertidaoForm:btnEmitirCertidao"]');

        const download = await downloadPromise;

        if (download) {
          const tmpPath = await download.path();
          if (tmpPath) {
            const fs = await import('fs/promises');
            const pdfBuffer = await fs.readFile(tmpPath);

            // CNDT vale 180 dias; metadados detalhados estão no PDF
            const issueDate = new Date();
            const expirationDate = new Date();
            expirationDate.setDate(expirationDate.getDate() + 180);

            return {
              success: true,
              status: CndStatus.VALID,
              issueDate,
              expirationDate,
              protocolNumber: null,
              pdfBuffer,
              message:
                'Certidão Negativa de Débitos Trabalhistas emitida com sucesso',
            };
          }
        }

        // Sem download → captcha errado OU certidão positiva
        await page.waitForTimeout(1500);
        const html = (await page.content()).toLowerCase();

        if (
          /consta no banco nacional|inadimplente|certid[aã]o positiva/.test(
            html,
          )
        ) {
          return {
            success: true,
            status: CndStatus.POSITIVE,
            issueDate: new Date(),
            expirationDate: null,
            protocolNumber: null,
            pdfBuffer: null,
            message: 'Certidão Positiva - há débitos trabalhistas',
          };
        }

        this.logger.warn(
          `Captcha rejeitado tentativa ${tentativa}/${MAX_TENTATIVAS}`,
        );
      }

      return {
        success: false,
        status: CndStatus.ERROR,
        issueDate: null,
        expirationDate: null,
        protocolNumber: null,
        pdfBuffer: null,
        message: `Falha após ${MAX_TENTATIVAS} tentativas de captcha`,
      };
    } catch (error) {
      this.logger.error(
        `Erro na consulta CNDT: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
      );
      return {
        success: false,
        status: CndStatus.ERROR,
        issueDate: null,
        expirationDate: null,
        protocolNumber: null,
        pdfBuffer: null,
        message: `Erro na consulta: ${error instanceof Error ? error.message : 'Erro desconhecido'}`,
      };
    } finally {
      if (browser) await browser.close();
    }
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

      // Stealth é obrigatório aqui: o portal da Caixa usa Imperva/PerfDrive +
      // hCaptcha e bloqueia Playwright vanilla antes mesmo do formulário.
      browser = await chromiumExtra.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const context = await browser.newContext({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 900 },
      });

      const page = await context.newPage();

      // 1) Página inicial de consulta
      await page.goto(
        'https://consulta-crf.caixa.gov.br/consultacrf/pages/consultaEmpregador.jsf',
        { waitUntil: 'domcontentloaded', timeout: 30000 },
      );

      await page.waitForSelector('input[name="mainForm:txtInscricao1"]', {
        timeout: 15000,
      });

      // Preenche o CNPJ (tipo de inscrição CNPJ já vem selecionado por padrão)
      await page.fill('input[name="mainForm:txtInscricao1"]', cnpjLimpo);

      // 2) Clica em "Consultar" e aguarda navegação para a tela de Situação
      await Promise.all([
        page
          .waitForLoadState('networkidle', { timeout: 30000 })
          .catch(() => null),
        page.click('input[name="mainForm:btnConsultar"]'),
      ]);

      // Pequena espera para o JSF renderizar o resultado
      await page.waitForTimeout(1500);

      const situacaoHtml = await page.content();
      const $situacao = cheerio.load(situacaoHtml);
      const textoSituacao = $situacao('body').text();

      // Mensagem de feedback do portal da Caixa (ex.: "Empregador não cadastrado.")
      const feedbackText =
        $situacao('.feedback-text').first().text().trim() ||
        $situacao('.feedback').first().text().trim();

      // Empregador não cadastrado na base da Caixa — não há CRF a emitir.
      // Devolve como ERRO de consulta, com a mensagem exata do portal.
      if (/n[ãa]o\s+cadastrad/i.test(textoSituacao)) {
        await browser.close();
        return {
          success: false,
          status: CndStatus.ERROR,
          issueDate: null,
          expirationDate: null,
          protocolNumber: null,
          pdfBuffer: null,
          message: `Consulta do CRF (FGTS): ${
            feedbackText || 'Empregador não cadastrado na Caixa'
          }`,
        };
      }

      // Não encontrado
      if (
        /não foi encontrad|Nenhum resultado|inscrição.*inválida/i.test(
          textoSituacao,
        )
      ) {
        await browser.close();
        return {
          success: false,
          status: CndStatus.ERROR,
          issueDate: null,
          expirationDate: null,
          protocolNumber: null,
          pdfBuffer: null,
          message: feedbackText
            ? `Consulta do CRF (FGTS): ${feedbackText}`
            : 'CNPJ não encontrado no sistema da Caixa',
        };
      }

      const regular =
        /est[áa]\s+REGULAR\s+(?:perante\s+o|no)\s+FGTS/i.test(textoSituacao);
      const irregular = /IRREGULAR|pendência/i.test(textoSituacao);

      if (irregular && !regular) {
        await browser.close();
        return {
          success: true,
          status: CndStatus.POSITIVE,
          issueDate: new Date(),
          expirationDate: null,
          protocolNumber: null,
          pdfBuffer: null,
          message: 'CRF Irregular - Há pendências com o FGTS',
        };
      }

      if (!regular) {
        await browser.close();
        return {
          success: false,
          status: CndStatus.ERROR,
          issueDate: null,
          expirationDate: null,
          protocolNumber: null,
          pdfBuffer: null,
          message: feedbackText
            ? `Consulta do CRF (FGTS): ${feedbackText}`
            : 'Erro na consulta do CRF (FGTS): não foi possível determinar a situação do empregador',
        };
      }

      // 3) Clica no link "Certificado de Regularidade do FGTS - CRF"
      const linkCertificado = await page.$(
        'a:has-text("Certificado de Regularidade do FGTS")',
      );
      if (!linkCertificado) {
        await browser.close();
        return {
          success: false,
          status: CndStatus.PENDING,
          issueDate: null,
          expirationDate: null,
          protocolNumber: null,
          pdfBuffer: null,
          message: 'Empresa regular, mas link do certificado não encontrado',
        };
      }

      await Promise.all([
        page
          .waitForLoadState('networkidle', { timeout: 30000 })
          .catch(() => null),
        linkCertificado.click(),
      ]);
      await page.waitForTimeout(1500);

      // 4) Página com dados do CRF - extrai validade e número antes de visualizar
      const crfHtml = await page.content();
      const $crf = cheerio.load(crfHtml);
      const textoCrf = $crf('body').text();

      let dataEmissao: Date | null = null;
      let dataValidade: Date | null = null;
      let protocolo: string | null = null;

      const validadeMatch = textoCrf.match(
        /Validade:\s*(\d{2}\/\d{2}\/\d{4})\s*a\s*(\d{2}\/\d{2}\/\d{4})/i,
      );
      if (validadeMatch) {
        dataEmissao = this.parseBrDate(validadeMatch[1]);
        dataValidade = this.parseBrDate(validadeMatch[2]);
      }

      const numeroMatch = textoCrf.match(
        /Certificado\s+Número:\s*([0-9]{10,})/i,
      );
      if (numeroMatch) {
        protocolo = numeroMatch[1];
      }

      // 5) Clica em "Visualizar" - abre a tela final imprimível em nova aba
      const btnVisualizar = await page.$(
        'input[name="mainForm:btnVisualizar"]',
      );
      let pdfBuffer: Buffer | null = null;

      if (btnVisualizar) {
        const [popup] = await Promise.all([
          context.waitForEvent('page', { timeout: 15000 }).catch(() => null),
          btnVisualizar.click(),
        ]);

        const paginaCertificado = popup ?? page;
        await paginaCertificado
          .waitForLoadState('networkidle', { timeout: 30000 })
          .catch(() => null);
        await paginaCertificado.waitForTimeout(1500);

        // Gera PDF da página final do certificado
        try {
          pdfBuffer = Buffer.from(
            await paginaCertificado.pdf({
              format: 'A4',
              printBackground: true,
              margin: {
                top: '10mm',
                bottom: '10mm',
                left: '10mm',
                right: '10mm',
              },
            }),
          );
        } catch (pdfError) {
          this.logger.warn(
            `Falha ao gerar PDF do CRF via page.pdf(): ${pdfError instanceof Error ? pdfError.message : 'erro'}`,
          );
        }
      }

      await browser.close();

      if (!dataEmissao) dataEmissao = new Date();
      if (!dataValidade) {
        dataValidade = new Date();
        dataValidade.setDate(dataValidade.getDate() + 30);
      }

      return {
        success: true,
        status: CndStatus.VALID,
        issueDate: dataEmissao,
        expirationDate: dataValidade,
        protocolNumber: protocolo,
        pdfBuffer,
        message: 'CRF Regular - Empresa em dia com o FGTS',
      };
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

  private parseBrDate(value: string): Date {
    const [dia, mes, ano] = value.split('/');
    return new Date(parseInt(ano), parseInt(mes) - 1, parseInt(dia));
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
