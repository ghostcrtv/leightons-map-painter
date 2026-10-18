import { describe, expect, it } from 'vitest';
import { copyName, metaOf, migrateWorld, newWorld, parseBackup, toBackupFile, yearOf, WORLD_FORMAT_VERSION } from '../src/worlds/model';

describe('saved worlds', () => {
  it('turns the old single autosave into "My World" without losing anything', () => {
    const old = { formatVersion: 1, actions: [{ kind: 'paint', owner: 'DE', circles: [1, 2, 3] }] };
    const w = migrateWorld(old)!;
    expect(w.name).toBe('My World');
    expect(w.formatVersion).toBe(WORLD_FORMAT_VERSION);
    expect(w.territory.actions).toEqual(old.actions);
  });

  it('round-trips through a backup file, giving imported worlds new ids', () => {
    const a = newWorld('Leighton’s World');
    a.territory.actions.push({ kind: 'resetWorld' }, { kind: 'year' } as never, { kind: 'year' } as never);
    a.names = { DE: { name: 'Leightonland' } };
    a.customs = [{ id: 'custom-1', name: 'Dino Island', flag: { layout: 'v', colors: ['#00ff00', '#ffffff'], symbol: '🦖' } }];
    const { worlds, error } = parseBackup(toBackupFile([a]));
    expect(error).toBeUndefined();
    expect(worlds).toHaveLength(1);
    expect(worlds[0].id).not.toBe(a.id);
    expect(worlds[0].name).toBe('Leighton’s World');
    expect(worlds[0].names.DE.name).toBe('Leightonland');
    expect(worlds[0].customs[0].flag.symbol).toBe('🦖');
    expect(metaOf(worlds[0]).year).toBe(2);
  });

  it('rejects files that are not worlds, and cleans bad data', () => {
    expect(parseBackup('not json').error).toMatch(/can’t be read/);
    expect(parseBackup('{"hello": 1}').error).toMatch(/No worlds/);
    const w = migrateWorld({ territory: { actions: [] }, name: '  x'.repeat(30), customs: [{ id: 'evil', name: 'x' }, { id: 'custom-2', flag: { colors: ['red', '#123456'] } }] })!;
    expect(w.name.length).toBeLessThanOrEqual(40);
    expect(w.customs.map((c) => c.id)).toEqual(['custom-2']);
    expect(w.customs[0].flag.colors).toEqual(['#123456']);
  });

  it('counts years since the last reset and names copies', () => {
    expect(yearOf({ formatVersion: 1, actions: [{ kind: 'year' }, { kind: 'resetWorld' }, { kind: 'year' }] as never })).toBe(1);
    expect(copyName('Earth', ['Copy of Earth'])).toBe('Copy of Earth 2');
  });
});
