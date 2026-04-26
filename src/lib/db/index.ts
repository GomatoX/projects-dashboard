import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from './schema';
import * as authSchema from './auth-schema';

const client = createClient({
  url: 'file:./data/dashboard.db',
});

export const db = drizzle(client, { schema: { ...schema, ...authSchema } });
