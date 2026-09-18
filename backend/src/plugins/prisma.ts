import { PrismaClient } from '@prisma/client';
import { config } from '../config/env.js';

let prisma: PrismaClient;

declare global {
  // eslint-disable-next-line no-var
  var __prismaClient: PrismaClient | undefined;
}

if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient();
} else {
  if (!global.__prismaClient) {
    global.__prismaClient = new PrismaClient({
      log: ['warn', 'error'],
    });
  }
  prisma = global.__prismaClient;
}

export { prisma };
