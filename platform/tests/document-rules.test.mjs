import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateDocument, documentDateError, dayInNicaragua, addYears, reminderStage, vehicleCategoryError } from '../lib/document-rules.ts';
const current = { type: 'license', status: 'pending', objectKey: 'private-test-key', size: 100, issuedAt: '2026-01-01', expiresAt: '2031-01-01', noExpiry: false };
test('document dates use Nicaragua midnight, leap years and expiry-day boundaries', () => {
  assert.equal(dayInNicaragua(new Date('2026-11-15T05:59:59Z')), '2026-11-14');
  assert.equal(dayInNicaragua(new Date('2026-11-15T06:00:00Z')), '2026-11-15');
  assert.equal(addYears('2024-02-29', 5), '2029-02-28');
  assert.equal(documentDateError('license','2026-01-01','2031-01-02',false,'2026-11-14')?.includes('cinco años'),true);
  assert.equal(documentDateError('emissions','2026-01-01','2027-01-02',false,'2026-11-14')?.includes('un año'),true);
  assert.equal(documentDateError('license','2026-01-01','2026-02-30',false,'2026-11-14') !== null,true);
  assert.equal(evaluateDocument(current,'2031-01-01').valid,true);
  assert.equal(evaluateDocument(current,'2031-01-02').valid,false);
  assert.equal(evaluateDocument({...current, issuedAt:'2027-01-01'},'2026-11-14').state,'invalid');
  assert.equal(evaluateDocument({...current, noExpiry:true},'2026-11-14').valid,false);
  assert.equal(evaluateDocument({...current, objectKey:null},'2026-11-14').valid,false);
  assert.equal(evaluateDocument({...current, status:'rejected'},'2026-11-14').valid,false);
});
test('warning levels advance without relying on exact-day visits', () => {
  for(const [days,stage] of [[31,null],[30,'30'],[16,'30'],[15,'15'],[8,'15'],[7,'7'],[2,'7'],[1,'1'],[0,'today'],[-1,'expired']]) assert.equal(reminderStage(days),stage);
  assert.equal(reminderStage(null),null);
});
test('category checks reject mismatches without assuming category inheritance', () => {
  assert.equal(vehicleCategoryError('4A',['4A'],8000,'Refrigerado'),null);
  assert(vehicleCategoryError('4A',['4A'],8001,'Refrigerado'));
  assert(vehicleCategoryError('3',['3'],3501,'Refrigerado'));
  assert(vehicleCategoryError('4A',['4A'],5000,'Cabezal'));
  assert(vehicleCategoryError('4A',['7'],5000,'Refrigerado'));
  assert.equal(vehicleCategoryError('7',['7'],25000,'Cabezal'),null);
});
