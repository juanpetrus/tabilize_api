import { Module } from '@nestjs/common';
import { SefazController } from './sefaz.controller.js';
import { SefazOverviewController } from './sefaz-overview.controller.js';
import { SefazService } from './sefaz.service.js';
import { CertificatesModule } from '../certificates/certificates.module.js';

@Module({
  imports: [CertificatesModule],
  controllers: [SefazController, SefazOverviewController],
  providers: [SefazService],
})
export class SefazModule {}
