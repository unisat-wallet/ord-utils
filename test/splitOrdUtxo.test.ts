import { expect } from "chai";
import { AddressType, validator } from "../src/OrdTransaction";
import {
  LocalWallet,
  NetworkType,
  publicKeyToScriptPk,
  toPsbtNetwork,
} from "../src/LocalWallet";
import {
  createSendBTC,
  createSendMultiOrds,
  createSendOrd,
  createSplitOrdUtxo,
  createSplitOrdUtxoV2,
} from "../src";

interface TestUtxoData {
  satoshis: number;
  ords?: { id: string; offset: number }[];
}

async function dummySplitOrdUtxo({
  testUtxoDatas,
  feeRate,
  dump,
  outputValue,
}: {
  testUtxoDatas: TestUtxoData[];
  feeRate: number;
  dump?: boolean;
  outputValue?: number;
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
    wallet,
    network,
    changeAddress: wallet.address,
    receiverToPayFee: false,
    pubkey: wallet.pubkey,
    feeRate,
    dump,
    outputValue,
  };

  const { psbt, splitedCount } = await createSplitOrdUtxoV2(params);
  const txid = psbt.extractTransaction().getId();
  return { psbt, txid, splitedCount };
}

const BOB_ADDRESS = "tb1qmfla5j7cpdvmswtruldgvjvk87yrflrfsf6hh0";

describe("splitOrdUtxo", () => {
  beforeEach(() => {
    // todo
  });

  describe("basic", function () {
    it("split UTXO containing one inscription", async function () {
      const { txid, splitedCount } = await dummySplitOrdUtxo({
        testUtxoDatas: [
          { satoshis: 10000, ords: [{ id: "001", offset: 1000 }] },
          { satoshis: 10000 },
        ],
        feeRate: 1,
        // dump: true,
      });
      expect(txid).eq(
        "74a05591537956c362b65f36b9e229eab18c0f1944a4cf8e87ad3d4436cca13f"
      );
      expect(splitedCount).eq(1);
    });

    it("split UTXO containing two inscriptions", async function () {
      const { txid, splitedCount } = await dummySplitOrdUtxo({
        testUtxoDatas: [
          {
            satoshis: 10000,
            ords: [
              { id: "001", offset: 1000 },
              { id: "002", offset: 3000 },
            ],
          },
          { satoshis: 10000 },
        ],
        feeRate: 1,
        // dump: true,
      });
      expect(txid).eq(
        "f12cbd6403c3ea96a71eb0289451f4017326e7bd743a78557358bf1185949efb"
      );
      expect(splitedCount).eq(2);
    });

    it("split UTXO containing six inscriptions", async function () {
      const { txid, splitedCount } = await dummySplitOrdUtxo({
        testUtxoDatas: [
          {
            satoshis: 10000,
            ords: [
              { id: "001", offset: 1000 },
              { id: "002", offset: 1000 },
              { id: "003", offset: 3000 },
              { id: "004", offset: 4000 },
              { id: "005", offset: 5000 },
              { id: "006", offset: 10000 },
            ],
          },
          { satoshis: 10000 },
        ],
        feeRate: 1,
        // dump: true,
      });
      expect(txid).eq(
        "190d3a3974a58e62d575dc8847fb15b24c379fe2472ebe5b8072cca485496b1c"
      );
      expect(splitedCount).eq(5);
    });
  });

  describe("custom output value", function () {
    it("split UTXO containing one inscription", async function () {
      const { txid, splitedCount } = await dummySplitOrdUtxo({
        testUtxoDatas: [
          { satoshis: 10000, ords: [{ id: "001", offset: 1000 }] },
          { satoshis: 10000 },
        ],
        feeRate: 1,
        outputValue: 600,
        // dump: true,
      });
      expect(txid).eq(
        "a51edc166e5005313928adc34fadda7a21a16ebae114daa812340e188b554734"
      );
      expect(splitedCount).eq(1);
    });

    it("split UTXO containing two inscriptions", async function () {
      const { txid, splitedCount } = await dummySplitOrdUtxo({
        testUtxoDatas: [
          {
            satoshis: 10000,
            ords: [
              { id: "001", offset: 1000 },
              { id: "002", offset: 3000 },
            ],
          },
          { satoshis: 10000 },
        ],
        feeRate: 1,
        outputValue: 600,
        // dump: true,
      });
      expect(txid).eq(
        "9f38cea296aa5250c5bc7326efc3894f6866c859f089e17f11475bd881f88660"
      );
      expect(splitedCount).eq(2);
    });

    it("split UTXO containing three inscriptions", async function () {
      const { txid, splitedCount } = await dummySplitOrdUtxo({
        testUtxoDatas: [
          {
            satoshis: 1638,
            ords: [
              { id: "001", offset: 0 },
              { id: "002", offset: 546 },
              { id: "003", offset: 1092 },
            ],
          },
          { satoshis: 10000 },
        ],
        feeRate: 1,
        outputValue: 600,
        // dump: true,
      });
      expect(txid).eq(
        "8b590c21899dad0961efd2b895548fb631211eca8f7f632ca076e093de742856"
      );
      expect(splitedCount).eq(2);
    });
  });

  describe("boundary cases", function () {
    it("The ord is in the last sat", async function () {
      try {
        const { txid } = await dummySplitOrdUtxo({
          testUtxoDatas: [
            {
              satoshis: 10000,
              ords: [{ id: "001", offset: 10000 }],
            },
          ],
          feeRate: 1,
          //   dump: true,
        });
      } catch (e) {
        expect(e.message).eq("Balance not enough to pay network fee.");
      }
    });

    it("The ord is in the last sat", async function () {
      const { txid } = await dummySplitOrdUtxo({
        testUtxoDatas: [
          {
            satoshis: 10000,
            ords: [{ id: "001", offset: 10000 }],
          },
          {
            satoshis: 10000,
            ords: [],
          },
        ],
        feeRate: 1,
        // dump: true,
      });
      expect(txid).eq(
        "9bf45892315d800724255e8579069bb520eb1c684120c92e5c40bdf58ed9e5b2"
      );
    });

    it("Two ord within 546", async function () {
      const { txid } = await dummySplitOrdUtxo({
        testUtxoDatas: [
          {
            satoshis: 10000,
            ords: [
              { id: "001", offset: 0 },
              { id: "002", offset: 1 },
            ],
          },
        ],
        feeRate: 1,
        //   dump: true,
      });
      expect(txid).eq(
        "7a79e1c89d66e1e907a17d0a2eeb2ca4222f9b5b3856f351dca5d7ea132f0c7d"
      );
    });

    it("The ord is in the last sat", async function () {
      try {
        const { txid } = await dummySplitOrdUtxo({
          testUtxoDatas: [
            {
              satoshis: 10000,
              ords: [{ id: "001", offset: 10000 - 546 }],
            },
          ],
          feeRate: 1,
          // dump: true,
        });
      } catch (e) {
        expect(e.message).eq("Balance not enough to pay network fee.");
      }
    });

    it("split UTXO containing two adjacent inscriptions (not support)", async function () {
      const { txid, splitedCount } = await dummySplitOrdUtxo({
        testUtxoDatas: [
          {
            satoshis: 546,
            ords: [
              { id: "001", offset: 0 },
              { id: "002", offset: 200 },
            ],
          },
          { satoshis: 10000 },
        ],
        feeRate: 1,
        // dump: true,
      });
      expect(txid).eq(
        "804b62a7b7797b99cbf79820292dbfbc5a9de83bf1a6caadab1912a453238533"
      );
      expect(splitedCount).eq(1);
    });
  });
});
