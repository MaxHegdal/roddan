import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    guildName: process.env.GUILD_NAME || "Your Guild Name",
    realmName: process.env.REALM_NAME || "Your Realm",
    region: process.env.REGION || "us"
  });
}