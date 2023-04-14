import { expect } from "chai";
import { AddressType, validator } from "../src/OrdTransaction";
import {
  LocalWallet,
  NetworkType,
  publicKeyToScriptPk,
  toPsbtNetwork,
} from "../src/LocalWallet";
import { createSendBTC, createSendMultiOrds, createSendOrd } from "../src";

interface TestUtxoData {
  satoshis: number;
  ords?: { id: string; offset: number }[];
}

async function dummySendInscription({
  testUtxoDatas,
  toOrdId,
  feeRate,
  toAddress,
  outputValue,
  dump,
}: {
  testUtxoDatas: TestUtxoData[];
  toOrdId: string;
  outputValue: number;
  feeRate: number;
  toAddress: string;
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
    toAddress,
    toOrdId,
    wallet,
    network,
    changeAddress: wallet.address,
    receiverToPayFee: false,
    pubkey: wallet.pubkey,
    feeRate,
    outputValue,
    dump,
  };

  const psbt = await createSendOrd(params);
  const txid = psbt.extractTransaction().getId();
  return { psbt, txid };
}

const BOB_ADDRESS = "tb1qmfla5j7cpdvmswtruldgvjvk87yrflrfsf6hh0";

describe("sendInscription", () => {
  beforeEach(() => {
    // todo
  });

  describe("basic", function () {
    it("send one inscription with lower outputValue", async function () {
      const { txid } = await dummySendInscription({
        toAddress: BOB_ADDRESS,
        testUtxoDatas: [
          { satoshis: 10000, ords: [{ id: "001", offset: 1000 }] },
          { satoshis: 1000 },
        ],
        toOrdId: "001",
        outputValue: 2000,
        feeRate: 1,
      });
      expect(txid).eq(
        "867e68391c8f9e0fe720eb4b88afdd03f3cdeeb719df299c61c065f465f1a5b3"
      );
    });

    it("send one inscription with higher outputValue", async function () {
      const { txid } = await dummySendInscription({
        toAddress: BOB_ADDRESS,
        testUtxoDatas: [
          { satoshis: 1000, ords: [{ id: "001", offset: 0 }] },
          { satoshis: 10000 },
        ],
        toOrdId: "001",
        outputValue: 2000,
        feeRate: 1,
      });
      expect(txid).eq(
        "828f5ff8c97eb1d93379f71ecd6deed98baefae35693d02619349b9040c0f833"
      );
    });
  });

  describe("select UTXO", function () {
    it("total 4 UTXO but only use 1", async function () {
      const { txid } = await dummySendInscription({
        toAddress: BOB_ADDRESS,
        testUtxoDatas: [
          { satoshis: 10000, ords: [{ id: "001", offset: 1000 }] },
          { satoshis: 1000 },
          { satoshis: 1000 },
          { satoshis: 1000 },
        ],
        toOrdId: "001",
        outputValue: 2000,
        feeRate: 1,
      });
      expect(txid).eq(
        "867e68391c8f9e0fe720eb4b88afdd03f3cdeeb719df299c61c065f465f1a5b3"
      );
    });
  });
});
