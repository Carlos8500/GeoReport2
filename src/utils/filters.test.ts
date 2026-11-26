import test from 'node:test';
import assert from 'node:assert/strict';
import { isAlertActive, isInPeriod, listZones, periodRange, pickFeaturedAlert } from './filters';
import { HealthAlert, IncidentReport } from '../types/rabiaCun';

const TODAY = new Date(2026, 10, 24); // 24 nov 2026 (hora local)

test('periodRange calcula el inicio de los periodos predefinidos', () => {
  assert.deepEqual(periodRange({ preset: '7d' }, TODAY), { from: '2026-11-18', to: null });
  assert.deepEqual(periodRange({ preset: '30d' }, TODAY), { from: '2026-10-26', to: null });
  assert.deepEqual(periodRange({ preset: 'all' }, TODAY), { from: null, to: null });
  assert.deepEqual(periodRange({ preset: 'custom', from: '2026-11-01', to: '2026-11-03' }, TODAY), {
    from: '2026-11-01',
    to: '2026-11-03',
  });
});

test('isInPeriod incluye los extremos del rango', () => {
  const range = { preset: 'custom' as const, from: '2026-11-01', to: '2026-11-03' };
  assert.equal(isInPeriod('2026-11-01 00:10', range, TODAY), true);
  assert.equal(isInPeriod('2026-11-03 23:59', range, TODAY), true);
  assert.equal(isInPeriod('2026-11-04 08:00', range, TODAY), false);
  assert.equal(isInPeriod('2026-10-31 23:00', range, TODAY), false);
  assert.equal(isInPeriod('2026-11-18 09:00', { preset: '7d' }, TODAY), true);
  assert.equal(isInPeriod('2026-11-17 09:00', { preset: '7d' }, TODAY), false);
});

test('listZones devuelve zonas únicas ordenadas', () => {
  const zones = listZones([
    { supermanzana: 'SM 51' },
    { supermanzana: 'Centro (SM 1–30)' },
    { supermanzana: 'SM 51' },
  ] as IncidentReport[]);
  assert.deepEqual(zones, ['Centro (SM 1–30)', 'SM 51']);
});

test('pickFeaturedAlert prefiere la alerta vigente más grave', () => {
  const base = { title: '', issuedAt: '', validUntil: '', zone: '', source: '', sourceUrl: '', summary: '', recommendations: [] };
  const alerts: HealthAlert[] = [
    { ...base, id: '1', folio: 'A', severity: 'preventiva', issuedDate: '2026-11-01', validUntilDate: '2026-11-30' },
    { ...base, id: '2', folio: 'B', severity: 'alta', issuedDate: '2026-10-12', validUntilDate: '2026-12-31' },
    { ...base, id: '3', folio: 'C', severity: 'alta', issuedDate: '2026-09-01', validUntilDate: '2026-09-30' },
  ];
  assert.equal(isAlertActive(alerts[2], TODAY), false);
  assert.equal(pickFeaturedAlert(alerts, TODAY)?.folio, 'B');
  assert.equal(pickFeaturedAlert([alerts[2]], TODAY), null);
});
