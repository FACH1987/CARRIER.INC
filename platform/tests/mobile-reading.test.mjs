import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone } from '../lib/phone.ts';
import { readDocumentText } from '../lib/document-reading.ts';
test('phone normalization accepts Nicaragua numbers without treating them as verified', () => {
  assert.equal(normalizePhone('8888-0000'), '+50588880000');
  assert.equal(normalizePhone('+505 (8888) 0000'), '+50588880000');
  for(const value of ['+150588880000','123','+505888800000','8<script>']) assert.equal(normalizePhone(value),null);
});
test('OCR comparison reports matches, ambiguities and mismatched dates without authenticity claims', () => {
  const expected={ type:'license',issuedAt:'2026-11-14',expiresAt:'2031-11-14',noExpiry:false,name:'Juan Perez',categories:['4A','7'] };
  const read=readDocumentText('JUAN PÉREZ\nEmisión: 14/11/2026\nVencimiento\n14/11/2031\nCategorías\n4A, 7', expected);
  assert.equal(read.state,'matches');
  assert.equal(read.scope.includes('No confirma autenticidad'),true);
  assert.equal(readDocumentText('Juan Perez\nEmision 14/11/2026\nVencimiento 14/11/2030\nCategorias 4A,7',expected).state,'inconsistent');
  assert.equal(readDocumentText('FECHA SIN ETIQUETA 14/11/2031',expected).state,'inconclusive');
  assert.equal(readDocumentText('Emision: 14/11/2026\nVence: 14/11/2031\nVence: 15/11/2031',expected).state,'inconclusive');
  const vehicle=readDocumentText('PLACA M-12345\nEmision 14/11/2026\nVence 14/11/2027',{type:'vehicle_insurance',issuedAt:'2026-11-14',expiresAt:'2027-11-14',noExpiry:false,plate:'M12345'});
  assert.equal(vehicle.state,'matches');
});
