import { Module } from '@nestjs/common';
import { DriveController } from './drive.controller.js';
import { DriveService } from './drive.service.js';
import { StorageModule } from '../storage/storage.module.js';

@Module({
  imports: [StorageModule],
  controllers: [DriveController],
  providers: [DriveService],
})
export class DriveModule {}
