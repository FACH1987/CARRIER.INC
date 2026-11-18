import { sqliteTable, text, real, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
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
export const subscriptionPayments = sqliteTable('subscription_payments', {
  reference: text('reference').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  plan: text('plan', { enum: ['negocio', 'corporativo', 'chofer-pro', 'elite'] }).notNull(),
  amountCents: integer('amount_cents').notNull(),
  createdAt: text('created_at').notNull(),
  verifiedAt: text('verified_at'),
  verifiedBy: text('verified_by').references(() => users.id),
  bankReference: text('bank_reference').unique(),
  startsAt: text('starts_at'),
  endsAt: text('ends_at'),
}, (t) => [
  uniqueIndex('subscription_one_pending').on(t.userId).where(sql`${t.verifiedAt} IS NULL`),
  index('subscription_user_period').on(t.userId, t.endsAt),
]);
export const bankAccounts = sqliteTable('bank_accounts', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  bankName: text('bank_name').notNull(), holderName: text('holder_name').notNull(),
  accountType: text('account_type', { enum: ['ahorro', 'corriente'] }).notNull(),
  currency: text('currency', { enum: ['NIO', 'USD'] }).notNull(),
  encryptedNumber: text('encrypted_number').notNull(), lastFour: text('last_four').notNull(),
  consentAt: text('consent_at').notNull(), shareForDirectTransfer: integer('share_for_direct_transfer', { mode: 'boolean' }).notNull().default(false),
  updatedAt: text('updated_at').notNull()
});
export const loadPublications = sqliteTable('load_publications', {
  loadId: text('load_id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  createdAt: text('created_at').notNull(),
}, (t) => [index('load_publications_owner_date').on(t.ownerId, t.createdAt)]);
export const authLimits = sqliteTable('auth_limits', {
  key: text('key').primaryKey(), attempts: integer('attempts').notNull(), expiresAt: integer('expires_at').notNull()
}, (t) => [index('auth_limits_expiry_idx').on(t.expiresAt)]);
export const carrierProfiles = sqliteTable('carrier_profiles', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind', { enum: ['independiente', 'flota'] }).notNull(),
  legalName: text('legal_name').notNull(), consentAt: text('consent_at').notNull()
});
export const loadQuotes = sqliteTable('load_quotes', {
  id: text('id').primaryKey(),
  loadId: text('load_id').notNull(),
  carrierId: text('carrier_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  amountCents: integer('amount_cents').notNull(),
  createdAt: text('created_at').notNull(),
  priority: integer('priority').notNull(),
}, (t) => [uniqueIndex('load_quotes_carrier_load').on(t.carrierId, t.loadId), index('load_quotes_carrier_date').on(t.carrierId, t.createdAt)]);
export const carrierRatings = sqliteTable('carrier_ratings', {
  loadId: text('load_id').primaryKey().references(() => loads.id),
  carrierId: text('carrier_id').notNull().references(() => users.id),
  score: integer('score').notNull(),
  createdAt: text('created_at').notNull(),
}, (t) => [index('carrier_ratings_carrier').on(t.carrierId)]);
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
  currency: text('currency', { enum: ['NIO', 'USD'] }).notNull().default('NIO'),
  company: text('company').notNull(), email: text('email').notNull(),
  customerType: text('customer_type', { enum: ['particular', 'comercio', 'empresa'] }),
  visibility: text('visibility', { enum: ['estandar', 'destacada', 'vip'] }).notNull().default('estandar'),
  pickupLatitude: real('pickup_latitude'), pickupLongitude: real('pickup_longitude'),
  corporateExtras: integer('corporate_extras', { mode: 'boolean' }).notNull().default(false),
  deliverySigner: text('delivery_signer'),
  createdAt: text('created_at').notNull(),
  status: text('status', { enum: ['disponible', 'asignada', 'en_transito', 'entregada', 'finalizada'] }).notNull().default('disponible'),
  carrierId: text('carrier_id').references(() => users.id, { onDelete: 'restrict' }),
  transportVehicleId: text('transport_vehicle_id').references(() => carrierVehicles.id, { onDelete: 'restrict' }),
  transportDriverId: text('transport_driver_id').references(() => carrierDrivers.id, { onDelete: 'restrict' }),
  assignedAt: text('assigned_at'), acceptedAt: text('accepted_at'), deliveredAt: text('delivered_at'), deliveryEvidenceId: text('delivery_evidence_id'), completedAt: text('completed_at'),
  feeRateBps: integer('fee_rate_bps').notNull().default(0),
  feeCents: integer('fee_cents').notNull().default(0),
  feeAcceptedAt: text('fee_accepted_at')
}, (t) => [index('loads_pickup_date_idx').on(t.pickupDate), index('loads_owner_created_idx').on(t.ownerId, t.createdAt)]);
export const loadPositions = sqliteTable('load_positions', {
  loadId: text('load_id').primaryKey().references(() => loads.id, { onDelete: 'cascade' }),
  latitude: real('latitude').notNull(), longitude: real('longitude').notNull(),
  updatedAt: text('updated_at').notNull(),
});
export const loadMessages = sqliteTable('load_messages', {
  id: text('id').primaryKey(),
  loadId: text('load_id').notNull().references(() => loads.id, { onDelete: 'cascade' }),
  carrierId: text('carrier_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  fromCarrier: integer('from_carrier', { mode: 'boolean' }).notNull(),
  body: text('body').notNull(),
  createdAt: text('created_at').notNull(),
}, (t) => [index('load_messages_thread_date').on(t.loadId, t.carrierId, t.createdAt)]);
export const supportMessages = sqliteTable('support_messages', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  fromSupport: integer('from_support', { mode: 'boolean' }).notNull().default(false),
  body: text('body').notNull(),
  kind: text('kind', { enum: ['message', 'app_issue'] }).notNull().default('message'),
  createdAt: text('created_at').notNull(),
  priority: integer('priority').notNull().default(0),
}, (t) => [index('support_messages_user_date').on(t.userId, t.createdAt)]);

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
