import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UserModule } from './user/user.module';
import { ErrCodeModule } from './err-code/err-code.module';
import { SupabaseAuthGuard } from './auth/supabase-auth.guard';
import { OrganizationModule } from './organization/organization.module';
import { SiteModule } from './site/site.module';
import { StaffModule } from './staff/staff.module';
import { PartModule } from './part/part.module';
import { FileModule } from './file/file.module';
import { BreakdownModule } from './breakdown/breakdown.module';
import { AmcContractModule } from './amc-contract/amc-contract.module';

@Module({
  imports: [
    UserModule,
    ErrCodeModule,
    OrganizationModule,
    SiteModule,
    StaffModule,
    PartModule,
    FileModule,
    BreakdownModule,
    AmcContractModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: SupabaseAuthGuard,
    },
  ],
})
export class AppModule {}
