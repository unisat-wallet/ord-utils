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
import { createSendBTC } from "../src";

interface TestUtxoData {
  satoshis: number;
  ords?: { id: string; offset: number }[];
}
async function dummySendBTC({
  testUtxoDatas,
  toAmount,
  feeRate,
  toAddress,
  dump,
  receiverToPayFee,
}: {
  testUtxoDatas: TestUtxoData[];
  toAmount: number;
  feeRate: number;
  toAddress: string;
  dump?: boolean;
  receiverToPayFee?: boolean;
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
    toAddress,
    toAmount,
    wallet,
    network,
    changeAddress: wallet.address,
    pubkey: wallet.pubkey,
    feeRate,
    dump,
    receiverToPayFee,
  };

  const psbt = await createSendBTC(params);
  const txid = psbt.extractTransaction().getId();
  const inputCount = psbt.txInputs.length;
  const outputCount = psbt.txOutputs.length;
  return { psbt, txid, inputCount, outputCount };
}

const BOB_ADDRESS = "tb1qmfla5j7cpdvmswtruldgvjvk87yrflrfsf6hh0";

describe("sendBTC", () => {
  beforeEach(() => {
    // todo
  });

  describe("basic", function () {
    it("huge balance", async function () {
      const { txid } = await dummySendBTC({
        toAddress: BOB_ADDRESS,
        testUtxoDatas: [{ satoshis: 100000000 }],
        toAmount: 1000,
        feeRate: 1,
      });
      expect(txid).eq(
        "06fa6fbd3eadb5cee6c84b27a001bab80fbcb9f88e43ee685f7a3c9608452800"
      );
    });

    it("send all balance", async function () {
      const { txid } = await dummySendBTC({
        toAddress: BOB_ADDRESS,
        testUtxoDatas: [{ satoshis: 100000000 }],
        toAmount: 100000000,
        feeRate: 1,
        receiverToPayFee: true,
      });
      expect(txid).eq(
        "288ad31ee71bb6535ab255245521d9e318e70d6bb51f1daae6ba4ed72857b05a"
      );
    });
  });

  describe("select UTXO", function () {
    it("1 utxo", async function () {
      const { txid } = await dummySendBTC({
        toAddress: BOB_ADDRESS,
        testUtxoDatas: [{ satoshis: 10000 }],
        toAmount: 1000,
        feeRate: 1,
      });
      expect(txid).eq(
        "3f1dd71aeffc938470fa5ae36a15b2209502b20f2191489f3df98002b0fc28ef"
      );
    });

    it("total 2 utxo but only use 1", async function () {
      const { txid, inputCount, outputCount } = await dummySendBTC({
        toAddress: BOB_ADDRESS,
        testUtxoDatas: [{ satoshis: 10000 }, { satoshis: 10000 }],
        toAmount: 1000,
        feeRate: 1,
      });
      expect(inputCount).eq(1);
      expect(outputCount).eq(2);
    });

    it("total 3 utxo", async function () {
      const { txid, inputCount, outputCount } = await dummySendBTC({
        toAddress: BOB_ADDRESS,
        testUtxoDatas: [
          { satoshis: 5000 },
          { satoshis: 5000 },
          { satoshis: 10000 },
        ],
        toAmount: 10000,
        feeRate: 1,
      });
      expect(inputCount).eq(3);
      expect(txid).eq(
        "8927ccb92a0925f21b71c1cdb6b1591a6dd395aab126b3ebef9cea51a9eb53ca"
      );
    });

    it("total 3 utxo", async function () {
      const { txid, inputCount, outputCount } = await dummySendBTC({
        toAddress: BOB_ADDRESS,
        testUtxoDatas: [
          { satoshis: 5000 },
          { satoshis: 5000 },
          { satoshis: 278 },
        ],
        toAmount: 10000,
        feeRate: 1,
      });
      expect(inputCount).eq(3);
      expect(txid).eq(
        "4f6c025d2ce3660b6bee828c2d52049f1f7fb29566cf03aca2699c401084dcbe"
      );
    });

    it("insufficent balance", async function () {
      try {
        const { txid, inputCount, outputCount } = await dummySendBTC({
          toAddress: BOB_ADDRESS,
          testUtxoDatas: [
            { satoshis: 5000 },
            { satoshis: 5000 },
            { satoshis: 270 },
          ],
          toAmount: 10000,
          feeRate: 1,
        });
      } catch (e) {
        expect(e.message).eq(
          "Balance not enough. Need 0.00000278 BTC as network fee, but only 0.00000270 BTC."
        );
      }
    });
  });
});
