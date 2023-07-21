import { UnspentOutput } from "./OrdTransaction";
import { OrdUnit } from "./OrdUnit";

export const UTXO_DUST = 546;

export class OrdUnspendOutput {
  ordUnits: OrdUnit[];
  utxo: UnspentOutput;
  constructor(utxo: UnspentOutput, outputValue?: number) {
    this.utxo = utxo;
    this.split(utxo.satoshis, utxo.ords, outputValue);
  }

  private split(
    satoshis: number,
    ords: { id: string; offset: number }[],
    splitOutputValue = UTXO_DUST
  ) {
    const ordUnits: OrdUnit[] = [];
    let leftAmount = satoshis;
    for (let i = 0; i < ords.length; i++) {
      const id = ords[i].id;
      const offset = ords[i].offset;

      let splitAmount = offset - (satoshis - leftAmount);
      const a = leftAmount - splitAmount;
      if (a < splitOutputValue) {
        splitAmount -= splitOutputValue;
      }

      if (splitAmount < 0) {
        if (ordUnits.length == 0) {
          ordUnits.push(
            new OrdUnit(leftAmount, [
              {
                id: id,
                outputOffset: offset,
                unitOffset: 0,
              },
            ])
          );
          leftAmount = 0;
        } else {
          // sequnce?
          ordUnits[ordUnits.length - 1].ords.push({
            id,
            outputOffset: offset,
            unitOffset: ordUnits[ordUnits.length - 1].satoshis,
          });
        }
        continue;
      }

      if (leftAmount > splitAmount) {
        if (splitAmount > splitOutputValue) {
          ordUnits.push(new OrdUnit(splitAmount, []));
          ordUnits.push(
            new OrdUnit(splitOutputValue, [
              {
                id,
                outputOffset: offset,
                unitOffset: 0,
              },
            ])
          );
        } else {
          ordUnits.push(
            new OrdUnit(splitOutputValue + splitAmount, [
              { id, outputOffset: offset, unitOffset: 0 },
            ])
          );
        }
      }

      leftAmount -= splitAmount + splitOutputValue;
    }

    if (leftAmount > UTXO_DUST) {
      ordUnits.push(new OrdUnit(leftAmount, []));
    } else if (leftAmount > 0) {
      if (ordUnits.length > 0) {
        ordUnits[ordUnits.length - 1].satoshis += leftAmount;
      } else {
        ordUnits.push(new OrdUnit(leftAmount, []));
      }
    }

    this.ordUnits = ordUnits;
  }

  /**
   * Get non-Ord satoshis for spending
   */
  getNonOrdSatoshis() {
    return this.ordUnits
      .filter((v) => v.ords.length == 0)
      .reduce((pre, cur) => pre + cur.satoshis, 0);
  }

  /**
   * Get last non-ord satoshis for spending.
   * Only the last one is available
   * @returns
   */
  getLastUnitSatoshis() {
    const last = this.ordUnits[this.ordUnits.length - 1];
    if (last.ords.length == 0) {
      return last.satoshis;
    }
    return 0;
  }

  hasOrd() {
    return this.utxo.ords.length > 0;
  }

  dump() {
    this.ordUnits.forEach((v) => {
      console.log("satoshis:", v.satoshis, "ords:", v.ords);
    });
  }
}
