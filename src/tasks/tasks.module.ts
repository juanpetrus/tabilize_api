import { Module } from '@nestjs/common';
import { TasksController, TeamTasksController } from './tasks.controller.js';
import { TasksService } from './tasks.service.js';

@Module({
  controllers: [TasksController, TeamTasksController],
  providers: [TasksService],
})
export class TasksModule {}
