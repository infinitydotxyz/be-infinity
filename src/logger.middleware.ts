import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

/**
 * Global logging middleware that logs any incoming request.
 */
@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger(LoggerMiddleware.name);

  private toLog(req: Request, res: Response) {
    const userAgent = req.get('user-agent') || '';
    const statusCode = res?.statusCode || '';
    const ip = req.ips?.length ? req.ips[0] : req.ip;
    return `${statusCode}${statusCode ? ' ' : ''}${req.method} ${req.path} [${ip} - ${userAgent}]`;
  }

  use(req: Request, res: Response, next: NextFunction) {
    res.on('finish', () => {
      const line = this.toLog(req, res);
      if (res.statusCode >= 400) {
        this.logger.error(line);
      } else {
        this.logger.log(line);
      }
    });

    next();
  }
}
