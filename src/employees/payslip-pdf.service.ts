import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';

export type PayslipItemData = {
  code: string;
  description: string;
  type: 'EARNING' | 'DEDUCTION';
  reference?: string;
  value: number;
};

export type PayslipPdfData = {
  // Dados da empresa
  companyName: string;
  companyCnpj: string;
  companyAddress?: string;

  // Dados do funcionário
  employeeName: string;
  employeeCpf: string;
  employeePosition: string;
  employeeDepartment?: string;
  employeeAdmissionDate: Date;
  employeeWorkCard?: string;

  // Competência
  competenceMonth: number;
  competenceYear: number;

  // Rubricas
  items: PayslipItemData[];

  // Bases de cálculo
  baseInss?: number;
  baseIrrf?: number;
  fgtsValue?: number;
};

@Injectable()
export class PayslipPdfService {
  private readonly PAGE_WIDTH = 595.28; // A4
  private readonly PAGE_HEIGHT = 841.89;
  private readonly MARGIN = 40;
  private readonly CONTENT_WIDTH = 595.28 - 80; // PAGE_WIDTH - 2*MARGIN

  async generate(data: PayslipPdfData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({
        size: 'A4',
        margin: this.MARGIN,
        info: {
          Title: `Holerite ${data.employeeName} - ${String(data.competenceMonth).padStart(2, '0')}/${data.competenceYear}`,
          Author: data.companyName,
        },
      });

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      this.renderDocument(doc, data);
      doc.end();
    });
  }

  private renderDocument(doc: PDFKit.PDFDocument, data: PayslipPdfData): void {
    let y = this.MARGIN;

    // Cabeçalho
    y = this.renderHeader(doc, data, y);

    // Dados do funcionário
    y = this.renderEmployeeInfo(doc, data, y);

    // Separar rubricas
    const earnings = data.items.filter((i) => i.type === 'EARNING');
    const deductions = data.items.filter((i) => i.type === 'DEDUCTION');

    // Vencimentos
    y = this.renderItemsTable(doc, 'VENCIMENTOS', earnings, y);

    // Descontos
    y = this.renderItemsTable(doc, 'DESCONTOS', deductions, y);

    // Resumo
    y = this.renderSummary(doc, data, earnings, deductions, y);

    // Informações complementares
    this.renderFooter(doc, data, y);
  }

  private renderHeader(
    doc: PDFKit.PDFDocument,
    data: PayslipPdfData,
    y: number,
  ): number {
    const x = this.MARGIN;

    // Borda do cabeçalho
    doc
      .rect(x, y, this.CONTENT_WIDTH, 70)
      .strokeColor('#333333')
      .lineWidth(1)
      .stroke();

    // Nome da empresa
    doc
      .fontSize(14)
      .font('Helvetica-Bold')
      .fillColor('#000000')
      .text(data.companyName.toUpperCase(), x + 10, y + 10, {
        width: this.CONTENT_WIDTH - 20,
      });

    // CNPJ
    doc
      .fontSize(9)
      .font('Helvetica')
      .text(`CNPJ: ${this.formatCnpj(data.companyCnpj)}`, x + 10, y + 28);

    // Endereço
    if (data.companyAddress) {
      doc.text(data.companyAddress, x + 10, y + 40, {
        width: this.CONTENT_WIDTH - 150,
      });
    }

    // Título do documento
    doc
      .fontSize(10)
      .font('Helvetica-Bold')
      .text(
        'DEMONSTRATIVO DE PAGAMENTO',
        x + this.CONTENT_WIDTH - 180,
        y + 15,
        { width: 170, align: 'right' },
      );

    // Competência
    const monthName = this.getMonthName(data.competenceMonth);
    doc
      .fontSize(9)
      .font('Helvetica')
      .text(
        `${monthName.toUpperCase()} / ${data.competenceYear}`,
        x + this.CONTENT_WIDTH - 180,
        y + 32,
        { width: 170, align: 'right' },
      );

    return y + 80;
  }

  private renderEmployeeInfo(
    doc: PDFKit.PDFDocument,
    data: PayslipPdfData,
    y: number,
  ): number {
    const x = this.MARGIN;
    const boxHeight = 55;

    // Borda
    doc
      .rect(x, y, this.CONTENT_WIDTH, boxHeight)
      .strokeColor('#333333')
      .lineWidth(1)
      .stroke();

    // Título
    doc
      .rect(x, y, this.CONTENT_WIDTH, 15)
      .fillColor('#e5e7eb')
      .fill();

    doc
      .fontSize(8)
      .font('Helvetica-Bold')
      .fillColor('#000000')
      .text('DADOS DO FUNCIONÁRIO', x + 5, y + 4);

    // Linha 1: Nome, CPF
    const row1Y = y + 20;
    doc.fontSize(8).font('Helvetica-Bold').text('Nome:', x + 5, row1Y);
    doc.font('Helvetica').text(data.employeeName, x + 40, row1Y);

    doc.font('Helvetica-Bold').text('CPF:', x + 320, row1Y);
    doc.font('Helvetica').text(this.formatCpf(data.employeeCpf), x + 345, row1Y);

    // Linha 2: Cargo, Departamento, Admissão
    const row2Y = y + 35;
    doc.font('Helvetica-Bold').text('Cargo:', x + 5, row2Y);
    doc.font('Helvetica').text(data.employeePosition, x + 40, row2Y);

    if (data.employeeDepartment) {
      doc.font('Helvetica-Bold').text('Depto:', x + 200, row2Y);
      doc.font('Helvetica').text(data.employeeDepartment, x + 235, row2Y);
    }

    doc.font('Helvetica-Bold').text('Admissão:', x + 380, row2Y);
    doc
      .font('Helvetica')
      .text(this.formatDate(data.employeeAdmissionDate), x + 430, row2Y);

    return y + boxHeight + 10;
  }

  private renderItemsTable(
    doc: PDFKit.PDFDocument,
    title: string,
    items: PayslipItemData[],
    y: number,
  ): number {
    const x = this.MARGIN;
    const colWidths = {
      code: 40,
      description: 250,
      reference: 100,
      value: this.CONTENT_WIDTH - 390 - 25,
    };

    // Altura mínima da tabela
    const headerHeight = 15;
    const rowHeight = 14;
    const totalRowHeight = 16;
    const minTableHeight = headerHeight + rowHeight * Math.max(items.length, 1) + totalRowHeight;

    // Título da seção
    doc
      .rect(x, y, this.CONTENT_WIDTH, headerHeight)
      .fillColor('#1e40af')
      .fill();

    doc
      .fontSize(9)
      .font('Helvetica-Bold')
      .fillColor('#ffffff')
      .text(title, x + 5, y + 4);

    y += headerHeight;

    // Cabeçalho da tabela
    doc
      .rect(x, y, this.CONTENT_WIDTH, headerHeight)
      .fillColor('#f3f4f6')
      .fill();

    doc
      .strokeColor('#d1d5db')
      .lineWidth(0.5)
      .rect(x, y, this.CONTENT_WIDTH, headerHeight)
      .stroke();

    doc.fontSize(7).font('Helvetica-Bold').fillColor('#374151');

    let colX = x + 5;
    doc.text('CÓD', colX, y + 4, { width: colWidths.code });
    colX += colWidths.code;
    doc.text('DESCRIÇÃO', colX, y + 4, { width: colWidths.description });
    colX += colWidths.description;
    doc.text('REFERÊNCIA', colX, y + 4, { width: colWidths.reference });
    colX += colWidths.reference;
    doc.text('VALOR (R$)', colX, y + 4, {
      width: colWidths.value,
      align: 'right',
    });

    y += headerHeight;

    // Linhas de dados
    doc.fontSize(8).font('Helvetica').fillColor('#000000');

    let total = 0;
    for (const item of items) {
      total += item.value;

      // Linha alternada
      if (items.indexOf(item) % 2 === 0) {
        doc.rect(x, y, this.CONTENT_WIDTH, rowHeight).fillColor('#fafafa').fill();
      }

      doc.fillColor('#000000');
      colX = x + 5;
      doc.text(item.code, colX, y + 3, { width: colWidths.code });
      colX += colWidths.code;
      doc.text(item.description, colX, y + 3, { width: colWidths.description });
      colX += colWidths.description;
      doc.text(item.reference || '', colX, y + 3, { width: colWidths.reference });
      colX += colWidths.reference;
      doc.text(this.formatCurrency(item.value), colX, y + 3, {
        width: colWidths.value,
        align: 'right',
      });

      y += rowHeight;
    }

    // Se não tiver itens, mostrar linha vazia
    if (items.length === 0) {
      doc.text('Nenhum item', x + 5, y + 3);
      y += rowHeight;
    }

    // Linha de total
    doc
      .rect(x, y, this.CONTENT_WIDTH, totalRowHeight)
      .fillColor('#e5e7eb')
      .fill();

    doc.strokeColor('#d1d5db').rect(x, y, this.CONTENT_WIDTH, totalRowHeight).stroke();

    doc
      .fontSize(9)
      .font('Helvetica-Bold')
      .fillColor('#000000')
      .text('TOTAL', x + 5, y + 4);

    doc.text(this.formatCurrency(total), x + this.CONTENT_WIDTH - 105, y + 4, {
      width: 100,
      align: 'right',
    });

    return y + totalRowHeight + 10;
  }

  private renderSummary(
    doc: PDFKit.PDFDocument,
    data: PayslipPdfData,
    earnings: PayslipItemData[],
    deductions: PayslipItemData[],
    y: number,
  ): number {
    const x = this.MARGIN;
    const boxHeight = 60;

    const totalEarnings = earnings.reduce((sum, i) => sum + i.value, 0);
    const totalDeductions = deductions.reduce((sum, i) => sum + i.value, 0);
    const netSalary = totalEarnings - totalDeductions;

    // Borda
    doc
      .rect(x, y, this.CONTENT_WIDTH, boxHeight)
      .strokeColor('#333333')
      .lineWidth(1)
      .stroke();

    // Título
    doc
      .rect(x, y, this.CONTENT_WIDTH, 15)
      .fillColor('#065f46')
      .fill();

    doc
      .fontSize(9)
      .font('Helvetica-Bold')
      .fillColor('#ffffff')
      .text('RESUMO', x + 5, y + 4);

    // Valores
    const col1X = x + 10;
    const col2X = x + this.CONTENT_WIDTH / 3;
    const col3X = x + (this.CONTENT_WIDTH / 3) * 2;

    doc.fillColor('#000000');

    // Total Vencimentos
    doc.fontSize(8).font('Helvetica').text('Total Vencimentos:', col1X, y + 25);
    doc.font('Helvetica-Bold').text(this.formatCurrency(totalEarnings), col1X, y + 38);

    // Total Descontos
    doc.font('Helvetica').text('Total Descontos:', col2X, y + 25);
    doc.font('Helvetica-Bold').fillColor('#dc2626').text(this.formatCurrency(totalDeductions), col2X, y + 38);

    // Líquido
    doc.fillColor('#000000').font('Helvetica').text('LÍQUIDO A RECEBER:', col3X, y + 25);
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .fillColor('#065f46')
      .text(this.formatCurrency(netSalary), col3X, y + 38);

    return y + boxHeight + 10;
  }

  private renderFooter(
    doc: PDFKit.PDFDocument,
    data: PayslipPdfData,
    y: number,
  ): void {
    const x = this.MARGIN;
    const boxHeight = 35;

    // Borda
    doc
      .rect(x, y, this.CONTENT_WIDTH, boxHeight)
      .strokeColor('#d1d5db')
      .lineWidth(0.5)
      .stroke();

    // Título
    doc
      .rect(x, y, this.CONTENT_WIDTH, 12)
      .fillColor('#f3f4f6')
      .fill();

    doc
      .fontSize(7)
      .font('Helvetica-Bold')
      .fillColor('#6b7280')
      .text('INFORMAÇÕES COMPLEMENTARES', x + 5, y + 3);

    // Valores
    const infoY = y + 18;
    doc.fontSize(7).font('Helvetica').fillColor('#374151');

    const infoItems: string[] = [];
    if (data.baseInss !== undefined) {
      infoItems.push(`Base INSS: ${this.formatCurrency(data.baseInss)}`);
    }
    if (data.baseIrrf !== undefined) {
      infoItems.push(`Base IRRF: ${this.formatCurrency(data.baseIrrf)}`);
    }
    if (data.fgtsValue !== undefined) {
      infoItems.push(`FGTS do Mês: ${this.formatCurrency(data.fgtsValue)}`);
    }

    if (infoItems.length > 0) {
      doc.text(infoItems.join('    |    '), x + 5, infoY, {
        width: this.CONTENT_WIDTH - 10,
      });
    }

    // Rodapé
    doc
      .fontSize(6)
      .fillColor('#9ca3af')
      .text(
        `Documento gerado em ${this.formatDate(new Date())} às ${new Date().toLocaleTimeString('pt-BR')}`,
        x,
        this.PAGE_HEIGHT - 30,
        { width: this.CONTENT_WIDTH, align: 'center' },
      );
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private formatCurrency(value: number): string {
    return value.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  private formatCpf(cpf: string): string {
    const clean = cpf.replace(/\D/g, '');
    return clean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }

  private formatCnpj(cnpj: string): string {
    const clean = cnpj.replace(/\D/g, '');
    return clean.replace(
      /(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,
      '$1.$2.$3/$4-$5',
    );
  }

  private formatDate(date: Date): string {
    return date.toLocaleDateString('pt-BR');
  }

  private getMonthName(month: number): string {
    const months = [
      'Janeiro',
      'Fevereiro',
      'Março',
      'Abril',
      'Maio',
      'Junho',
      'Julho',
      'Agosto',
      'Setembro',
      'Outubro',
      'Novembro',
      'Dezembro',
    ];
    return months[month - 1] || '';
  }
}
