import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? '*',
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Tabilize API — Auth & Pagamentos')
    .setDescription(
      'Documentação dos endpoints de cadastro, login, redefinição de senha e pagamentos (Stripe e AbacatePay).',
    )
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'bearer',
    )
    .addTag('Auth', 'Cadastro, login e redefinição de senha')
    .addTag('Billing', 'Planos, assinaturas, checkout e webhooks')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);

  const allowedAuthPaths = new Set([
    '/auth/register',
    '/auth/login',
    '/auth/forgot-password',
    '/auth/reset-password',
  ]);
  const filteredPaths: Record<string, unknown> = {};
  for (const [path, value] of Object.entries(document.paths)) {
    if (allowedAuthPaths.has(path) || path.startsWith('/billing')) {
      filteredPaths[path] = value;
    }
  }
  document.paths = filteredPaths as typeof document.paths;

  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
