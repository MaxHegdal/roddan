// app/api/warcraftlogs/route.js
import { NextResponse } from 'next/server';
import axios from 'axios';

export async function GET() {
  const useMockData = false;

  if (useMockData) {
    console.log('Using mock data');
    return NextResponse.json(generateMockData());
  }

  const guildName = process.env.GUILD_NAME || "Roddan";
  const realmName = process.env.REALM_NAME || "your_realm_name";
  const regionSlug = process.env.REGION || "eu";

  const clientId = process.env.WARCRAFT_LOGS_CLIENT_ID;
  const clientSecret = process.env.WARCRAFT_LOGS_CLIENT_SECRET;

  try {
    // Get the access token
    const tokenResponse = await axios.post(
      'https://www.warcraftlogs.com/oauth/token',
      'grant_type=client_credentials',
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        auth: { username: clientId, password: clientSecret }
      }
    );
    const accessToken = tokenResponse.data.access_token;

    // Convert realm name to slug format
    const serverSlug = realmName.replace(/\s+/g, '-').toLowerCase();
    
    console.log(`Fetching data for guild: ${guildName} on ${serverSlug}-${regionSlug}`);

    // First, get the guild members with basic info
    const guildQuery = `
      query ($guildName: String!, $serverRegion: String!, $serverSlug: String!) {
        guildData {
          guild(name: $guildName, serverRegion: $serverRegion, serverSlug: $serverSlug) {
            id
            name
            members {
              data {
                id
                name
                classID
                hidden
                server {
                  slug
                  name
                  region {
                    slug
                  }
                }
              }
            }
          }
        }
      }
    `;

    const variables = { 
      guildName, 
      serverRegion: regionSlug, 
      serverSlug 
    };

    // Get guild data
    const guildResponse = await axios.post(
      'https://www.warcraftlogs.com/api/v2/client',
      { query: guildQuery, variables },
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
    );

    if (guildResponse.data.errors) {
      console.error('GraphQL errors:', guildResponse.data.errors);
      return NextResponse.json({ error: 'GraphQL error', errors: guildResponse.data.errors });
    }

    const guild = guildResponse.data.data?.guildData?.guild;
    if (!guild) {
      return NextResponse.json({ error: 'Guild not found' }, { status: 404 });
    }

    const members = guild.members?.data || [];
    console.log(`Found ${members.length} guild members in API response`);

    // Class mapping from ID to name
    const classMapping = {
      1: 'Warrior', 2: 'Paladin', 3: 'Hunter', 4: 'Rogue', 5: 'Priest',
      6: 'Death Knight', 7: 'Shaman', 8: 'Mage', 9: 'Warlock', 10: 'Monk',
      11: 'Druid', 12: 'Demon Hunter', 13: 'Evoker'
    };

    // Process all non-hidden members
    const membersToProcess = members.filter(m => !m.hidden);
    const processedMembers = [];

    // The War Within latest raid zone ID is 36 (Nerub-ar Palace)
    const latestRaidZoneId = 39;
    // Heroic difficulty is usually 4
    const heroicDifficulty = 4;

    // Process each member to get their rankings
    for (const member of membersToProcess) {
      try {
        // Get the region slug from the server
        const memberRegionSlug = member.server.region?.slug || regionSlug;
        
        // Query for character rankings with specific zoneID and difficulty
        const rankingsQuery = `
          query {
            characterData {
              character(name: "${member.name}", serverSlug: "${member.server.slug}", serverRegion: "${memberRegionSlug}") {
                zoneRankings(zoneID: ${latestRaidZoneId}, difficulty: ${heroicDifficulty}, metric: dps)
                gameData
              }
            }
          }
        `;

        const rankResponse = await axios.post(
          'https://www.warcraftlogs.com/api/v2/client',
          { query: rankingsQuery },
          { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
        );

        let score = 0;
        let spec = "Unknown";
        const rankData = rankResponse.data.data?.characterData?.character?.zoneRankings;
        const gameData = rankResponse.data.data?.characterData?.character?.gameData;

        if (rankData) {
          try {
            // Check if rankData is already an object or needs parsing
            const parsedRanks = typeof rankData === 'string' 
              ? JSON.parse(rankData) 
              : rankData;
            
            score = parsedRanks.bestPerformanceAverage || 0;
            spec = parsedRanks.spec || "Unknown";
            
            console.log(`Successfully processed rankings for ${member.name}: Score=${score}, Spec=${spec}`);
          } catch (e) {
            console.error(`Failed to parse rankings for ${member.name}:`, e);
            console.error('Raw rankData type:', typeof rankData);
            if (typeof rankData === 'string') {
              console.error('First 100 chars:', rankData.substring(0, 100));
            }
          }
        }

        // Parse game data for additional info if available
        let itemLevel = 0;
        if (gameData) {
          try {
            const parsedGameData = typeof gameData === 'string'
              ? JSON.parse(gameData)
              : gameData;
            
            itemLevel = parsedGameData.itemLevel || 0;
          } catch (e) {
            console.error(`Failed to parse game data for ${member.name}:`, e);
          }
        }

        processedMembers.push({
          id: member.id,
          name: member.name,
          class: classMapping[member.classID] || 'Unknown',
          spec: spec,
          score: Math.round(score),
          itemLevel: itemLevel,
          server: member.server.name
        });
      } catch (e) {
        console.error(`Failed to get rankings for ${member.name}:`, e);
        processedMembers.push({
          id: member.id,
          name: member.name,
          class: classMapping[member.classID] || 'Unknown',
          spec: "Unknown",
          score: 0,
          itemLevel: 0,
          server: member.server.name
        });
      }

      // Sleep for a short time to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // Sort all members by score
    const sortedMembers = processedMembers.sort((a, b) => b.score - a.score);

    return NextResponse.json(sortedMembers);
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    return NextResponse.json({ error: 'API request failed' }, { status: 500 });
  }
}

function generateMockData() {
  return Array.from({ length: 10 }, (_, i) => ({
    id: `player-${i}`,
    name: `Player${i}`,
    class: ['Warrior', 'Mage', 'Paladin', 'Hunter'][i % 4],
    spec: ['Arms', 'Fire', 'Holy', 'Beast Mastery'][i % 4],
    score: 95 - (i * 5),
    itemLevel: 490 - (i * 2),
    server: "YourServer"
  }));
}