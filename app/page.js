'use client';

import { useState, useEffect, useMemo } from 'react';

export default function Home() {
  const [guildData, setGuildData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [classFilter, setClassFilter] = useState('');
  
  // Get guild info from environment variables with fallbacks
  const [guildConfig, setGuildConfig] = useState({
    guildName: "Loading...",
    realmName: "Loading...",
    region: "us"
  });
  
  // Fetch environment variables on the client side
  useEffect(() => {
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
  
  // Function to fetch guild data
  const fetchGuildData = async (forceRefresh = false) => {
    try {
      setLoading(true);
      setError(null);
      
      // Add refresh parameter to bypass cache if needed
      const url = forceRefresh ? '/api/warcraftlogs?refresh=true' : '/api/warcraftlogs';
      const response = await fetch(url);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `Failed to fetch data: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      setGuildData(data);
      setLastUpdated(new Date());
      setLoading(false);
    } catch (err) {
      console.error("Error fetching data:", err);
      setError(err.message);
      setLoading(false);
    }
  };
  
  // Fetch data on component mount
  useEffect(() => {
    fetchGuildData();
  }, []);
  
  // Filter and sort players
  const filteredAndSortedPlayers = [...(guildData || [])]
    .filter(player => {
      // Apply search filter
      const matchesSearch = searchTerm === '' || 
        player.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        player.spec.toLowerCase().includes(searchTerm.toLowerCase());
      
      // Apply class filter
      const matchesClass = classFilter === '' || player.class === classFilter;
      
      return matchesSearch && matchesClass;
    })
    .sort((a, b) => b.score - a.score);
    
  // Calculate average scores by boss across all players
  const bossSummary = useMemo(() => {
    if (!guildData || guildData.length === 0) return {};
    
    // Get all boss names
    const allBosses = new Set();
    guildData.forEach(player => {
      Object.keys(player.bossScores || {}).forEach(boss => allBosses.add(boss));
    });
    
    // Calculate average for each boss
    const summary = {};
    allBosses.forEach(boss => {
      const scores = guildData
        .filter(player => player.bossScores && player.bossScores[boss])
        .map(player => player.bossScores[boss]);
      
      if (scores.length > 0) {
        const average = scores.reduce((sum, score) => sum + score, 0) / scores.length;
        summary[boss] = {
          average: Math.round(average),
          count: scores.length
        };
      }
    });
    
    return summary;
  }, [guildData]);
  
  // Sort boss names by average score
  const sortedBossNames = useMemo(() => {
    return Object.keys(bossSummary).sort((a, b) => bossSummary[b].average - bossSummary[a].average);
  }, [bossSummary]);
  
  // Get all unique classes for the filter
  const uniqueClasses = [...new Set(guildData.map(player => player.class))].sort();
  
  // Calculate guild average score
  const averageScore = guildData.length > 0 
    ? Math.round(guildData.reduce((sum, player) => sum + player.score, 0) / guildData.length) 
    : 0;
  
  // Calculate average item level
  const averageItemLevel = guildData.length > 0 && guildData.some(p => p.itemLevel)
    ? Math.round(guildData.reduce((sum, player) => sum + (player.itemLevel || 0), 0) / guildData.filter(p => p.itemLevel).length) 
    : 0;
    
  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      <div className="container mx-auto px-4 py-8">
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2">
            {guildConfig.guildName} Leaderboard
          </h1>
          <p className="text-gray-400">
            {guildConfig.realmName} ({guildConfig.region.toUpperCase()})
          </p>
          
          {/* Refresh buttons */}
          <div className="mt-4 flex gap-2 justify-center">
            <button 
              onClick={() => fetchGuildData(false)}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded inline-flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Refreshing...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                  </svg>
                  <span>Quick Refresh</span>
                </>
              )}
            </button>
            
            <button 
              onClick={() => fetchGuildData(true)}
              disabled={loading}
              className="bg-amber-600 hover:bg-amber-700 text-white font-medium py-2 px-4 rounded inline-flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
              title="Force full refresh from Warcraft Logs API (slower but up-to-date)"
            >
              {loading ? (
                <span>Refreshing...</span>
              ) : (
                <>
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
                  </svg>
                  <span>Force Update</span>
                </>
              )}
            </button>
          </div>
          
          {/* Guild stats summary */}
          {!loading && !error && (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-gray-800 rounded-lg p-4">
                <div className="text-xl font-semibold">{guildData.length}</div>
                <div className="text-gray-400 text-sm">Active Raiders</div>
              </div>
              <div className="bg-gray-800 rounded-lg p-4">
                <div className="text-xl font-semibold">{averageScore}</div>
                <div className="text-gray-400 text-sm">Average Parse</div>
              </div>
              <div className="bg-gray-800 rounded-lg p-4">
                <div className="text-xl font-semibold">{averageItemLevel}</div>
                <div className="text-gray-400 text-sm">Average iLvl</div>
              </div>
            </div>
          )}
        </header>
        
        {!loading && !error && sortedBossNames.length > 0 && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold mb-4">Guild Raid Performance</h2>
            <div className="bg-gray-800 rounded-lg shadow-lg p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {sortedBossNames.map(bossName => (
                  <div key={bossName} className="bg-gray-700 rounded-lg p-4">
                    <h3 className="font-semibold text-lg mb-2">{bossName}</h3>
                    <div className="flex items-center">
                      <div className="w-full bg-gray-600 rounded-full h-4 mr-2">
                        <div 
                          className={`h-4 rounded-full ${getRankColorClass(bossSummary[bossName].average)}`} 
                          style={{ width: `${bossSummary[bossName].average}%` }}
                        ></div>
                      </div>
                      <span className={`${getRankColor(bossSummary[bossName].average)} font-bold`}>
                        {bossSummary[bossName].average}
                      </span>
                    </div>
                    <p className="text-gray-400 text-sm mt-1">
                      {bossSummary[bossName].count} players with logs
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        
        {!loading && !error && (
          <div className="mb-6 flex flex-col md:flex-row md:justify-between md:items-center gap-4">
            {/* Search input */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <svg className="w-4 h-4 text-gray-500" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 20">
                  <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m19 19-4-4m0-7A7 7 0 1 1 1 8a7 7 0 0 1 14 0Z"/>
                </svg>
              </div>
              <input 
                type="text" 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="block w-full p-2 pl-10 text-sm text-gray-300 border border-gray-600 rounded-lg bg-gray-800 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Search by name or spec..." 
              />
            </div>
            
            {/* Class filter */}
            <div>
              <select
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
                className="bg-gray-800 border border-gray-600 text-gray-300 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2"
              >
                <option value="">All Classes</option>
                {uniqueClasses.map(className => (
                  <option key={className} value={className}>{className}</option>
                ))}
              </select>
            </div>
            
            {/* Results counter */}
            <div className="text-gray-400 text-sm">
              Showing {filteredAndSortedPlayers.length} of {guildData.length} players
            </div>
          </div>
        )}
        
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="mt-4 text-xl">Loading guild data...</p>
          </div>
        ) : error ? (
          <div className="bg-red-900 border border-red-700 text-red-100 px-6 py-4 rounded-lg">
            <h3 className="text-xl font-bold mb-2">Error Loading Data</h3>
            <p>{error}</p>
            <div className="mt-4 text-sm opacity-80">
              <p>Check that:</p>
              <ul className="list-disc pl-5 mt-2">
                <li>Your API credentials are correctly set in the environment variables</li>
                <li>Your guild name, realm, and region are correct</li>
                <li>The Warcraft Logs API is available</li>
              </ul>
            </div>
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
                <tbody className="divide-y divide-gray-700">
                  {filteredAndSortedPlayers.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="px-4 py-3 text-center text-gray-400">
                        {searchTerm || classFilter ? "No matching players found" : "No player data found"}
                      </td>
                    </tr>
                  ) : (
                    filteredAndSortedPlayers.map((player, index) => (
                      <tr 
                        key={player.id} 
                        className={`hover:bg-gray-700 ${
                          index === 0 ? 'bg-yellow-900 bg-opacity-30' : 
                          index === 1 ? 'bg-gray-500 bg-opacity-30' : 
                          index === 2 ? 'bg-amber-900 bg-opacity-30' : ''
                        }`}
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
                          {/* Best performances tooltip */}
                          {player.bestPerformances && player.bestPerformances.length > 0 && (
                            <div className="mt-1 text-xs text-gray-400">
                              {player.bestPerformances.map((perf, i) => (
                                <a 
                                  key={i} 
                                  href={`https://www.warcraftlogs.com/reports/${perf.reportID}#fight=${perf.fightID}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={`inline-block mr-2 ${getRankColor(perf.score)}`}
                                  title={`${perf.boss}: ${perf.score} parse`}
                                >
                                  {perf.score}
                                </a>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className={`px-4 py-3 ${getClassColor(player.class)}`}>
                          <div className="flex items-center">
                            {player.classSlug && (
                              <img 
                                src={getClassIconUrl(player.classSlug)} 
                                alt={player.class}
                                className="w-6 h-6 mr-2 rounded"
                                onError={(e) => { e.target.style.display = 'none' }}
                              />
                            )}
                            {player.class}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-300">
                          <div className="flex items-center">
                            {player.classSlug && player.specSlug && (
                              <img 
                                src={getSpecIconUrl(player.classSlug, player.specSlug)} 
                                alt={player.spec}
                                className="w-6 h-6 mr-2 rounded"
                                onError={(e) => { e.target.style.display = 'none' }}
                              />
                            )}
                            {player.spec ? player.spec : "Unknown"}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-300">{player.itemLevel ? player.itemLevel : "N/A"}</td>
                        <td className="px-4 py-3">
                          <span className={`${getRankColor(player.score)} font-medium`}>
                            {player.score || "-"}
                          </span>
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
                Last updated: {lastUpdated ? lastUpdated.toLocaleString() : 'Never'}
              </p>
              <div className="flex justify-between items-center">
                <p className="text-gray-500 text-xs mt-1">
                  Data sourced from <a href="https://www.warcraftlogs.com/" className="text-blue-400 hover:underline" target="_blank" rel="noopener noreferrer">Warcraft Logs</a>
                </p>
                <div className="text-xs text-gray-500 flex items-center">
                  <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1"></span>
                  <span>Showing {filteredAndSortedPlayers.length} of {guildData.length} members</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
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

// Helper function to get class icon URL
function getClassIconUrl(classSlug) {
  return `https://assets.worldofwarcraft.com/static/components/GameIcon/GameIcon-class-${classSlug.toLowerCase()}.jpg`;
}

// Helper function to get spec icon URL
function getSpecIconUrl(classSlug, specSlug) {
  return `https://assets.worldofwarcraft.com/static/components/GameIcon/GameIcon-class-${classSlug.toLowerCase()}-${specSlug.toLowerCase()}.jpg`;
}

// Helper function to get color based on parse ranking
function getRankColor(score) {
  if (score >= 95) return 'text-orange-400'; // Legendary
  if (score >= 75) return 'text-purple-400'; // Epic
  if (score >= 50) return 'text-blue-400';   // Rare
  if (score >= 25) return 'text-green-400';  // Uncommon
  return 'text-gray-400';                    // Common
}

// Helper function to get background color class based on parse ranking
function getRankColorClass(score) {
  if (score >= 95) return 'bg-orange-400'; // Legendary
  if (score >= 75) return 'bg-purple-400'; // Epic
  if (score >= 50) return 'bg-blue-400';   // Rare
  if (score >= 25) return 'bg-green-400';  // Uncommon
  return 'bg-gray-400';                    // Common
}