import { ERC20TransferEvent2 } from '@prisma/client';
import prisma from '../../prisma';
import { GetFilterLogsReturnType, Hex, Chain, PublicClient, HttpTransport } from 'viem';
import { processLogs } from '../../lib/processLogs';
import * as chains from 'viem/chains';
import CONTRACTS from './contracts';
import { TRANSFER_EVENT } from './abi/abi';
import { ContractWithDeployedBlock } from '../../types';
import { getClient, NUM_MAINNET_CLIENTS } from '../ethRpc';

// Sync `Transfer` events from ERC20 contracts
const indexTransferEvents = async (
  client: PublicClient<HttpTransport, Chain>,
  contract: ContractWithDeployedBlock,
) => {
  const label = `find latest event ${contract.id}`;
  console.time(label);
  const latestSyncedEvent = await prisma.eRC20TransferEvent2.aggregate({
    _max: {
      blockNumber: true,
    },
    where: {
      contractId: contract.id,
    },
  });

  console.timeEnd(label);

  const fromBlock = latestSyncedEvent._max.blockNumber || BigInt(contract.deployedBlock);
  console.log('fromBlock', fromBlock);

  const processTransfers = async (logs: GetFilterLogsReturnType) => {
    const data = logs
      .map((log) => {
        // @ts-ignore
        const from = log.args.from;
        // @ts-ignore
        const to = log.args.to;
        // @ts-ignore
        const value = log.args.value.toString();

        const logIndex = log.logIndex;
        const transactionIndex = log.transactionIndex;

        return {
          contractId: contract.id,
          from: from.toLowerCase() as Hex,
          to: to.toLowerCase() as Hex,
          value,
          blockNumber: log.blockNumber,
          transactionIndex: transactionIndex,
          logIndex: logIndex,
        };
      })
      .filter((data) => data) as ERC20TransferEvent2[];

    const label = `createMany ${contract.address}`;
    console.time(label);
    if (data.length > 0) {
      await prisma.eRC20TransferEvent2.createMany({
        data,
        skipDuplicates: true,
      });
    }

    console.timeEnd(label);
  };

  await processLogs(client, TRANSFER_EVENT, fromBlock, processTransfers, contract, BigInt(2000));
};

const processChunk = async (
  client: PublicClient<HttpTransport, Chain>,
  contracts: ContractWithDeployedBlock[],
) => {
  for (const contract of contracts) {
    await indexTransferEvents(client, contract);
  }
};

export const indexERC20 = async () => {
  const chain = chains.mainnet;

  const promises = [];
  const CHUNK_SIZE = Math.ceil(CONTRACTS.length / NUM_MAINNET_CLIENTS);

  console.log(`Synching ${CONTRACTS.length} contracts using ${NUM_MAINNET_CLIENTS} nodes`);

  for (let i = 0; i < CONTRACTS.length; i += CHUNK_SIZE) {
    const clientIndex = i / CHUNK_SIZE;
    const client = getClient(chain, clientIndex);

    console.log(`Client ${clientIndex} syncing ${CHUNK_SIZE} contracts`);
    const chunk = CONTRACTS.slice(i, i + CHUNK_SIZE).reverse();

    promises.push(processChunk(client, chunk));
  }

  await Promise.all(promises);
};
