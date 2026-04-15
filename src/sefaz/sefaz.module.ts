import { Module } from '@nestjs/common';
import { SefazController } from './sefaz.controller.js';
import { SefazService } from './sefaz.service.js';
import { CertificatesModule } from '../certificates/certificates.module.js';

@Module({
  imports: [CertificatesModule],
  controllers: [SefazController],
  providers: [SefazService],
})
export class SefazModule {}
