import React from 'react';
import { cn } from '@/lib/utils';

interface ChatBubbleProps {
  message: string;
  emoji: string;
  className?: string;
}

const ChatBubble: React.FC<ChatBubbleProps> = ({ message, emoji, className }) => {
  return (
    <div
      className={cn(
        "absolute -top-8 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-sm font-semibold px-3 py-1 rounded-full shadow-lg whitespace-nowrap",
        "flex items-center gap-1 animate-bounce-once",
        "before:content-[''] before:absolute before:bottom-[-6px] before:left-1/2 before:-translate-x-1/2 before:w-0 before:h-0 before:border-l-8 before:border-r-8 before:border-t-8 before:border-l-transparent before:border-r-transparent before:border-t-blue-600",
        className
      )}
      style={{ animationDelay: '0.5s' }}
    >
      <span>{message}</span>
      <span>{emoji}</span>
    </div>
  );
};

export default ChatBubble;