export type DummyPotholeLocation = {
  id: string;
  lat: number;
  lng: number;
  reportCount: number; // number of users
};

export const dummyPotholeData: DummyPotholeLocation[] = [
  {
    id: "loc-1",
    lat: 28.6139,   // Delhi
    lng: 77.2090,
    reportCount: 3, // LOW → green
  },
  {
    id: "loc-2",
    lat: 28.6145,
    lng: 77.2102,
    reportCount: 7, // MEDIUM → orange
  },
  {
    id: "loc-3",
    lat: 28.6152,
    lng: 77.2115,
    reportCount: 15, // HIGH → red
  },
];
