import { Module } from '@nestjs/common';
import { DriveController, ClientDriveController, CompanyDriveController } from './drive.controller.js';
import { DriveService } from './drive.service.js';
import { StorageModule } from '../storage/storage.module.js';
import { ClientAuthModule } from '../client-auth/client-auth.module.js';

@Module({
  imports: [StorageModule, ClientAuthModule],
  controllers: [DriveController, ClientDriveController, CompanyDriveController],
  providers: [DriveService],
  exports: [DriveService],
})
export class DriveModule {}
