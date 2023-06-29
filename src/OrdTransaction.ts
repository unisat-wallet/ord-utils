import { OrdUnspendOutput, UTXO_DUST } from "./OrdUnspendOutput";
import * as bitcoin from "bitcoinjs-lib";
import ECPairFactory from "ecpair";
import * as ecc from "tiny-secp256k1";
bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);
interface TxInput {
  data: {
    hash: string;
    index: number;
    witnessUtxo: { value: number; script: Buffer };
    tapInternalKey?: Buffer;
  };
  utxo: UnspentOutput;
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
  addressType: AddressType;
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
  P2SH_P2WPKH,
  M44_P2WPKH,
  M44_P2TR,
}

export const toXOnly = (pubKey: Buffer) =>
  pubKey.length === 32 ? pubKey : pubKey.slice(1, 33);

export function utxoToInput(utxo: UnspentOutput, publicKey: Buffer): TxInput {
  if (
    utxo.addressType === AddressType.P2TR ||
    utxo.addressType === AddressType.M44_P2TR
  ) {
    const data = {
      hash: utxo.txId,
      index: utxo.outputIndex,
      witnessUtxo: {
        value: utxo.satoshis,
        script: Buffer.from(utxo.scriptPk, "hex"),
      },
      tapInternalKey: toXOnly(publicKey),
    };
    return {
      data,
      utxo,
    };
  } else if (
    utxo.addressType === AddressType.P2WPKH ||
    utxo.addressType === AddressType.M44_P2WPKH
  ) {
    const data = {
      hash: utxo.txId,
      index: utxo.outputIndex,
      witnessUtxo: {
        value: utxo.satoshis,
        script: Buffer.from(utxo.scriptPk, "hex"),
      },
    };
    return {
      data,
      utxo,
    };
  } else if (utxo.addressType === AddressType.P2PKH) {
    const data = {
      hash: utxo.txId,
      index: utxo.outputIndex,
      witnessUtxo: {
        value: utxo.satoshis,
        script: Buffer.from(utxo.scriptPk, "hex"),
      },
    };
    return {
      data,
      utxo,
    };
  } else if (utxo.addressType === AddressType.P2SH_P2WPKH) {
    const redeemData = bitcoin.payments.p2wpkh({ pubkey: publicKey });
    const data = {
      hash: utxo.txId,
      index: utxo.outputIndex,
      witnessUtxo: {
        value: utxo.satoshis,
        script: Buffer.from(utxo.scriptPk, "hex"),
      },
      redeemScript: redeemData.output,
    };
    return {
      data,
      utxo,
    };
  }
}

export class OrdTransaction {
  private inputs: TxInput[] = [];
  public outputs: TxOutput[] = [];
  private changeOutputIndex = -1;
  private wallet: any;
  public changedAddress: string;
  private network: bitcoin.Network = bitcoin.networks.bitcoin;
  private feeRate: number;
  private pubkey: string;
  private enableRBF = true;
  constructor(wallet: any, network: any, pubkey: string, feeRate?: number) {
    this.wallet = wallet;
    this.network = network;
    this.pubkey = pubkey;
    this.feeRate = feeRate || 5;
  }

  setEnableRBF(enable: boolean) {
    this.enableRBF = enable;
  }

  setChangeAddress(address: string) {
    this.changedAddress = address;
  }

  addInput(utxo: UnspentOutput) {
    this.inputs.push(utxoToInput(utxo, Buffer.from(this.pubkey, "hex")));
  }

  getTotalInput() {
    return this.inputs.reduce(
      (pre, cur) => pre + cur.data.witnessUtxo.value,
      0
    );
  }

  getTotalOutput() {
    return this.outputs.reduce((pre, cur) => pre + cur.value, 0);
  }

  getUnspent() {
    return this.getTotalInput() - this.getTotalOutput();
  }

  async isEnoughFee() {
    const psbt1 = await this.createSignedPsbt();
    if (psbt1.getFeeRate() >= this.feeRate) {
      return true;
    } else {
      return false;
    }
  }

  async calNetworkFee() {
    const psbt = await this.createSignedPsbt();
    let txSize = psbt.extractTransaction(true).toBuffer().length;
    psbt.data.inputs.forEach((v) => {
      if (v.finalScriptWitness) {
        txSize -= v.finalScriptWitness.length * 0.75;
      }
    });
    const fee = Math.ceil(txSize * this.feeRate);
    return fee;
  }

  addOutput(address: string, value: number) {
    this.outputs.push({
      address,
      value,
    });
  }

  getOutput(index: number) {
    return this.outputs[index];
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

  removeRecentOutputs(count: number) {
    this.outputs.splice(-count);
  }

  async createSignedPsbt() {
    const psbt = new bitcoin.Psbt({ network: this.network });
    this.inputs.forEach((v, index) => {
      if (v.utxo.addressType === AddressType.P2PKH) {
        //@ts-ignore
        psbt.__CACHE.__UNSAFE_SIGN_NONSEGWIT = true;
      }
      psbt.addInput(v.data);
      if (this.enableRBF) {
        psbt.setInputSequence(index, 0xfffffffd); // support RBF
      }
    });

    this.outputs.forEach((v) => {
      psbt.addOutput(v);
    });

    await this.wallet.signPsbt(psbt);

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
    const txSize = psbt1.extractTransaction().toBuffer().length;
    const fee = txSize * this.feeRate;

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

  async dumpTx(psbt) {
    const tx = psbt.extractTransaction();
    const size = tx.toBuffer().length;
    const feePaid = psbt.getFee();
    const feeRate = psbt.getFeeRate();

    console.log(`
=============================================================================================
Summary
  txid:     ${tx.getId()}
  Size:     ${tx.byteLength()}
  Fee Paid: ${psbt.getFee()}
  Fee Rate: ${feeRate} sat/vB
  Detail:   ${psbt.txInputs.length} Inputs, ${psbt.txOutputs.length} Outputs
----------------------------------------------------------------------------------------------
Inputs
${this.inputs
  .map((input, index) => {
    const str = `
=>${index} ${input.data.witnessUtxo.value} Sats
        lock-size: ${input.data.witnessUtxo.script.length}
        via ${input.data.hash} [${input.data.index}]
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
=>${index} ${output.address} ${output.value} Sats`;
    return str;
  })
  .join("")}

total: ${this.getTotalOutput()} Sats
=============================================================================================
    `);
  }
}
