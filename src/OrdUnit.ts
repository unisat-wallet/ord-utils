export class OrdUnit {
  satoshis: number;
  ords: {
    id: string;
    outputOffset: number;
    unitOffset: number;
  }[];
  constructor(
    satoshis: number,
    ords: {
      id: string;
      outputOffset: number;
      unitOffset: number;
    }[]
  ) {
    this.satoshis = satoshis;
    this.ords = ords;
  }

  hasOrd() {
    return this.ords.length > 0;
  }
}
