import { Module } from '@nestjs/common';
import { DocumentsController, ClientDocumentsController } from './documents.controller.js';
import { DocumentsService } from './documents.service.js';
import { ClientAuthModule } from '../client-auth/client-auth.module.js';
import { StorageModule } from '../storage/storage.module.js';

@Module({
  imports: [ClientAuthModule, StorageModule],
  controllers: [DocumentsController, ClientDocumentsController],
  providers: [DocumentsService],
})
export class DocumentsModule {}
