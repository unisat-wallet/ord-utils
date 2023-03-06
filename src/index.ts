import { OrdTransaction, UnspentOutput } from "./OrdTransaction";
import { OrdUnspendOutput, UTXO_DUST } from "./OrdUnspendOutput";

export function createSendBTC({
  utxos,
  toAddress,
  toAmount,
  wallet,
  network,
  changeAddress,
}: {
  utxos: UnspentOutput[];
  toAddress: string;
  toAmount: number;
  wallet: any;
  network: any;
  changeAddress: string;
}) {
  const tx = new OrdTransaction(wallet, network);
  tx.setChangeAddress(changeAddress);
  const ordUtxos = utxos
    .map((v) => new OrdUnspendOutput(v))
    .sort((a, b) => a.getLastUnitSatoshis() - b.getLastUnitSatoshis());

  let needAmount = toAmount;
  for (let i = 0; i < ordUtxos.length; i++) {
    const ordUtxo = ordUtxos[i];
    let used = false;
    for (let j = 0; j < ordUtxo.ordUnits.length; j++) {
      const unit = ordUtxo.ordUnits[j];
      if (unit.hasOrd()) {
        tx.addChangeOutput(unit.satoshis);
        continue;
      }
      if (needAmount > unit.satoshis + UTXO_DUST) {
        tx.addOutput(toAddress, unit.satoshis);
        needAmount -= unit.satoshis;
        used = true;
        continue;
      }

      if (needAmount >= UTXO_DUST && unit.satoshis >= needAmount + UTXO_DUST) {
        tx.addOutput(toAddress, needAmount);
        tx.addChangeOutput(unit.satoshis - needAmount);
        needAmount = 0;
        used = true;
        continue;
      }

      // otherwise
      tx.addChangeOutput(unit.satoshis);
    }
    if (used) {
      tx.addInput(ordUtxo.utxo);
    }

    if (needAmount == 0) break;
  }

  return tx.createSignedPsbt();
}

export function createSendOrd({
  utxos,
  toAddress,
  toOrdId,
  wallet,
  network,
  changeAddress,
}: {
  utxos: UnspentOutput[];
  toAddress: string;
  toOrdId: string;
  wallet: any;
  network: any;
  changeAddress: string;
}) {
  const tx = new OrdTransaction(wallet, network);
  tx.setChangeAddress(changeAddress);
  const ordUtxos = utxos
    .map((v) => new OrdUnspendOutput(v))
    .sort((a, b) => a.getLastUnitSatoshis() - b.getLastUnitSatoshis());

  let found = false;
  for (let i = 0; i < ordUtxos.length; i++) {
    const ordUtxo = ordUtxos[i];
    for (let j = 0; j < ordUtxo.ordUnits.length; j++) {
      const unit = ordUtxo.ordUnits[j];
      if (unit.ords.find((v) => v.id == toOrdId)) {
        tx.addOutput(toAddress, unit.satoshis);
        found = true;
        continue;
      } else {
        tx.addChangeOutput(unit.satoshis);
      }
    }
    if (found) {
      tx.addInput(ordUtxo.utxo);
    }
    if (found) break;
  }

  // add safeUtxo to change
  ordUtxos.forEach((ordUtxo) => {
    if (!ordUtxo.hasOrd()) {
      tx.addInput(ordUtxo.utxo);
      tx.addChangeOutput(ordUtxo.satoshis);
    }
  });

  const changeAmount = tx.getChangeAmount();

  return tx.createSignedPsbt();
}
