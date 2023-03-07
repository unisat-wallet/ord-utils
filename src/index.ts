import { OrdTransaction, UnspentOutput } from "./OrdTransaction";
import { OrdUnspendOutput, UTXO_DUST } from "./OrdUnspendOutput";

export async function createSendBTC({
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

  let needAmount = toAmount;

  const nonOrdUtxos: OrdUnspendOutput[] = [];
  const ordUtxos: OrdUnspendOutput[] = [];
  utxos.forEach((v) => {
    const ordUtxo = new OrdUnspendOutput(v);
    if (v.ords.length > 0) {
      ordUtxos.push(ordUtxo);
    } else {
      nonOrdUtxos.push(ordUtxo);
    }
  });

  ordUtxos.sort((a, b) => a.getLastUnitSatoshis() - b.getLastUnitSatoshis());

  for (let i = 0; i < ordUtxos.length; i++) {
    const ordUtxo = ordUtxos[i];
    if (ordUtxo.hasOrd()) {
      let used = false;
      let tmpOutputCounts = 0;
      for (let j = 0; j < ordUtxo.ordUnits.length; j++) {
        const unit = ordUtxo.ordUnits[j];
        if (unit.hasOrd()) {
          tx.addChangeOutput(unit.satoshis);
          tmpOutputCounts++;
          continue;
        }
        if (needAmount > unit.satoshis + UTXO_DUST) {
          tx.addOutput(toAddress, unit.satoshis);
          needAmount -= unit.satoshis;
          used = true;
          continue;
        }

        if (
          needAmount >= UTXO_DUST &&
          unit.satoshis >= needAmount + UTXO_DUST
        ) {
          tx.addOutput(toAddress, needAmount);
          tx.addChangeOutput(unit.satoshis - needAmount);
          needAmount = 0;
          used = true;
          continue;
        }

        // otherwise
        tx.addChangeOutput(unit.satoshis);
        tmpOutputCounts++;
      }
      if (used) {
        tx.addInput(ordUtxo.utxo);
      } else {
        if (tmpOutputCounts > 0) {
          tx.removeRecentOutputs(tmpOutputCounts);
        }
      }
    }
    if (needAmount == 0) break;
  }

  nonOrdUtxos.forEach((v) => {
    tx.addInput(v.utxo);
  });

  let lastOutput = tx.outputs[tx.outputs.length - 1];
  if (lastOutput) {
    if (lastOutput.address === tx.changedAddress) {
      tx.addOutput(toAddress, needAmount);
    } else {
      lastOutput.value += needAmount;
    }
  } else {
    tx.addOutput(toAddress, needAmount);
  }
  const unspent = tx.getUnspent();
  if (unspent < 0) {
    throw new Error("Balance not enough");
  }
  if (unspent >= UTXO_DUST) {
    tx.addChangeOutput(unspent);
  }

  {
    const isEnough = await tx.isEnoughFee();
    if (!isEnough) {
      await tx.adjustFee();
    }
  }

  const psbt = await tx.createSignedPsbt();
  // tx.dumpTx(psbt);
  const isEnough = await tx.isEnoughFee();
  if (!isEnough) {
    throw new Error("Balance not enough");
  }

  return psbt;
}

export async function createSendOrd({
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

  const nonOrdUtxos: OrdUnspendOutput[] = [];
  const ordUtxos: OrdUnspendOutput[] = [];
  utxos.forEach((v) => {
    const ordUtxo = new OrdUnspendOutput(v);
    if (v.ords.length > 0) {
      ordUtxos.push(ordUtxo);
    } else {
      nonOrdUtxos.push(ordUtxo);
    }
  });

  ordUtxos.sort((a, b) => a.getLastUnitSatoshis() - b.getLastUnitSatoshis());

  // find NFT
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

  if (!found) {
    throw new Error("inscription not found.");
  }

  nonOrdUtxos.forEach((v) => {
    tx.addInput(v.utxo);
  });

  const unspent = tx.getUnspent();
  if (unspent < 0) {
    throw new Error("Balance not enough");
  }
  if (unspent >= UTXO_DUST) {
    tx.addChangeOutput(unspent);
  }

  {
    const isEnough = await tx.isEnoughFee();
    if (!isEnough) {
      await tx.adjustFee();
    }
  }

  const psbt = await tx.createSignedPsbt();
  // tx.dumpTx(psbt);
  const isEnough = await tx.isEnoughFee();
  if (!isEnough) {
    throw new Error("Balance not enough");
  }

  return psbt;
}
