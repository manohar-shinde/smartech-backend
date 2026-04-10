import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { ErrCodeModule } from './err-code/err-code.module';
import { SupabaseAuthGuard } from './auth/supabase-auth.guard';
import { OrganizationModule } from './organization/organization.module';
import { SitesModule } from './sites/sites.module';
import { StaffModule } from './staff/staff.module';
import { PartsModule } from './parts/parts.module';

@Module({
  imports: [
    UsersModule,
    ErrCodeModule,
    OrganizationModule,
    SitesModule,
    StaffModule,
    PartsModule,
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
