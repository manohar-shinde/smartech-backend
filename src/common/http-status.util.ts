import { HttpStatus } from '@nestjs/common';

type ServiceResult = {
  success?: boolean;
  message?: string;
};

export function getErrorStatusCode(result: ServiceResult): number {
  const message = (result?.message || '').toLowerCase();

  if (
    message.includes('not authenticated') ||
    message.includes('unauthorized') ||
    message.includes('invalid login session')
  ) {
    return HttpStatus.UNAUTHORIZED;
  }

  if (message.includes('forbidden') || message.includes('only owner')) {
    return HttpStatus.FORBIDDEN;
  }

  if (message.includes('not found')) {
    return HttpStatus.NOT_FOUND;
  }

  if (message.includes('already exists') || message.includes('duplicate')) {
    return HttpStatus.CONFLICT;
  }

  if (
    message.includes('required') ||
    message.includes('invalid') ||
    message.includes('unsupported') ||
    message.includes('must be')
  ) {
    return HttpStatus.BAD_REQUEST;
  }

  if (
    message.includes('server error') ||
    message.includes('internal') ||
    message.startsWith('error ')
  ) {
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  return HttpStatus.BAD_REQUEST;
}
