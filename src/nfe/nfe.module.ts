import { Module } from '@nestjs/common';
import { NfeService } from './nfe.service.js';
import { NfeController } from './nfe.controller.js';
import { NfeXmlBuilderService } from './services/nfe-xml-builder.service.js';
import { NfeSignerService } from './services/nfe-signer.service.js';
import { NfeTransmitterService } from './services/nfe-transmitter.service.js';
import { NfeEventBuilderService } from './services/nfe-event-builder.service.js';
import { NfeInutilizacaoBuilderService } from './services/nfe-inutilizacao-builder.service.js';
import { NfeEventTransmitterService } from './services/nfe-event-transmitter.service.js';
import { NfeDanfeService } from './services/nfe-danfe.service.js';
import { DatabaseModule } from '../database/index.js';
import { CertificatesModule } from '../certificates/certificates.module.js';
import { MailModule } from '../mail/mail.module.js';

@Module({
  imports: [DatabaseModule, CertificatesModule, MailModule],
  controllers: [NfeController],
  providers: [
    NfeService,
    NfeXmlBuilderService,
    NfeSignerService,
    NfeTransmitterService,
    NfeEventBuilderService,
    NfeInutilizacaoBuilderService,
    NfeEventTransmitterService,
    NfeDanfeService,
  ],
  exports: [NfeService],
})
export class NfeModule {}
