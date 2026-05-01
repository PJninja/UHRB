import fs from 'fs';

const data = JSON.parse(fs.readFileSync('./simulate-results.json', 'utf8'));

const statCounts = {
  speed: { total: 0, gte3: 0, gte5: 0, gte6: 0 },
  endurance: { total: 0, gte3: 0, gte5: 0, gte6: 0 },
  madness: { total: 0, gte3: 0, gte5: 0, gte6: 0 },
  strength: { total: 0, gte3: 0, gte5: 0, gte6: 0 },
};

const allMonsters = new Set();
const monstersWithHighStats = new Set();
const nonLegendaryWith5Plus = new Set();
const nonLegendaryWithOver5 = new Set();

// Analyze all monsters from all races
data.forEach(race => {
  race.rankings.forEach(monster => {
    const monsterId = `${monster.name}-${JSON.stringify(monster.traits)}`;
    
    // Track unique monsters
    allMonsters.add(monsterId);
    
    const traits = monster.traits;
    const isLegendary = monster.legendary || false;
    let hasHighStat = false;
    let has5Plus = false;
    let hasOver5 = false;
    
    ['speed', 'endurance', 'madness', 'strength'].forEach(stat => {
      statCounts[stat].total++;
      
      if (traits[stat] >= 3) {
        statCounts[stat].gte3++;
        hasHighStat = true;
      }
      
      if (traits[stat] >= 5) {
        statCounts[stat].gte5++;
        has5Plus = true;
      }
      
      if (traits[stat] >= 6) {
        statCounts[stat].gte6++;
        hasOver5 = true;
      }
    });
    
    if (hasHighStat) {
      monstersWithHighStats.add(monsterId);
    }
    
    if (has5Plus && !isLegendary) {
      nonLegendaryWith5Plus.add(monsterId);
    }
    
    if (hasOver5 && !isLegendary) {
      nonLegendaryWithOver5.add(monsterId);
    }
  });
});

console.log('\n=== STAT ANALYSIS (10,000 races) ===\n');
console.log(`Total unique monsters encountered: ${allMonsters.size}`);
console.log(`Monsters with at least one stat ≥3: ${monstersWithHighStats.size} (${(monstersWithHighStats.size / allMonsters.size * 100).toFixed(1)}%)`);
console.log(`NON-LEGENDARY monsters with at least one stat ≥5: ${nonLegendaryWith5Plus.size} (${(nonLegendaryWith5Plus.size / allMonsters.size * 100).toFixed(1)}%)`);
console.log(`\n*** NON-LEGENDARY monsters with at least one stat >5 (6+, shows overflow bar): ${nonLegendaryWithOver5.size} (${(nonLegendaryWithOver5.size / allMonsters.size * 100).toFixed(2)}%) ***`);

console.log('\n--- Individual Stat Breakdown ---\n');

['speed', 'endurance', 'madness', 'strength'].forEach(stat => {
  const count = statCounts[stat];
  const pct3 = (count.gte3 / count.total * 100).toFixed(1);
  const pct5 = (count.gte5 / count.total * 100).toFixed(1);
  const pct6 = (count.gte6 / count.total * 100).toFixed(1);
  
  console.log(`${stat.toUpperCase()}:`);
  console.log(`  Value ≥3: ${count.gte3} / ${count.total} (${pct3}%)`);
  console.log(`  Value ≥5 (fills all bars): ${count.gte5} / ${count.total} (${pct5}%)`);
  console.log(`  Value ≥6 (overflow bar): ${count.gte6} / ${count.total} (${pct6}%)`);
});

// Distribution analysis
const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0 };

data.forEach(race => {
  race.rankings.forEach(monster => {
    ['speed', 'endurance', 'madness', 'strength'].forEach(stat => {
      const value = monster.traits[stat];
      if (value >= 1 && value <= 10) {
        distribution[value]++;
      }
    });
  });
});

console.log('\n--- Value Distribution (all stats combined) ---\n');
Object.entries(distribution).forEach(([value, count]) => {
  const total = Object.values(distribution).reduce((a, b) => a + b, 0);
  const pct = (count / total * 100).toFixed(1);
  const bar = '█'.repeat(Math.round(pct / 2));
  console.log(`${value}: ${count.toString().padStart(6)} (${pct.toString().padStart(4)}%) ${bar}`);
});

console.log('\n');
