import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { DbModule } from './db/db.module';
import { HealthController } from './health.controller';
import { RunsModule } from './runs/runs.module';
import { AiModule } from './ai/ai.module';
import { GeoModule } from './geo/geo.module';
import { StoresModule } from './stores/stores.module';
import { StockModule } from './stock/stock.module';
import { AuthModule } from './auth/auth.module';
import { DriversModule } from './drivers/drivers.module';

@Module({
  imports: [
    // Serves the built Vite app; one Render service, same origin, no CORS.
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', '..', 'web', 'dist'),
      exclude: ['/api/{*path}'],
      // /pair#<token>: never leak the page URL to other sites.
      serveStaticOptions: { setHeaders: (res) => res.setHeader('Referrer-Policy', 'no-referrer') },
    }),
    DbModule,
    RunsModule,
    AiModule,
    GeoModule,
    StoresModule,
    StockModule,
    DriversModule, // drivers + phone pairing (#81)
    AuthModule, // users + sessions; routes need sign-in only when AUTH_REQUIRED=true
  ],
  controllers: [HealthController],
})
export class AppModule {}
