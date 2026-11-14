import { sqliteTable, text, real, integer, index } from 'drizzle-orm/sqlite-core';
export const users = sqliteTable('users', {
  id: text('id').primaryKey(), email: text('email').notNull().unique(),
  role: text('role', { enum: ['empresa', 'transportista'] }).notNull().default('empresa'),
  name: text('name').notNull(), passwordHash: text('password_hash').notNull(), createdAt: text('created_at').notNull()
});
export const sessions = sqliteTable('sessions', {
  tokenHash: text('token_hash').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at').notNull()
}, (t) => [index('sessions_expiry_idx').on(t.expiresAt), index('sessions_user_idx').on(t.userId)]);
export const authLimits = sqliteTable('auth_limits', {
  key: text('key').primaryKey(), attempts: integer('attempts').notNull(), expiresAt: integer('expires_at').notNull()
}, (t) => [index('auth_limits_expiry_idx').on(t.expiresAt)]);
export const loads = sqliteTable('loads', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  origin: text('origin').notNull(), destination: text('destination').notNull(),
  pickupDate: text('pickup_date').notNull(), equipment: text('equipment').notNull(),
  weight: real('weight').notNull(), pay: real('pay').notNull(),
  company: text('company').notNull(), email: text('email').notNull(),
  createdAt: text('created_at').notNull(),
  status: text('status', { enum: ['disponible', 'asignada', 'en_transito', 'entregada', 'finalizada'] }).notNull().default('disponible'),
  carrierId: text('carrier_id').references(() => users.id, { onDelete: 'restrict' }),
  assignedAt: text('assigned_at'), acceptedAt: text('accepted_at'), deliveredAt: text('delivered_at'), completedAt: text('completed_at'),
  feeRateBps: integer('fee_rate_bps').notNull().default(0),
  feeCents: integer('fee_cents').notNull().default(0),
  feeAcceptedAt: text('fee_accepted_at')
}, (t) => [index('loads_pickup_date_idx').on(t.pickupDate), index('loads_owner_created_idx').on(t.ownerId, t.createdAt)]);

export const commissions = sqliteTable('commissions', {
  id: text('id').primaryKey(),
  loadId: text('load_id').notNull().unique().references(() => loads.id, { onDelete: 'restrict' }),
  payerId: text('payer_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  carrierId: text('carrier_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  fareCents: integer('fare_cents').notNull(), rateBps: integer('rate_bps').notNull(), amountCents: integer('amount_cents').notNull(),
  status: text('status', { enum: ['pending', 'paid'] }).notNull().default('pending'),
  createdAt: text('created_at').notNull(), paidAt: text('paid_at'), paymentReference: text('payment_reference'),
  recordedBy: text('recorded_by').references(() => users.id, { onDelete: 'restrict' })
}, (t) => [index('commissions_status_idx').on(t.status), index('commissions_payer_idx').on(t.payerId)]);
