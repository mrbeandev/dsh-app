import { createContext } from 'react';

/**
 * Scroll access for rows inside the chat's inverted list. In an inverted list a row that grows
 * pushes its own header (and everything above it) up; expanding rows use this to scroll by the same
 * amount each frame so the header stays where it was tapped and the content opens downward.
 * Null outside the chat list (rows then just grow normally).
 */
export type ChatScroll = { offset: () => number; scrollTo: (y: number) => void };
export const ChatScrollContext = createContext<ChatScroll | null>(null);
