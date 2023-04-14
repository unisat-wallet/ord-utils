import * as bitcoin from "bitcoinjs-lib";
import { isTaprootInput } from "bitcoinjs-lib/src/psbt/bip371";
import * as ecc from "tiny-secp256k1";
bitcoin.initEccLib(ecc);
import ECPairFactory, { ECPairInterface } from "ecpair";
import { AddressType } from "../src/OrdTransaction";
import { validator } from "../src/OrdTransaction";
const ECPair = ECPairFactory(ecc);

export const toXOnly = (pubKey: Buffer) =>
  pubKey.length === 32 ? pubKey : pubKey.slice(1, 33);

function tapTweakHash(pubKey: Buffer, h: Buffer | undefined): Buffer {
  return bitcoin.crypto.taggedHash(
    "TapTweak",
    Buffer.concat(h ? [pubKey, h] : [pubKey])
  );
}

function tweakSigner(signer: bitcoin.Signer, opts: any = {}): bitcoin.Signer {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  let privateKey: Uint8Array | undefined = signer.privateKey!;
  if (!privateKey) {
    throw new Error("Private key is required for tweaking signer!");
  }
  if (signer.publicKey[0] === 3) {
    privateKey = ecc.privateNegate(privateKey);
  }

  const tweakedPrivateKey = ecc.privateAdd(
    privateKey,
    tapTweakHash(toXOnly(signer.publicKey), opts.tweakHash)
  );
  if (!tweakedPrivateKey) {
    throw new Error("Invalid tweaked private key!");
  }

  return ECPair.fromPrivateKey(Buffer.from(tweakedPrivateKey), {
    network: opts.network,
  });
}
export enum NetworkType {
  MAINNET,
  TESTNET,
}
export function toPsbtNetwork(networkType: NetworkType) {
  if (networkType === NetworkType.MAINNET) {
    return bitcoin.networks.bitcoin;
  } else {
    return bitcoin.networks.testnet;
  }
}

export function publicKeyToPayment(
  publicKey: string,
  type: AddressType,
  networkType: NetworkType
) {
  const network = toPsbtNetwork(networkType);
  if (!publicKey) return null;
  const pubkey = Buffer.from(publicKey, "hex");
  if (type === AddressType.P2PKH) {
    return bitcoin.payments.p2pkh({
      pubkey,
      network,
    });
  } else if (type === AddressType.P2WPKH || type === AddressType.M44_P2WPKH) {
    return bitcoin.payments.p2wpkh({
      pubkey,
      network,
    });
  } else if (type === AddressType.P2TR || type === AddressType.M44_P2TR) {
    return bitcoin.payments.p2tr({
      internalPubkey: pubkey.slice(1, 33),
      network,
    });
  } else if (type === AddressType.P2SH_P2WPKH) {
    const data = bitcoin.payments.p2wpkh({
      pubkey,
      network,
    });
    return bitcoin.payments.p2sh({
      pubkey,
      network,
      redeem: data,
    });
  }
}

export function publicKeyToAddress(
  publicKey: string,
  type: AddressType,
  networkType: NetworkType
) {
  const payment = publicKeyToPayment(publicKey, type, networkType);
  if (payment && payment.address) {
    return payment.address;
  } else {
    return "";
  }
}

export function publicKeyToScriptPk(
  publicKey: string,
  type: AddressType,
  networkType: NetworkType
) {
  const payment = publicKeyToPayment(publicKey, type, networkType);
  return payment.output.toString("hex");
}

export interface ToSignInput {
  index: number;
  publicKey: string;
  sighashTypes?: number[];
}

export interface SignOptions {
  inputs?: ToSignInput[];
  autoFinalized?: boolean;
}

export function randomWIF(networkType = NetworkType.TESTNET) {
  const network = toPsbtNetwork(networkType);
  const keyPair = ECPair.makeRandom({ network });
  return keyPair.toWIF();
}

export class LocalWallet {
  keyPair: ECPairInterface;
  address: string;
  pubkey: string;
  network: bitcoin.Network;
  constructor(
    wif: string,
    networkType: NetworkType = NetworkType.TESTNET,
    addressType: AddressType = AddressType.P2WPKH
  ) {
    const network = toPsbtNetwork(networkType);
    const keyPair = ECPair.fromWIF(wif, network);
    this.keyPair = keyPair;
    this.pubkey = keyPair.publicKey.toString("hex");
    this.address = publicKeyToAddress(this.pubkey, addressType, networkType);
    this.network = network;
  }

  async signPsbt(psbt: bitcoin.Psbt, opts?: SignOptions) {
    const _opts = opts || {
      autoFinalized: true,
    };
    const psbtNetwork = this.network;
    const toSignInputs: ToSignInput[] = [];

    psbt.data.inputs.forEach((v, index) => {
      let script: any = null;
      let value = 0;
      if (v.witnessUtxo) {
        script = v.witnessUtxo.script;
        value = v.witnessUtxo.value;
      } else if (v.nonWitnessUtxo) {
        const tx = bitcoin.Transaction.fromBuffer(v.nonWitnessUtxo);
        const output = tx.outs[psbt.txInputs[index].index];
        script = output.script;
        value = output.value;
      }
      const isSigned = v.finalScriptSig || v.finalScriptWitness;
      if (script && !isSigned) {
        const address = bitcoin.address.fromOutputScript(script, psbtNetwork);
        if (this.address === address) {
          toSignInputs.push({
            index,
            publicKey: this.pubkey,
            sighashTypes: v.sighashType ? [v.sighashType] : undefined,
          });
        }
      }
    });

    const _inputs = _opts.inputs || toSignInputs;
    if (_inputs.length == 0) {
      throw new Error("no input to sign");
    }
    _inputs.forEach((input) => {
      const keyPair = this.keyPair;
      if (isTaprootInput(psbt.data.inputs[input.index])) {
        const signer = tweakSigner(keyPair, opts);
        psbt.signInput(input.index, signer, input.sighashTypes);
      } else {
        const signer = keyPair;
        psbt.signInput(input.index, signer, input.sighashTypes);
      }
      if (_opts.autoFinalized !== false) {
        psbt.validateSignaturesOfInput(input.index, validator);
        psbt.finalizeInput(input.index);
      }
    });
    return psbt;
  }

  getPublicKey() {
    return this.keyPair.publicKey.toString("hex");
  }
}
