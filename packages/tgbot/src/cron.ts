import axios from 'axios';
import bot from './bot';
import prisma from './prisma';
import { Cred, Venue } from '@prisma/client';
import { ParsedCast, ParsedLensPost } from './types';
import { Input } from 'telegraf';

// Send casts to chats
export const sendPackagedCasts = async (chatIds: string[]) => {
  for (const chatId of chatIds) {
    console.time('get unsent casts');

    // Get all casts that haven't been sent to `chatId`
    const unsentPackagedCast = await prisma.packagedCast.findMany({
      include: { PackagedCastSent: true },
      where: {
        cred: Cred.Over100Txs,
        venue: Venue.Farcaster,
        PackagedCastSent: {
          none: {
            chatId,
          },
        },
      },
      take: 20,
    });

    console.timeEnd('get unsent casts');

    if (unsentPackagedCast.length === 0) {
      await bot.telegram.sendMessage(chatId, `You're up to date.`);
      continue;
    }

    // TODO: Send out casts without attachments asynchronously first
    // to lower the perceived latency

    for (const cast of unsentPackagedCast) {
      const images = [cast.ogpImage, ...cast.images];
      const warpcastUrl = `https://warpcast.com/${cast.username}/${cast.hash}`;

      for (let i = 0; i < images.length; i++) {
        const image = images[i];
        try {
          // Get image as buffer
          const { data } = await axios.get(image, {
            responseType: 'arraybuffer',
          });

          const isLastImage = i === images.length - 1;
          if (isLastImage) {
            const etherscanUrl = `https://etherscan.io/address/${cast.address}`;
            await bot.telegram.sendPhoto(chatId, Input.fromBuffer(data), {
              caption: warpcastUrl,
            });
            await bot.telegram.sendMessage(
              chatId,
              `\\([Caster](${etherscanUrl}) has \\> 100 txs on ETH mainnet\\\)`,
              {
                parse_mode: 'MarkdownV2',
                disable_web_page_preview: true,
              },
            );
          } else {
            await bot.telegram.sendPhoto(chatId, Input.fromBuffer(data));
          }
        } catch (err) {
          console.log(err);
        }
      }
    }

    console.time('save sent casts');
    await prisma.packagedCastSent.createMany({
      data: unsentPackagedCast.map((packagedCast) => ({
        chatId,
        packagedCastId: packagedCast.id,
      })),
    });
    console.timeEnd('save sent casts');
  }
};

// Send daily casts to all subscribed chats
export const sendDailyCasts = async () => {
  // Get all chats
  const chatIds = (
    await prisma.tGChat.findMany({
      select: {
        chatId: true,
      },
      where: {
        dailyUpdatesEnabled: true,
      },
    })
  ).map((chat) => chat.chatId);

  await sendPackagedCasts(chatIds);
};
