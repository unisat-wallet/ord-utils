import { UnspentOutput } from "./OrdTransaction";
import { OrdUnspendOutput } from "./OrdUnspendOutput";

/**
 * Get non-ord balance for spending
 * @param utxos
 * @returns
 */
export function getNonOrdBalance(utxos: UnspentOutput[]) {
  return utxos
    .map((v) => new OrdUnspendOutput(v))
    .reduce((pre, cur) => pre + cur.getNonOrdSatoshis(), 0);
}
