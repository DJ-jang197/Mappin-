export interface Coordinates {
  lat: number;
  lng: number;
}

export interface Destination {
  coords: Coordinates;
  label: string;
  setAt: number;
}

export interface AlarmState {
  destination: Destination | null;
  isActive: boolean;
  hasArrived: boolean;
  radiusMetres: number;
}

export interface AlarmHistoryEntry {
  destination: Destination;
  arrivedAt: number;
}

export type ExtensionMessage =
  | { type: "SET_DESTINATION"; payload: Destination }
  | { type: "CLEAR_ALARM" }
  | { type: "ARRIVED"; payload: { arrivedAt: number } }
  | { type: "ACK_ARRIVAL_COMPLETE" }
  | { type: "GET_STATE" }
  | { type: "SET_RADIUS"; payload: { radiusMetres: number } };
