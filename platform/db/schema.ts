import { sqliteTable, text, real, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
export const users = sqliteTable('users', {
  id: text('id').primaryKey(), email: text('email').notNull().unique(),
  role: text('role', { enum: ['empresa', 'transportista'] }).notNull().default('empresa'),
  name: text('name').notNull(), passwordHash: text('password_hash').notNull(), createdAt: text('created_at').notNull(),
  phone: text('phone'), phoneVerifiedAt: text('phone_verified_at'),
  phoneChannel: text('phone_channel', { enum: ['none', 'whatsapp', 'sms'] }).notNull().default('none'),
  notifyLoads: integer('notify_loads', { mode: 'boolean' }).notNull().default(false),
  notifyDocuments: integer('notify_documents', { mode: 'boolean' }).notNull().default(false),
  phoneConsentAt: text('phone_consent_at')
});
export const sessions = sqliteTable('sessions', {
  tokenHash: text('token_hash').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at').notNull()
}, (t) => [index('sessions_expiry_idx').on(t.expiresAt), index('sessions_user_idx').on(t.userId)]);
export const authLimits = sqliteTable('auth_limits', {
  key: text('key').primaryKey(), attempts: integer('attempts').notNull(), expiresAt: integer('expires_at').notNull()
}, (t) => [index('auth_limits_expiry_idx').on(t.expiresAt)]);
export const carrierProfiles = sqliteTable('carrier_profiles', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind', { enum: ['independiente', 'flota'] }).notNull(),
  legalName: text('legal_name').notNull(), consentAt: text('consent_at').notNull()
});
export const carrierDrivers = sqliteTable('carrier_drivers', {
  id: text('id').primaryKey(), userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(), categories: text('categories').notNull()
});
export const carrierVehicles = sqliteTable('carrier_vehicles', {
  id: text('id').primaryKey(), userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  driverId: text('driver_id').notNull().references(() => carrierDrivers.id, { onDelete: 'restrict' }),
  plate: text('plate').notNull(), description: text('description').notNull(),
  equipment: text('equipment').notNull(), capacityKg: real('capacity_kg').notNull(),
  requiredCategory: text('required_category').notNull()
});
export const carrierDocuments = sqliteTable('carrier_documents', {
  id: text('id').primaryKey(), userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  entityType: text('entity_type', { enum: ['profile', 'driver', 'vehicle'] }).notNull(), entityId: text('entity_id').notNull(),
  type: text('type').notNull(), objectKey: text('object_key'), mime: text('mime'), size: integer('size'),
  issuedAt: text('issued_at'), expiresAt: text('expires_at'), noExpiry: integer('no_expiry', { mode: 'boolean' }).notNull().default(false),
  exemption: text('exemption'), status: text('status', { enum: ['pending', 'approved', 'rejected'] }).notNull().default('pending'),
  revision: text('revision').notNull(), uploadedAt: text('uploaded_at').notNull(),
  reviewedAt: text('reviewed_at'), reviewedBy: text('reviewed_by'), reviewNote: text('review_note'),
  ocrStatus: text('ocr_status').notNull().default('not_started'), ocrRevision: text('ocr_revision'),
  ocrOperationId: text('ocr_operation_id'), ocrSummary: text('ocr_summary'), ocrUpdatedAt: text('ocr_updated_at')
}, t => [index('carrier_documents_user_idx').on(t.userId), uniqueIndex('carrier_documents_slot_idx').on(t.userId, t.entityType, t.entityId, t.type)]);
export const carrierNoticeReads = sqliteTable('carrier_notice_reads', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  documentId: text('document_id').notNull().references(() => carrierDocuments.id, { onDelete: 'cascade' }),
  readAt: text('read_at').notNull()
}, t => [index('carrier_notice_reads_user_idx').on(t.userId)]);
export const phoneDeliveries = sqliteTable('phone_deliveries', {
  id: text('id').primaryKey(), userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  eventType: text('event_type').notNull(), eventId: text('event_id').notNull(), channel: text('channel').notNull(),
  phone: text('phone').notNull(), state: text('state').notNull().default('pending'),
  providerId: text('provider_id'), createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull()
}, t => [index('phone_deliveries_state_idx').on(t.state)]);
export const loadNoticeReads = sqliteTable('load_notice_reads', {
  id: text('id').primaryKey(), userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  loadId: text('load_id').notNull().references(() => loads.id, { onDelete: 'cascade' }), readAt: text('read_at').notNull()
}, t => [index('load_notice_reads_user_idx').on(t.userId)]);
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
  transportVehicleId: text('transport_vehicle_id').references(() => carrierVehicles.id, { onDelete: 'restrict' }),
  transportDriverId: text('transport_driver_id').references(() => carrierDrivers.id, { onDelete: 'restrict' }),
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
