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
} from "../src";

interface TestUtxoData {
  satoshis: number;
  ords?: { id: string; offset: number }[];
}

async function dummySplitOrdUtxo({
  testUtxoDatas,
  feeRate,
  dump,
}: {
  testUtxoDatas: TestUtxoData[];
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
    wallet,
    network,
    changeAddress: wallet.address,
    receiverToPayFee: false,
    pubkey: wallet.pubkey,
    feeRate,
    dump,
  };

  const psbt = await createSplitOrdUtxo(params);
  const txid = psbt.extractTransaction().getId();
  return { psbt, txid };
}

const BOB_ADDRESS = "tb1qmfla5j7cpdvmswtruldgvjvk87yrflrfsf6hh0";

describe("splitOrdUtxo", () => {
  beforeEach(() => {
    // todo
  });

  describe("basic", function () {
    it("split UTXO containing one inscription", async function () {
      const { txid } = await dummySplitOrdUtxo({
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
    });

    it("split UTXO containing two inscriptions", async function () {
      const { txid } = await dummySplitOrdUtxo({
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
    });

    it("split UTXO containing six inscriptions", async function () {
      const { txid } = await dummySplitOrdUtxo({
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
        "281d4740b6198237f27f0c81cd7014a37ddd103d7548ca5ccaa86b651d5aeca1"
      );
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
        "2134cc706638e9b8c51159c9bd59e8f80c65b92d9131be0b23cc4a3296b24600"
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
          dump: true,
        });
      } catch (e) {
        expect(e.message).eq("Balance not enough to pay network fee.");
      }
    });
  });
});
