import Room from "@/components/Room";

export async function generateMetadata({ params }) {
  const { code } = await params;
  return { title: `Live sheet ${code.slice(0, 5)}` };
}

export default async function RoomPage({ params }) {
  const { code } = await params;
  return <Room code={code} />;
}
