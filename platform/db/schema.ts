import { sqliteTable, text, real, index } from 'drizzle-orm/sqlite-core';
export const loads = sqliteTable('loads', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  origin: text('origin').notNull(), destination: text('destination').notNull(),
  pickupDate: text('pickup_date').notNull(), equipment: text('equipment').notNull(),
  weight: real('weight').notNull(), pay: real('pay').notNull(),
  company: text('company').notNull(), email: text('email').notNull(),
  createdAt: text('created_at').notNull()
}, (t) => [index('loads_pickup_date_idx').on(t.pickupDate), index('loads_owner_created_idx').on(t.ownerId, t.createdAt)]);
