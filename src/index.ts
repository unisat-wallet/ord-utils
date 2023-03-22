import { OrdTransaction, UnspentOutput } from "./OrdTransaction";
import { OrdUnspendOutput, UTXO_DUST } from "./OrdUnspendOutput";

export async function createSendBTC({
  utxos,
  toAddress,
  toAmount,
  wallet,
  network,
  changeAddress,
  force,
  feeRate,
  pubkey,
}: {
  utxos: UnspentOutput[];
  toAddress: string;
  toAmount: number;
  wallet: any;
  network: any;
  changeAddress: string;
  force?: boolean;
  feeRate?: number;
  pubkey: string;
}) {
  const tx = new OrdTransaction(wallet, network, pubkey, feeRate);
  tx.setChangeAddress(changeAddress);

  const nonOrdUtxos: UnspentOutput[] = [];
  const ordUtxos: UnspentOutput[] = [];
  utxos.forEach((v) => {
    if (v.ords.length > 0) {
      ordUtxos.push(v);
    } else {
      nonOrdUtxos.push(v);
    }
  });

  nonOrdUtxos.forEach((v) => {
    tx.addInput(v);
  });

  tx.addOutput(toAddress, toAmount);

  const unspent = tx.getUnspent();
  if (unspent < 0) {
    throw new Error("Balance not enough");
  }
  if (unspent >= UTXO_DUST) {
    tx.addChangeOutput(unspent);
  }

  const isEnough = await tx.isEnoughFee();
  if (!isEnough) {
    await tx.adjustFee(force);
  }

  const psbt = await tx.createSignedPsbt();
  // tx.dumpTx(psbt);

  return psbt;
}

export async function createSendOrd({
  utxos,
  toAddress,
  toOrdId,
  wallet,
  network,
  changeAddress,
  pubkey,
  feeRate,
  outputValue,
}: {
  utxos: UnspentOutput[];
  toAddress: string;
  toOrdId: string;
  wallet: any;
  network: any;
  changeAddress: string;
  pubkey: string;
  feeRate?: number;
  outputValue: number;
}) {
  const tx = new OrdTransaction(wallet, network, pubkey, feeRate);
  tx.setChangeAddress(changeAddress);

  const nonOrdUtxos: UnspentOutput[] = [];
  const ordUtxos: UnspentOutput[] = [];
  utxos.forEach((v) => {
    if (v.ords.length > 0) {
      ordUtxos.push(v);
    } else {
      nonOrdUtxos.push(v);
    }
  });

  // find NFT
  let found = false;

  for (let i = 0; i < ordUtxos.length; i++) {
    const ordUtxo = ordUtxos[i];
    if (ordUtxo.ords.find((v) => v.id == toOrdId)) {
      if (ordUtxo.ords.length > 1) {
        throw new Error("Multiple inscriptions! Please split them first.");
      }
      tx.addInput(ordUtxo);
      tx.addOutput(toAddress, ordUtxo.satoshis);
      found = true;
      break;
    }
  }

  if (!found) {
    throw new Error("inscription not found.");
  }

  // format NFT

  tx.outputs[0].value = outputValue;

  nonOrdUtxos.forEach((v) => {
    tx.addInput(v);
  });

  const unspent = tx.getUnspent();
  if (unspent < 0) {
    throw new Error("Balance not enough");
  }
  if (unspent >= UTXO_DUST) {
    tx.addChangeOutput(unspent);
  }

  const isEnough = await tx.isEnoughFee();
  if (!isEnough) {
    await tx.adjustFee();
  }

  const psbt = await tx.createSignedPsbt();
  // tx.dumpTx(psbt);

  return psbt;
}
