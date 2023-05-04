import * as bitcoin from "bitcoinjs-lib";
import { expect } from "chai";
import { OrdUnspendOutput } from "../src/OrdUnspendOutput";
import { AddressType, validator } from "../src/OrdTransaction";
import {
  LocalWallet,
  NetworkType,
  publicKeyToScriptPk,
  toPsbtNetwork,
} from "../src/LocalWallet";
import { createSendBTC, createSendMultiBTC } from "../src";

interface TestUtxoData {
  satoshis: number;
  ords?: { id: string; offset: number }[];
}
async function dummySendBTC({
  testUtxoDatas,
  receivers,
  feeRate,
  dump,
}: {
  testUtxoDatas: TestUtxoData[];
  receivers: { address: string; amount: number }[];
  feeRate: number;
  dump?: boolean;
}) {
  const addressType = AddressType.P2WPKH;
  const networkType = NetworkType.TESTNET;
  const wallet = new LocalWallet(
    "cQorDQ6ocxuCkHtYNy6rfnRW3qXN3XX5XnNi7HyqjGZ6rDgRhR3J",
    networkType
  );

  const network = toPsbtNetwork(networkType);
  const utxos = testUtxoDatas.map((v, index) => {
    const scriptPk = publicKeyToScriptPk(
      wallet.pubkey,
      addressType,
      networkType
    );
    return {
      txId: "f39c6631fa36762c4a1b1ee2d37e2b3526184d9012d3e0b019b67ffb5d5fef50",
      outputIndex: index,
      satoshis: v.satoshis,
      scriptPk,
      addressType,
      address: wallet.address,
      ords: v.ords || [],
    };
  });
  const params = {
    utxos,
    receivers,
    wallet,
    network,
    changeAddress: wallet.address,
    pubkey: wallet.pubkey,
    feeRate,
    dump,
  };

  const psbt = await createSendMultiBTC(params);
  const txid = psbt.extractTransaction().getId();
  const inputCount = psbt.txInputs.length;
  const outputCount = psbt.txOutputs.length;
  return { psbt, txid, inputCount, outputCount };
}

const BOB_ADDRESS = "tb1qmfla5j7cpdvmswtruldgvjvk87yrflrfsf6hh0";

describe("sendMultiBTC", () => {
  beforeEach(() => {
    // todo
  });

  describe("basic", function () {
    it("huge balance", async function () {
      const { txid } = await dummySendBTC({
        receivers: [
          {
            address: BOB_ADDRESS,
            amount: 1000,
          },
        ],
        testUtxoDatas: [{ satoshis: 100000000 }],
        feeRate: 1,
      });
      expect(txid).eq(
        "06fa6fbd3eadb5cee6c84b27a001bab80fbcb9f88e43ee685f7a3c9608452800"
      );
    });
  });

  describe("select UTXO", function () {
    it("total 2 utxo but only use 1", async function () {
      const { txid, inputCount, outputCount } = await dummySendBTC({
        receivers: [
          {
            address: BOB_ADDRESS,
            amount: 1000,
          },
        ],
        testUtxoDatas: [{ satoshis: 10000 }, { satoshis: 10000 }],
        feeRate: 1,
      });
      expect(inputCount).eq(1);
      expect(outputCount).eq(2);
    });

    it("total 3 utxo", async function () {
      const { txid, inputCount, outputCount } = await dummySendBTC({
        receivers: [
          {
            address: BOB_ADDRESS,
            amount: 10000,
          },
        ],
        testUtxoDatas: [
          { satoshis: 5000 },
          { satoshis: 5000 },
          { satoshis: 10000 },
        ],
        feeRate: 1,
      });
      expect(inputCount).eq(3);
      expect(txid).eq(
        "8927ccb92a0925f21b71c1cdb6b1591a6dd395aab126b3ebef9cea51a9eb53ca"
      );
    });
  });

  describe("send to multi receivers", function () {
    it("2 receivers", async function () {
      const { txid, inputCount, outputCount } = await dummySendBTC({
        receivers: [
          {
            address: BOB_ADDRESS,
            amount: 1000,
          },
          {
            address: BOB_ADDRESS,
            amount: 5000,
          },
        ],
        testUtxoDatas: [{ satoshis: 10000 }],
        feeRate: 1,
      });
      expect(outputCount).eq(3);
      expect(txid).eq(
        "c4d8699d818929b23f127e79b13356678666dfd13a9b528d523d9aabeb099744"
      );
    });
  });
});
