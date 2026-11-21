import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { DbModule } from './db/db.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    // Serves the built Vite app; one Render service, same origin, no CORS.
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', '..', 'web', 'dist'),
      exclude: ['/api/{*path}'],
    }),
    DbModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
