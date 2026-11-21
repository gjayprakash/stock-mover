import { Body, Controller, Get, Header, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { StockService } from './stock.service';

@Controller('stock')
export class StockController {
  constructor(private readonly stock: StockService) {}

  @Get('sample.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="new-stock-sample.csv"')
  sample() {
    return this.stock.sampleCsv();
  }

  // multipart "file", CSV or .xlsx, ≤ 2 MB
  @Post('check')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024, files: 1 } }))
  check(@UploadedFile() file?: Express.Multer.File) {
    return this.stock.checkFile(file);
  }

  @Post('check-row')
  checkRow(@Body() body: Record<string, unknown>) {
    return this.stock.checkRow(body ?? {});
  }

  @Post('commit')
  commit(@Body() body: { check_id?: string }) {
    return this.stock.commit(String(body?.check_id ?? ''));
  }

  @Get('errors.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="rows-to-fix.csv"')
  errors(@Query('check_id') checkId = '') {
    return this.stock.errorsCsv(checkId);
  }
}
