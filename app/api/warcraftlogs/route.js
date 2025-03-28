// app/api/warcraftlogs/route.js
import { NextResponse } from 'next/server';
import axios from 'axios';

// Simple in-memory cache
let cachedData = null;
let cacheTimestamp = null;
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes in milliseconds

export async function GET(request) {
  // Check if force refresh is requested
  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get('refresh') === 'true';
  
  // Set to true for testing without API credentials
  const useMockData = false;
  
  // Return cached data if available and not expired
  if (!forceRefresh && cachedData && cacheTimestamp && (Date.now() - cacheTimestamp < CACHE_DURATION)) {
    console.log('Returning cached data from', new Date(cacheTimestamp).toLocaleTimeString());
    return NextResponse.json(cachedData);
  }

  if (useMockData) {
    console.log('Using mock data');
    const mockData = generateMockData();
    cachedData = mockData;
    cacheTimestamp = Date.now();
    return NextResponse.json(mockData);
  }

  // Get environment variables with fallbacks
  const guildName = process.env.GUILD_NAME || "Roddan";
  const realmName = process.env.REALM_NAME || "your_realm_name";
  const regionSlug = process.env.REGION || "eu";
  const latestRaidZoneId = parseInt(process.env.LATEST_RAID_ZONE_ID || "39");
  const heroicDifficulty = parseInt(process.env.RAID_DIFFICULTY || "4");

  const clientId = process.env.WARCRAFT_LOGS_CLIENT_ID;
  const clientSecret = process.env.WARCRAFT_LOGS_CLIENT_SECRET;

  // Validate required credentials
  if (!clientId || !clientSecret) {
    console.error('Missing Warcraft Logs API credentials');
    return NextResponse.json({ 
      error: 'Missing API credentials',
      message: 'Please configure WARCRAFT_LOGS_CLIENT_ID and WARCRAFT_LOGS_CLIENT_SECRET in your environment variables'
    }, { status: 500 });
  }

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
    console.log(`Using raid zone ID: ${latestRaidZoneId}, difficulty: ${heroicDifficulty}`);

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
      return NextResponse.json({ error: 'Guild not found', message: `Could not find guild "${guildName}" on ${serverSlug}-${regionSlug}` }, { status: 404 });
    }

    // Fetch game classes data for more detailed class/spec information
    const gameClassesQuery = `
      query {
        gameData {
          classes {
            id
            name
            slug
            specs {
              id
              name
              slug
            }
          }
        }
      }
    `;

    const classesResponse = await axios.post(
      'https://www.warcraftlogs.com/api/v2/client',
      { query: gameClassesQuery },
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }
    );
    
    const gameClasses = classesResponse.data.data?.gameData?.classes || [];

    // Create mappings for class and spec data
    const classMap = {};
    gameClasses.forEach(gameClass => {
      classMap[gameClass.id] = {
        name: gameClass.name,
        slug: gameClass.slug,
        specs: {}
      };
      
      if (gameClass.specs) {
        gameClass.specs.forEach(spec => {
          classMap[gameClass.id].specs[spec.id] = {
            name: spec.name,
            slug: spec.slug
          };
        });
      }
    });

    const members = guild.members?.data || [];
    console.log(`Found ${members.length} guild members in API response`);

    // Process all non-hidden members
    const membersToProcess = members.filter(m => !m.hidden);
    const processedMembers = [];

    // Limit the number of characters to process for faster results (adjust as needed)
    const MAX_CHARACTERS = 25;
    const limitedMembersToProcess = membersToProcess.slice(0, MAX_CHARACTERS);
    
    console.log(`Processing ${limitedMembersToProcess.length} out of ${membersToProcess.length} members for faster results`);
    
    // Process characters in batches of 5 in parallel to speed up fetching
    const BATCH_SIZE = 5;
    for (let i = 0; i < limitedMembersToProcess.length; i += BATCH_SIZE) {
      const batch = limitedMembersToProcess.slice(i, i + BATCH_SIZE);
      
      // Process batch in parallel
      await Promise.all(batch.map(async (member) => {
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
                  specRankings: zoneRankings(zoneID: ${latestRaidZoneId}, difficulty: ${heroicDifficulty}, metric: dps, includeCombatantInfo: true)
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
          let specId = null;
          let progress = "0/9"; // Default progress
          let bossScores = {};
          let bestPerformances = [];
          const rankData = rankResponse.data.data?.characterData?.character?.zoneRankings;
          const specRankData = rankResponse.data.data?.characterData?.character?.specRankings;
          const gameData = rankResponse.data.data?.characterData?.character?.gameData;
  
          if (rankData) {
            try {
              // Check if rankData is already an object or needs parsing
              const parsedRanks = typeof rankData === 'string' 
                ? JSON.parse(rankData) 
                : rankData;
              
              score = parsedRanks.bestPerformanceAverage || 0;
              spec = parsedRanks.spec || "Unknown";
              specId = parsedRanks.specID;
              
              // Extract raid progress if available
              if (parsedRanks.totalKills !== undefined && parsedRanks.totalBosses !== undefined) {
                progress = `${parsedRanks.totalKills}/${parsedRanks.totalBosses}`;
              }
              
              // Extract individual boss performances if available
              if (parsedRanks.rankings) {
                parsedRanks.rankings.forEach(ranking => {
                  if (ranking.rankPercent) {
                    bossScores[ranking.encounter.name] = Math.round(ranking.rankPercent);
                    
                    bestPerformances.push({
                      boss: ranking.encounter.name,
                      score: Math.round(ranking.rankPercent),
                      reportID: ranking.reportID,
                      fightID: ranking.fightID
                    });
                  }
                });
              }
            } catch (e) {
              console.error(`Failed to parse rankings for ${member.name}:`, e);
            }
          }
          
          // Try to get more detailed spec information from specRankData if available
          if (!spec || spec === "Unknown") {
            try {
              if (specRankData) {
                const parsedSpecRanks = typeof specRankData === 'string'
                  ? JSON.parse(specRankData)
                  : specRankData;
                  
                if (parsedSpecRanks.spec) {
                  spec = parsedSpecRanks.spec;
                }
              }
            } catch (e) {
              console.error(`Failed to parse spec data for ${member.name}:`, e);
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
  
          // Get the class and spec information from our map
          const classInfo = classMap[member.classID] || { name: 'Unknown', slug: 'unknown', specs: {} };
          let specInfo = { name: spec, slug: spec.toLowerCase().replace(/\s+/g, '-') };
          
          // If we have a specId, try to get detailed spec info
          if (specId && classInfo.specs[specId]) {
            specInfo = classInfo.specs[specId];
          }
          
          processedMembers.push({
            id: member.id,
            name: member.name,
            class: classInfo.name,
            classId: member.classID,
            classSlug: classInfo.slug,
            spec: specInfo.name,
            specSlug: specInfo.slug,
            score: Math.round(score),
            itemLevel: itemLevel,
            server: member.server.name,
            progress: progress,
            bossScores: bossScores,
            bestPerformances: bestPerformances.sort((a, b) => b.score - a.score).slice(0, 3) // Top 3 performances
          });
        } catch (e) {
          console.error(`Failed to get rankings for ${member.name}:`, e);
          
          // Get the class information from our map
          const classInfo = classMap[member.classID] || { name: 'Unknown', slug: 'unknown', specs: {} };
          
          processedMembers.push({
            id: member.id,
            name: member.name,
            class: classInfo.name,
            classId: member.classID,
            classSlug: classInfo.slug,
            spec: "Unknown",
            specSlug: "unknown",
            score: 0,
            itemLevel: 0,
            server: member.server.name,
            progress: "0/9",
            bossScores: {},
            bestPerformances: []
          });
        }
      }));
      
      // Add a small delay between batches to avoid rate limiting
      if (i + BATCH_SIZE < limitedMembersToProcess.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    // Add remaining members with default values if we limited the processing
    if (membersToProcess.length > MAX_CHARACTERS) {
      const remainingMembers = membersToProcess.slice(MAX_CHARACTERS);
      for (const member of remainingMembers) {
        const classInfo = classMap[member.classID] || { name: 'Unknown', slug: 'unknown', specs: {} };
        
        processedMembers.push({
          id: member.id,
          name: member.name,
          class: classInfo.name,
          classId: member.classID,
          classSlug: classInfo.slug,
          spec: "Not fetched",
          specSlug: "not-fetched",
          score: 0,
          itemLevel: 0,
          server: member.server.name,
          progress: "0/9",
          bossScores: {},
          bestPerformances: []
        });
      }
    }

    // Sort all members by score
    const sortedMembers = processedMembers.sort((a, b) => b.score - a.score);
    
    // Update cache
    cachedData = sortedMembers;
    cacheTimestamp = Date.now();
    
    return NextResponse.json(sortedMembers);
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    return NextResponse.json({ 
      error: 'API request failed', 
      message: error.response?.data?.error || error.message 
    }, { status: 500 });
  }
}

function generateMockData() {
  console.log('Generating mock data for quick testing');
  
  const bosses = [
    "Vael'thyz the Corruptor",
    "Delerium Dreadsmoke",
    "Volcoross",
    "Slegix the Cruel",
    "Tindral Sageswift",
    "Primordial Elements",
    "Smolderon",
    "Tyr, the Infinite Keeper",
    "Fyrakk"
  ];
  
  const playerData = [
    { name: "Powerhealer", class: "Priest", classSlug: "priest", spec: "Holy", specSlug: "holy", score: 97, itemLevel: 489, progress: "9/9" },
    { name: "Tankbuster", class: "Warrior", classSlug: "warrior", spec: "Protection", specSlug: "protection", score: 94, itemLevel: 487, progress: "9/9" },
    { name: "Shadowmaster", class: "Warlock", classSlug: "warlock", spec: "Destruction", specSlug: "destruction", score: 91, itemLevel: 486, progress: "8/9" },
    { name: "Arrowstorm", class: "Hunter", classSlug: "hunter", spec: "Marksmanship", specSlug: "marksmanship", score: 89, itemLevel: 485, progress: "9/9" },
    { name: "Frostbite", class: "Mage", classSlug: "mage", spec: "Frost", specSlug: "frost", score: 88, itemLevel: 484, progress: "8/9" },
    { name: "Lightbringer", class: "Paladin", classSlug: "paladin", spec: "Retribution", specSlug: "retribution", score: 85, itemLevel: 483, progress: "7/9" },
    { name: "Windwalker", class: "Monk", classSlug: "monk", spec: "Windwalker", specSlug: "windwalker", score: 83, itemLevel: 482, progress: "8/9" },
    { name: "Stormcaller", class: "Shaman", classSlug: "shaman", spec: "Elemental", specSlug: "elemental", score: 80, itemLevel: 480, progress: "7/9" },
    { name: "Moonfire", class: "Druid", classSlug: "druid", spec: "Balance", specSlug: "balance", score: 77, itemLevel: 479, progress: "6/9" },
    { name: "Deathstrike", class: "Death Knight", classSlug: "death-knight", spec: "Blood", specSlug: "blood", score: 75, itemLevel: 478, progress: "7/9" },
    { name: "Chaoshunter", class: "Demon Hunter", classSlug: "demon-hunter", spec: "Havoc", specSlug: "havoc", score: 72, itemLevel: 477, progress: "6/9" },
    { name: "Firebreather", class: "Evoker", classSlug: "evoker", spec: "Devastation", specSlug: "devastation", score: 70, itemLevel: 476, progress: "5/9" },
    { name: "Backstabber", class: "Rogue", classSlug: "rogue", spec: "Subtlety", specSlug: "subtlety", score: 67, itemLevel: 475, progress: "6/9" },
    { name: "Soulstealer", class: "Warlock", classSlug: "warlock", spec: "Affliction", specSlug: "affliction", score: 64, itemLevel: 474, progress: "5/9" },
    { name: "Berserker", class: "Warrior", classSlug: "warrior", spec: "Fury", specSlug: "fury", score: 60, itemLevel: 473, progress: "4/9" },
    { name: "Healbot", class: "Shaman", classSlug: "shaman", spec: "Restoration", specSlug: "restoration", score: 55, itemLevel: 471, progress: "4/9" },
    { name: "Arcanist", class: "Mage", classSlug: "mage", spec: "Arcane", specSlug: "arcane", score: 50, itemLevel: 468, progress: "3/9" },
    { name: "Lifegiver", class: "Druid", classSlug: "druid", spec: "Restoration", specSlug: "restoration", score: 45, itemLevel: 465, progress: "3/9" },
    { name: "Vengeance", class: "Demon Hunter", classSlug: "demon-hunter", spec: "Vengeance", specSlug: "vengeance", score: 40, itemLevel: 462, progress: "2/9" },
    { name: "Shadowpriest", class: "Priest", classSlug: "priest", spec: "Shadow", specSlug: "shadow", score: 35, itemLevel: 458, progress: "2/9" }
  ];
  
  // Process player data with boss scores and performances
  return playerData.map((player, index) => {
    // Generate random boss scores
    const bossScores = {};
    const bestPerformances = [];
    
    bosses.forEach(boss => {
      // Base score on player's overall score with random variation
      const bossScore = Math.min(99, Math.max(1, 
        Math.round(player.score + (Math.random() * 20 - 10))
      ));
      
      bossScores[boss] = bossScore;
      
      bestPerformances.push({
        boss: boss,
        score: bossScore,
        reportID: `report-${Math.random().toString(36).substring(2, 10)}`,
        fightID: Math.floor(Math.random() * 100)
      });
    });
    
    return {
      ...player,
      id: `player-${index}`,
      server: "YourServer",
      bossScores: bossScores,
      bestPerformances: bestPerformances.sort((a, b) => b.score - a.score).slice(0, 3)
    };
  });
}