import { Module } from '@nestjs/common';
import { DatabaseConnection } from '../database/database';
import { CaseRepository } from './case-repository';
import { CasesController } from './cases.controller';

@Module({
  controllers: [CasesController],
  providers: [
    {
      provide: CaseRepository,
      inject: [DatabaseConnection],
      useFactory: (database: DatabaseConnection) => new CaseRepository(database.handle?.db),
    },
  ],
})
export class CasesModule {}
