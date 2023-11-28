import { Hex } from 'viem';
import { batchRun } from '../utils';
import prisma from '../prisma';
import alchemy from './alchemy';
import { Alchemy, Network } from 'alchemy-sdk';

// Returns the current transaction count of the address.
export const getTransactionCount = async (
  alchemyClient: Alchemy,
  address: Hex,
): Promise<number> => {
  const txCount = await alchemyClient.core.getTransactionCount(address);
  return txCount;
};

export const networks = [Network.ETH_MAINNET, Network.OPT_MAINNET, Network.BASE_MAINNET];

export const indexTxCount = async () => {
  // Get addresses that don't have > 100 txs as of the last sync
  const addresses = (
    await prisma.txCount.findMany({
      where: {
        txCount: {
          lte: 100,
        },
      },
      select: {
        address: true,
      },
    })
  ).map((r) => r.address as Hex);

  for (const network of networks) {
    const alchemyClient = alchemy(network);
    await batchRun(
      async (batch) => {
        try {
          const txCounts = await Promise.all(
            batch.map(async (address) => ({
              address,
              network,
              txCount: await getTransactionCount(alchemyClient, address),
            })),
          );

          await prisma.txCount.createMany({
            data: txCounts,
            skipDuplicates: true,
          });
        } catch (err) {
          console.error(err);
        }
      },
      addresses,
      `txCount (${network})`,
      20,
    );
  }
};
