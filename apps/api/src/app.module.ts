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

@Module({
  imports: [
    // Serves the built Vite app; one Render service, same origin, no CORS.
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', '..', 'web', 'dist'),
      exclude: ['/api/{*path}'],
    }),
    DbModule,
    RunsModule,
    AiModule,
    GeoModule,
    StoresModule,
    StockModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
