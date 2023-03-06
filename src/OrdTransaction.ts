import { OrdUnspendOutput, UTXO_DUST } from "./OrdUnspendOutput";
import * as bitcoin from "bitcoinjs-lib";
import ECPairFactory from "ecpair";
import * as ecc from "tiny-secp256k1";
bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);
interface TxInput {
  hash: string;
  index: number;
  witnessUtxo: { value: number; script: Buffer };
  tapInternalKey?: Buffer;
}

interface TxOutput {
  address: string;
  value: number;
}

export const validator = (
  pubkey: Buffer,
  msghash: Buffer,
  signature: Buffer
): boolean => ECPair.fromPublicKey(pubkey).verify(msghash, signature);

export interface UnspentOutput {
  txId: string;
  outputIndex: number;
  satoshis: number;
  scriptPk: string;
  isTaproot: boolean;
  address: string;
  ords: {
    id: string;
    offset: number;
  }[];
}
export enum AddressType {
  P2PKH,
  P2WPKH,
  P2TR,
}

export const toXOnly = (pubKey: Buffer) =>
  pubKey.length === 32 ? pubKey : pubKey.slice(1, 33);

export function utxoToInput(utxo: UnspentOutput, publicKey: Buffer) {
  if (utxo.isTaproot) {
    const input = {
      hash: utxo.txId,
      index: utxo.outputIndex,
      witnessUtxo: {
        value: utxo.satoshis,
        script: Buffer.from(utxo.scriptPk, "hex"),
      },
      tapInternalKey: toXOnly(publicKey),
    };
    return input;
  } else {
    const input = {
      hash: utxo.txId,
      index: utxo.outputIndex,
      witnessUtxo: {
        value: utxo.satoshis,
        script: Buffer.from(utxo.scriptPk, "hex"),
      },
    };
    return input;
  }
}

export class OrdTransaction {
  private inputs: TxInput[] = [];
  private outputs: TxOutput[] = [];
  private changeOutputIndex = -1;
  private wallet: any;
  private changedAddress: string;
  private network: bitcoin.Network = bitcoin.networks.bitcoin;
  constructor(wallet: any, network: any) {
    this.wallet = wallet;
    this.network = network;
  }

  setChangeAddress(address: string) {
    this.changedAddress = address;
  }

  addInput(utxo: UnspentOutput) {
    this.inputs.push(utxoToInput(utxo, Buffer.from(utxo.address, "hex")));
  }

  getTotalInput() {
    return this.inputs.reduce((pre, cur) => pre + cur.witnessUtxo.value, 0);
  }

  getTotalOutput() {
    return this.outputs.reduce((pre, cur) => pre + cur.value, 0);
  }

  getUnspent() {
    return this.getTotalInput() - this.getTotalOutput();
  }

  addOutput(address: string, value: number) {
    this.outputs.push({
      address,
      value,
    });
  }

  addChangeOutput(value: number) {
    this.outputs.push({
      address: this.changedAddress,
      value,
    });
    this.changeOutputIndex = this.outputs.length - 1;
  }

  getChangeOutput() {
    return this.outputs[this.changeOutputIndex];
  }

  getChangeAmount() {
    const output = this.getChangeOutput();
    return output ? output.value : 0;
  }

  removeChangeOutput() {
    this.outputs.splice(this.changeOutputIndex, 1);
    this.changeOutputIndex = -1;
  }

  async createSignedPsbt() {
    const psbt = new bitcoin.Psbt({ network: this.network });

    this.inputs.forEach((v, index) => {
      psbt.addInput(v);
      psbt.setInputSequence(index, 0xfffffffd); // support RBF
    });

    this.outputs.forEach((v) => {
      psbt.addOutput(v);
    });

    await this.wallet.signPsbt(psbt);

    psbt.validateSignaturesOfAllInputs(validator);
    psbt.finalizeAllInputs();

    return psbt;
  }

  async generate(autoAdjust: boolean) {
    // Try to estimate fee
    const unspent = this.getUnspent();
    this.addChangeOutput(Math.max(unspent, 0));
    const psbt1 = await this.createSignedPsbt();
    // this.dumpTx(psbt1);
    this.removeChangeOutput();

    // todo: support changing the feeRate
    const feeRate = 5;
    const txSize = psbt1.extractTransaction().toBuffer().length;
    const fee = txSize * feeRate;

    if (unspent > fee) {
      const left = unspent - fee;
      if (left > UTXO_DUST) {
        this.addChangeOutput(left);
      }
    } else {
      if (autoAdjust) {
        this.outputs[0].value -= fee - unspent;
      }
    }
    const psbt2 = await this.createSignedPsbt();
    const tx = psbt2.extractTransaction();

    const rawtx = tx.toHex();
    const toAmount = this.outputs[0].value;
    return {
      fee: psbt2.getFee(),
      rawtx,
      toSatoshis: toAmount,
      estimateFee: fee,
    };
  }

  async generateForInscriptionTx() {
    const psbt1 = await this.createSignedPsbt();

    // todo: support changing the feeRate
    const feeRate = 5;
    const txSize = psbt1.extractTransaction().toBuffer().length;
    const fee = txSize * feeRate;

    const changeAmount = this.outputs[this.changeOutputIndex].value;
    if (changeAmount > fee) {
      this.outputs[this.changeOutputIndex].value -= fee;
    } else {
      this.removeChangeOutput();
    }

    const psbt2 = await this.createSignedPsbt();
    const tx = psbt2.extractTransaction();

    const rawtx = tx.toHex();
    const toAmount = this.outputs[0].value;
    return {
      fee: psbt2.getFee(),
      rawtx,
      toSatoshis: toAmount,
    };
  }

  async dumpTx(psbt) {
    const tx = psbt.extractTransaction();
    const size = tx.toBuffer().length;
    const feePaid = psbt.getFee();
    const feeRate = (feePaid / size).toFixed(4);

    console.log(`
=============================================================================================
Summary
  txid:     ${tx.getId()}
  Size:     ${tx.byteLength()}
  Fee Paid: ${psbt.getFee()}
  Fee Rate: ${feeRate} sat/B
  Detail:   ${psbt.txInputs.length} Inputs, ${psbt.txOutputs.length} Outputs
----------------------------------------------------------------------------------------------
Inputs
${this.inputs
  .map((input, index) => {
    const str = `
=>${index} ${input.witnessUtxo.value} Sats
        lock-size: ${input.witnessUtxo.script.length}
        via ${input.hash} [${input.index}]
`;
    return str;
  })
  .join("")}
total: ${this.getTotalInput()} Sats
----------------------------------------------------------------------------------------------
Outputs
${this.outputs
  .map((output, index) => {
    const str = `
=>${index} ${output.value} Sats`;
    return str;
  })
  .join("")}

total: ${this.getTotalOutput() - feePaid} Sats
=============================================================================================
    `);
  }
}
