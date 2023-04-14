import { expect } from "chai";
import { AddressType, validator } from "../src/OrdTransaction";
import {
  LocalWallet,
  NetworkType,
  publicKeyToScriptPk,
  toPsbtNetwork,
} from "../src/LocalWallet";
import { createSendBTC, createSendMultiOrds } from "../src";

interface TestUtxoData {
  satoshis: number;
  ords?: { id: string; offset: number }[];
}

async function dummySendInscription({
  testUtxoDatas,
  toOrdIds,
  feeRate,
  toAddress,
  dump,
}: {
  testUtxoDatas: TestUtxoData[];
  toOrdIds: string[];
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
    toOrdIds,
    wallet,
    network,
    changeAddress: wallet.address,
    receiverToPayFee: false,
    pubkey: wallet.pubkey,
    feeRate,
    dump,
  };

  const psbt = await createSendMultiOrds(params);
  const txid = psbt.extractTransaction().getId();
  return { psbt, txid };
}

const BOB_ADDRESS = "tb1qmfla5j7cpdvmswtruldgvjvk87yrflrfsf6hh0";

describe("sendInscriptions", () => {
  beforeEach(() => {
    // todo
  });

  describe("basic", function () {
    it("send one inscription", async function () {
      const { txid } = await dummySendInscription({
        toAddress: BOB_ADDRESS,
        testUtxoDatas: [
          { satoshis: 10000, ords: [{ id: "001", offset: 1000 }] },
          { satoshis: 1000 },
        ],
        toOrdIds: ["001"],
        feeRate: 1,
      });
      expect(txid).eq(
        "af66d4d6aa1ab409ae463e102e9530533cac45f21e7a08add73555855d80f8f8"
      );
    });

    it("send multiple inscriptions", async function () {
      const { txid } = await dummySendInscription({
        toAddress: BOB_ADDRESS,
        testUtxoDatas: [
          { satoshis: 10000, ords: [{ id: "001", offset: 1000 }] },
          { satoshis: 10000, ords: [{ id: "002", offset: 1000 }] },
          { satoshis: 1000 },
        ],
        toOrdIds: ["001", "002"],
        feeRate: 1,
      });
      expect(txid).eq(
        "d07dd31ea9e60a8975fdcd2679ff0824817836b14e83f92e6f5bd716de7454cc"
      );
    });

    it("can not send multiple inscriptions in one UTXO", async function () {
      try {
        const { txid } = await dummySendInscription({
          toAddress: BOB_ADDRESS,
          testUtxoDatas: [
            {
              satoshis: 10000,
              ords: [
                { id: "001", offset: 1000 },
                { id: "002", offset: 2000 },
              ],
            },
            { satoshis: 1000 },
          ],
          toOrdIds: ["001", "002"],
          feeRate: 1,
        });
      } catch (e) {
        expect(e.message).eq(
          "Multiple inscriptions in one UTXO! Please split them first."
        );
      }
    });
  });

  describe("select UTXO", function () {
    it("total 4 UTXO only use 2", async function () {
      const { txid } = await dummySendInscription({
        toAddress: BOB_ADDRESS,
        testUtxoDatas: [
          { satoshis: 1000, ords: [{ id: "001", offset: 0 }] },
          { satoshis: 1000, ords: [{ id: "002", offset: 0 }] },
          { satoshis: 1000 },
          { satoshis: 1000 },
        ],
        toOrdIds: ["001"],
        feeRate: 1,
      });
      expect(txid).eq(
        "2ab01e292088526ac546c384b5da495798c7d20bc3800936ef59b849a8f31f28"
      );
    });
  });
});
