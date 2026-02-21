import { prisma } from "@/lib/prisma";

const LINK_REGEX = /(https?:\/\/|www\.)\S+/gi;

const MIN_ACCOUNT_AGE_MINUTES_FOR_LINKS = 10;
const NEW_ACCOUNT_WINDOW_HOURS = 24;
const NEW_ACCOUNT_MAX_LINKS = 2;

interface AntiSpamCheck {
  status: number;
  message: string;
}

export async function validateForumContentSafety(
  userId: string,
  content: string,
  title?: string
): Promise<AntiSpamCheck | null> {
  const combinedText = [title, content].filter(Boolean).join(" ");
  const links = combinedText.match(LINK_REGEX) || [];
  const linkCount = links.length;

  if (linkCount === 0) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { createdAt: true },
  });

  if (!user) {
    return { status: 401, message: "User not found." };
  }

  const minutesOld = (Date.now() - user.createdAt.getTime()) / 60000;

  if (minutesOld < MIN_ACCOUNT_AGE_MINUTES_FOR_LINKS) {
    return {
      status: 403,
      message: `Accounts must be at least ${MIN_ACCOUNT_AGE_MINUTES_FOR_LINKS} minutes old before posting links.`,
    };
  }

  const hoursOld = minutesOld / 60;
  if (hoursOld < NEW_ACCOUNT_WINDOW_HOURS && linkCount > NEW_ACCOUNT_MAX_LINKS) {
    return {
      status: 400,
      message: `New accounts can include up to ${NEW_ACCOUNT_MAX_LINKS} links per post for the first ${NEW_ACCOUNT_WINDOW_HOURS} hours. Please remove extra links or try again later.`,
    };
  }

  return null;
}
