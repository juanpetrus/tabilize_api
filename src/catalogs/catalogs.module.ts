import { Module } from '@nestjs/common';
import { CatalogsService } from './catalogs.service.js';
import { CatalogsController } from './catalogs.controller.js';

@Module({
  controllers: [CatalogsController],
  providers: [CatalogsService],
  exports: [CatalogsService],
})
export class CatalogsModule {}
