import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class ClientJwtGuard extends AuthGuard('client-jwt') {}
