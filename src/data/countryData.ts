export interface CountryInfo {
  landlocked: boolean;
  areaOver200k: boolean;       // > 200,000 km²
  beerOrWine: 'beer' | 'wine';
  hasF1Circuit: boolean;
}

export const COUNTRY_DATA: Record<string, CountryInfo> = {
  'France':         { landlocked: false, areaOver200k: true,  beerOrWine: 'wine', hasF1Circuit: true  },
  'Germany':        { landlocked: false, areaOver200k: true,  beerOrWine: 'beer', hasF1Circuit: false },
  'United Kingdom': { landlocked: false, areaOver200k: true,  beerOrWine: 'beer', hasF1Circuit: true  },
  'Italy':          { landlocked: false, areaOver200k: true,  beerOrWine: 'wine', hasF1Circuit: true  },
  'Spain':          { landlocked: false, areaOver200k: true,  beerOrWine: 'wine', hasF1Circuit: true  },
  'Netherlands':    { landlocked: false, areaOver200k: false, beerOrWine: 'beer', hasF1Circuit: true  },
  'Belgium':        { landlocked: false, areaOver200k: false, beerOrWine: 'beer', hasF1Circuit: true  },
  'Switzerland':    { landlocked: true,  areaOver200k: false, beerOrWine: 'wine', hasF1Circuit: false },
  'Austria':        { landlocked: true,  areaOver200k: false, beerOrWine: 'beer', hasF1Circuit: true  },
  'Poland':         { landlocked: false, areaOver200k: true,  beerOrWine: 'beer', hasF1Circuit: false },
  'Czech Republic': { landlocked: true,  areaOver200k: false, beerOrWine: 'beer', hasF1Circuit: false },
  'Hungary':        { landlocked: true,  areaOver200k: false, beerOrWine: 'wine', hasF1Circuit: true  },
  'Portugal':       { landlocked: false, areaOver200k: false, beerOrWine: 'wine', hasF1Circuit: false },
  'Sweden':         { landlocked: false, areaOver200k: true,  beerOrWine: 'beer', hasF1Circuit: false },
  'Norway':         { landlocked: false, areaOver200k: true,  beerOrWine: 'beer', hasF1Circuit: false },
  'Denmark':        { landlocked: false, areaOver200k: false, beerOrWine: 'beer', hasF1Circuit: false },
  'Romania':        { landlocked: false, areaOver200k: true,  beerOrWine: 'wine', hasF1Circuit: false },
  'Bulgaria':       { landlocked: false, areaOver200k: false, beerOrWine: 'wine', hasF1Circuit: false },
  'Greece':         { landlocked: false, areaOver200k: false, beerOrWine: 'wine', hasF1Circuit: false },
  'Croatia':        { landlocked: false, areaOver200k: false, beerOrWine: 'wine', hasF1Circuit: false },
  'Serbia':         { landlocked: true,  areaOver200k: false, beerOrWine: 'beer', hasF1Circuit: false },
  'Slovenia':       { landlocked: false, areaOver200k: false, beerOrWine: 'wine', hasF1Circuit: false },
  'Slovakia':       { landlocked: true,  areaOver200k: false, beerOrWine: 'beer', hasF1Circuit: false },
  'North Macedonia':{ landlocked: true,  areaOver200k: false, beerOrWine: 'wine', hasF1Circuit: false },
  'Luxembourg':     { landlocked: true,  areaOver200k: false, beerOrWine: 'beer', hasF1Circuit: false },
};
