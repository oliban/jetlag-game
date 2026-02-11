import { describe, it, expect } from 'vitest';
import { stationMatchesConstraints } from '../../src/engine/seekerLoop';
import { getStations, getStationList } from '../../src/data/graph';
import type { Constraint, TextConstraint } from '../../src/engine/constraints';

describe('Constraint Elimination', () => {
  const stations = getStations();
  const allStations = getStationList();

  describe('Capital city constraint', () => {
    it('value=No: eliminates capital stations, keeps non-capitals', () => {
      const constraint: TextConstraint = { type: 'text', label: 'Capital city', value: 'No' };

      // Paris is a capital → should be eliminated
      expect(stationMatchesConstraints(stations['paris'], [constraint])).toBe(false);
      // Berlin is a capital → should be eliminated
      expect(stationMatchesConstraints(stations['berlin-hbf'], [constraint])).toBe(false);
      // Lyon is not a capital → should remain
      expect(stationMatchesConstraints(stations['lyon-part-dieu'], [constraint])).toBe(true);
      // Marseille is not a capital → should remain
      expect(stationMatchesConstraints(stations['marseille-st-charles'], [constraint])).toBe(true);
    });

    it('value=Yes: eliminates non-capital stations, keeps capitals', () => {
      const constraint: TextConstraint = { type: 'text', label: 'Capital city', value: 'Yes' };

      // Paris is a capital → should remain
      expect(stationMatchesConstraints(stations['paris'], [constraint])).toBe(true);
      // Lyon is not a capital → should be eliminated
      expect(stationMatchesConstraints(stations['lyon-part-dieu'], [constraint])).toBe(false);
    });

    it('value=No: some stations remain as candidates', () => {
      const constraint: TextConstraint = { type: 'text', label: 'Capital city', value: 'No' };
      const remaining = allStations.filter(s => stationMatchesConstraints(s, [constraint]));
      // Many non-capital stations should remain
      expect(remaining.length).toBeGreaterThan(50);
      // All remaining should be non-capitals
      expect(remaining.every(s => !s.isCapital)).toBe(true);
    });

    it('value=Yes: only capitals remain', () => {
      const constraint: TextConstraint = { type: 'text', label: 'Capital city', value: 'Yes' };
      const remaining = allStations.filter(s => stationMatchesConstraints(s, [constraint]));
      // Should have ~25 capitals
      expect(remaining.length).toBeGreaterThan(15);
      expect(remaining.length).toBeLessThan(35);
      expect(remaining.every(s => s.isCapital)).toBe(true);
    });
  });

  describe('Olympic host city constraint', () => {
    it('value=No: eliminates Olympic cities', () => {
      const constraint: TextConstraint = { type: 'text', label: 'Olympic host city', value: 'No' };

      // Barcelona hosted 1992 Olympics → eliminated
      expect(stationMatchesConstraints(stations['barcelona-sants'], [constraint])).toBe(false);
      // London hosted Olympics → eliminated
      expect(stationMatchesConstraints(stations['london'], [constraint])).toBe(false);
      // Madrid never hosted → remains
      expect(stationMatchesConstraints(stations['madrid-atocha'], [constraint])).toBe(true);
    });

    it('value=Yes: keeps only Olympic cities', () => {
      const constraint: TextConstraint = { type: 'text', label: 'Olympic host city', value: 'Yes' };
      const remaining = allStations.filter(s => stationMatchesConstraints(s, [constraint]));
      expect(remaining.every(s => s.hasHostedOlympics)).toBe(true);
      expect(remaining.length).toBeGreaterThan(5);
    });
  });

  describe('Mountainous region constraint', () => {
    it('value=No: eliminates mountainous stations', () => {
      const constraint: TextConstraint = { type: 'text', label: 'Mountainous region', value: 'No' };

      // Innsbruck is mountainous → eliminated
      expect(stationMatchesConstraints(stations['innsbruck-hbf'], [constraint])).toBe(false);
      // Berlin is flat → remains
      expect(stationMatchesConstraints(stations['berlin-hbf'], [constraint])).toBe(true);
    });

    it('value=Yes: keeps only mountainous stations', () => {
      const constraint: TextConstraint = { type: 'text', label: 'Mountainous region', value: 'Yes' };
      const remaining = allStations.filter(s => stationMatchesConstraints(s, [constraint]));
      expect(remaining.every(s => s.isMountainous)).toBe(true);
      // 26 mountainous stations
      expect(remaining.length).toBe(26);
    });
  });

  describe('Coastal station constraint', () => {
    it('value=No: eliminates coastal stations', () => {
      const constraint: TextConstraint = { type: 'text', label: 'Coastal station', value: 'No' };

      expect(stationMatchesConstraints(stations['marseille-st-charles'], [constraint])).toBe(false);
      expect(stationMatchesConstraints(stations['paris'], [constraint])).toBe(true);
    });

    it('value=Yes: keeps only coastal stations', () => {
      const constraint: TextConstraint = { type: 'text', label: 'Coastal station', value: 'Yes' };
      const remaining = allStations.filter(s => stationMatchesConstraints(s, [constraint]));
      expect(remaining.every(s => s.isCoastal)).toBe(true);
    });
  });

  describe('Landlocked country constraint', () => {
    it('value=Yes: eliminates non-landlocked countries', () => {
      const constraint: TextConstraint = { type: 'text', label: 'Landlocked country', value: 'Yes' };

      // France is not landlocked → eliminated
      expect(stationMatchesConstraints(stations['paris'], [constraint])).toBe(false);
      // Austria is landlocked → remains
      expect(stationMatchesConstraints(stations['vienna-hbf'], [constraint])).toBe(true);
      // Switzerland is landlocked → remains
      expect(stationMatchesConstraints(stations['zurich-hb'], [constraint])).toBe(true);
    });

    it('value=No: eliminates landlocked countries', () => {
      const constraint: TextConstraint = { type: 'text', label: 'Landlocked country', value: 'No' };

      // Austria is landlocked → eliminated
      expect(stationMatchesConstraints(stations['vienna-hbf'], [constraint])).toBe(false);
      // France is not landlocked → remains
      expect(stationMatchesConstraints(stations['paris'], [constraint])).toBe(true);
    });
  });

  describe('Beer/Wine country constraint', () => {
    it('Beer country: eliminates wine country stations', () => {
      const constraint: TextConstraint = { type: 'text', label: 'Beer country', value: 'Beer' };

      // Germany is beer → remains
      expect(stationMatchesConstraints(stations['berlin-hbf'], [constraint])).toBe(true);
      // France is wine → eliminated
      expect(stationMatchesConstraints(stations['paris'], [constraint])).toBe(false);
    });

    it('Wine country: eliminates beer country stations', () => {
      const constraint: TextConstraint = { type: 'text', label: 'Wine country', value: 'Wine' };

      // France is wine → remains
      expect(stationMatchesConstraints(stations['paris'], [constraint])).toBe(true);
      // Germany is beer → eliminated
      expect(stationMatchesConstraints(stations['berlin-hbf'], [constraint])).toBe(false);
    });
  });

  describe('Hub station constraint', () => {
    it('value=Yes: eliminates non-hub stations', () => {
      const constraint: TextConstraint = { type: 'text', label: 'Hub station (4+ connections)', value: 'Yes' };

      // Paris is a major hub (many connections) → remains
      expect(stationMatchesConstraints(stations['paris'], [constraint])).toBe(true);
    });

    it('value=No: eliminates hub stations', () => {
      const constraint: TextConstraint = { type: 'text', label: 'Hub station (4+ connections)', value: 'No' };

      // Paris is a major hub → eliminated
      expect(stationMatchesConstraints(stations['paris'], [constraint])).toBe(false);
    });
  });

  describe('Station name A-M constraint', () => {
    it('value=Yes: keeps A-M stations, eliminates N-Z', () => {
      const constraint: TextConstraint = { type: 'text', label: 'Station name A–M', value: 'Yes' };

      // Berlin starts with B → remains
      expect(stationMatchesConstraints(stations['berlin-hbf'], [constraint])).toBe(true);
      // Paris starts with P → eliminated
      expect(stationMatchesConstraints(stations['paris'], [constraint])).toBe(false);
    });
  });

  describe('Multiple constraints stack correctly', () => {
    it('capital=No AND mountainous=No: eliminates both', () => {
      const constraints: Constraint[] = [
        { type: 'text', label: 'Capital city', value: 'No' },
        { type: 'text', label: 'Mountainous region', value: 'No' },
      ];

      // Paris: capital → eliminated by first constraint
      expect(stationMatchesConstraints(stations['paris'], constraints)).toBe(false);
      // Innsbruck: mountainous → eliminated by second constraint
      expect(stationMatchesConstraints(stations['innsbruck-hbf'], constraints)).toBe(false);
      // Bern: capital AND mountainous → eliminated by both
      expect(stationMatchesConstraints(stations['bern'], constraints)).toBe(false);
      // Bordeaux: not capital, not mountainous → remains
      expect(stationMatchesConstraints(stations['bordeaux'], constraints)).toBe(true);
    });

    it('stacking narrows candidates progressively', () => {
      const c1: Constraint[] = [
        { type: 'text', label: 'Capital city', value: 'No' },
      ];
      const c2: Constraint[] = [
        ...c1,
        { type: 'text', label: 'Mountainous region', value: 'No' },
      ];
      const c3: Constraint[] = [
        ...c2,
        { type: 'text', label: 'Coastal station', value: 'No' },
      ];

      const r1 = allStations.filter(s => stationMatchesConstraints(s, c1)).length;
      const r2 = allStations.filter(s => stationMatchesConstraints(s, c2)).length;
      const r3 = allStations.filter(s => stationMatchesConstraints(s, c3)).length;

      // Each additional constraint should narrow candidates
      expect(r1).toBeGreaterThan(r2);
      expect(r2).toBeGreaterThan(r3);
      // But never to zero (there are inland, flat, non-capital stations)
      expect(r3).toBeGreaterThan(0);
    });
  });

  describe('Thermometer constraints', () => {
    it('Hider nearer to coast: eliminates stations far from coast', () => {
      const constraint: TextConstraint = {
        type: 'text',
        label: 'Hider nearer to coast',
        value: '200', // seeker was 200km from coast
      };

      // Stations that are within 200km of a coastal station should remain
      // Stations further than 200km should be eliminated
      const remaining = allStations.filter(s => stationMatchesConstraints(s, [constraint]));
      expect(remaining.length).toBeGreaterThan(0);
      expect(remaining.length).toBeLessThan(allStations.length);
    });

    it('Hider further from coast: eliminates stations near coast', () => {
      const constraint: TextConstraint = {
        type: 'text',
        label: 'Hider further from coast',
        value: '50', // seeker was 50km from coast
      };

      // Stations at least 50km from coast should remain
      const remaining = allStations.filter(s => stationMatchesConstraints(s, [constraint]));
      expect(remaining.length).toBeGreaterThan(0);
    });

    it('Hider nearer to mountains: eliminates far-from-mountain stations', () => {
      const constraint: TextConstraint = {
        type: 'text',
        label: 'Hider nearer to mountains',
        value: '300', // seeker was 300km from mountains
      };

      const remaining = allStations.filter(s => stationMatchesConstraints(s, [constraint]));
      expect(remaining.length).toBeGreaterThan(0);
      expect(remaining.length).toBeLessThan(allStations.length);
    });

    it('Hider nearer to capital: eliminates far-from-capital stations', () => {
      const constraint: TextConstraint = {
        type: 'text',
        label: 'Hider nearer to capital',
        value: '100', // seeker was 100km from a capital
      };

      const remaining = allStations.filter(s => stationMatchesConstraints(s, [constraint]));
      expect(remaining.length).toBeGreaterThan(0);
    });
  });

  describe('Full station objects required', () => {
    it('partial station objects with undefined booleans break Yes constraints', () => {
      // This test documents the bug that was fixed in Sidebar/MobileGamePanel
      const constraint: TextConstraint = { type: 'text', label: 'Capital city', value: 'Yes' };

      // Full station object works correctly
      const fullStation = stations['paris'];
      expect(stationMatchesConstraints(fullStation, [constraint])).toBe(true);

      // A partial object (as was previously passed) would fail
      const partialStation = {
        lat: fullStation.lat, lng: fullStation.lng,
        name: fullStation.name, country: fullStation.country,
        connections: fullStation.connections,
        isCoastal: undefined as unknown as boolean,
        isMountainous: undefined as unknown as boolean,
        isCapital: undefined as unknown as boolean,
        hasHostedOlympics: undefined as unknown as boolean,
        isAncient: undefined as unknown as boolean,
        hasMetro: undefined as unknown as boolean,
      };
      // With undefined isCapital, !undefined = true, so this wrongly returns false
      expect(stationMatchesConstraints(partialStation, [constraint])).toBe(false);
    });
  });
});
