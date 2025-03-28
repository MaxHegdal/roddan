// app/page.js
'use client';

import { useState, useEffect } from 'react';

export default function Home() {
  const [guildData, setGuildData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Get guild info from environment variables with fallbacks
  const [guildConfig, setGuildConfig] = useState({
    guildName: "Loading...",
    realmName: "Loading...",
    region: "us"
  });
  
  // Fetch environment variables on the client side
  useEffect(() => {
    // This function will be called when the component mounts
    async function fetchConfig() {
      try {
        const response = await fetch('/api/config');
        const data = await response.json();
        setGuildConfig({
          guildName: data.guildName,
          realmName: data.realmName,
          region: data.region
        });
      } catch (err) {
        console.error("Error fetching config:", err);
        // Keep the default values
      }
    }
    
    fetchConfig();
  }, []);
  
  useEffect(() => {
    async function fetchGuildData() {
      try {
        setLoading(true);
        
        // Updated API route path for App Router
        const response = await fetch('/api/warcraftlogs');
        
        if (!response.ok) {
          throw new Error(`Failed to fetch data: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        setGuildData(data);
        setLoading(false);
      } catch (err) {
        console.error("Error fetching data:", err);
        setError(err.message);
        setLoading(false);
      }
    }
    
    fetchGuildData();
  }, []);
  
  // Sort players by their overall ranking
  const sortedPlayers = [...(guildData || [])].sort((a, b) => b.score - a.score);
  
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-4xl font-bold text-center mb-8">
        {guildConfig.guildName} Leaderboard
      </h1>
      
      {loading ? (
        <div className="text-center">
          <p className="text-xl">Loading guild data...</p>
        </div>
      ) : error ? (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          <p>{error}</p>
        </div>
      ) : (
        <div className="bg-gray-800 rounded-lg shadow-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full table-auto">
              <thead className="bg-gray-900">
                <tr>
                  <th className="px-4 py-3 text-left text-gray-200">Rank</th>
                  <th className="px-4 py-3 text-left text-gray-200">Character</th>
                  <th className="px-4 py-3 text-left text-gray-200">Class</th>
                  <th className="px-4 py-3 text-left text-gray-200">Spec</th>
                  <th className="px-4 py-3 text-left text-gray-200">iLvl</th>
                  <th className="px-4 py-3 text-left text-gray-200">Best Score</th>
                  <th className="px-4 py-3 text-left text-gray-200">Raid Progress</th>
                </tr>
              </thead>
              <tbody>
                {sortedPlayers.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="px-4 py-3 text-center text-gray-400">
                      No player data found
                    </td>
                  </tr>
                ) : (
                  sortedPlayers.map((player, index) => (
                    <tr 
                      key={player.id} 
                      className={`border-t border-gray-700 ${index === 0 ? 'bg-yellow-800 bg-opacity-30' : index === 1 ? 'bg-gray-500 bg-opacity-30' : index === 2 ? 'bg-amber-900 bg-opacity-30' : ''}`}
                    >
                      <td className="px-4 py-3 text-gray-200">{index + 1}</td>
                      <td className="px-4 py-3">
                        <a 
                          href={`https://www.warcraftlogs.com/character/${guildConfig.region}/${guildConfig.realmName}/${player.name}`}
                          className={`hover:underline font-medium ${getClassColor(player.class)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {player.name}
                        </a>
                      </td>
                      <td className={`px-4 py-3 ${getClassColor(player.class)}`}>{player.class}</td>
                      <td className="px-4 py-3 text-gray-300">{player.spec ? player.spec : "Unknown"}</td>
<td className="px-4 py-3 text-gray-300">{player.itemLevel ? player.itemLevel : "N/A"}</td>

                      <td className="px-4 py-3 text-gray-300">
                        <span className={getRankColor(player.score)}>{player.score || "-"}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-300">{player.progress || "-"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          
          <div className="p-4 bg-gray-900 border-t border-gray-700">
            <p className="text-gray-400 text-sm">
              Last updated: {new Date().toLocaleString()}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper function to get WoW class colors
function getClassColor(className) {
  const classColors = {
    'Death Knight': 'text-red-400',
    'Demon Hunter': 'text-purple-400',
    'Druid': 'text-orange-400',
    'Hunter': 'text-green-400',
    'Mage': 'text-blue-400',
    'Monk': 'text-teal-400',
    'Paladin': 'text-pink-400',
    'Priest': 'text-gray-200',
    'Rogue': 'text-yellow-400',
    'Shaman': 'text-blue-300',
    'Warlock': 'text-purple-300',
    'Warrior': 'text-amber-700',
    'Evoker': 'text-emerald-400'
  };
  
  return classColors[className] || 'text-gray-200';
}

// Helper function to get color based on parse ranking
function getRankColor(score) {
  if (score >= 95) return 'text-orange-400'; // Legendary
  if (score >= 75) return 'text-purple-400'; // Epic
  if (score >= 50) return 'text-blue-400';   // Rare
  if (score >= 25) return 'text-green-400';  // Uncommon
  return 'text-gray-400';                    // Common
}