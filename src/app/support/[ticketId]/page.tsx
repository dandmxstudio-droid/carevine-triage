import { notFound } from "next/navigation";
import { loadData } from "@/lib/load-data";
import { TicketView } from "@/components/ticket-view";
export function generateStaticParams() {
  return loadData().tickets.map((t) => ({ ticketId: t.ticket_id }));
}
export default async function Page({
  params,
}: {
  params: Promise<{ ticketId: string }>;
}) {
  const { ticketId } = await params;
  if (!loadData().tickets.some((t) => t.ticket_id === ticketId)) notFound();
  return <TicketView id={ticketId} key={ticketId} />;
}
