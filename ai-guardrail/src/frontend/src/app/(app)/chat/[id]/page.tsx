"use client";

import { ChatContainer } from "@/components/chat/ChatContainer";
import { useParams } from "next/navigation";

export default function ConversationPage() {
  const params = useParams();
  const id = params.id as string;

  return <ChatContainer conversationId={id} />;
}
