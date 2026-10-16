/**
 * HeartMatch - Accurate Compatibility Score Calculator
 * Deterministic, multi-factor compatibility evaluation based on:
 * 1. Shared Interests & Hobbies (up to 38%)
 * 2. Relationship Goals / Looking For Alignment (up to 24%)
 * 3. Age Proximity & Age Preferences (up to 18%)
 * 4. Location Proximity (up to 12%)
 * 5. Profile Authenticity & Verification (up to 5%)
 * 6. Deterministic Chemistry Variance (+/- 3%) based on user IDs
 */

function calculateCompatibility(viewer, target) {
  if (!viewer || !target) return 72;

  // 1. Shared Interests & Hobbies (Weight: 38 points)
  const viewerInterests = Array.isArray(viewer.interests)
    ? viewer.interests.map(i => String(i).trim().toLowerCase()).filter(Boolean)
    : [];
  const targetInterests = Array.isArray(target.interests)
    ? target.interests.map(i => String(i).trim().toLowerCase()).filter(Boolean)
    : [];

  let interestScore = 0;
  if (viewerInterests.length > 0 && targetInterests.length > 0) {
    const shared = viewerInterests.filter(i => targetInterests.includes(i));
    const unionSize = new Set([...viewerInterests, ...targetInterests]).size;
    const jaccard = shared.length / (unionSize || 1);
    // Combine Jaccard ratio with direct shared count bonus
    interestScore = Math.min(38, Math.round(jaccard * 26 + shared.length * 4));
  } else if (viewerInterests.length === 0 && targetInterests.length === 0) {
    // Both profiles have not filled interests yet - neutral baseline
    interestScore = 18;
  } else {
    // One user listed interests, one hasn't yet
    interestScore = 14;
  }

  // 2. Relationship Goals / Looking For (Weight: 24 points)
  let intentScore = 0;
  const vIntent = String(viewer.lookingFor || "").toLowerCase().trim();
  const tIntent = String(target.lookingFor || "").toLowerCase().trim();

  if (vIntent && tIntent) {
    if (vIntent === tIntent && vIntent !== "any" && vIntent !== "not-sure") {
      intentScore = 24; // Perfect alignment (e.g. both want long-term, casual, or friends)
    } else if (vIntent === "any" || tIntent === "any" || vIntent === "not-sure" || tIntent === "not-sure") {
      intentScore = 17; // Flexible / open alignment
    } else {
      // Divergent intents (e.g. long-term vs casual)
      intentScore = 6;
    }
  } else {
    intentScore = 15; // Neutral when unstated
  }

  // 3. Age & Age Preferences (Weight: 18 points)
  let ageScore = 0;
  const vAge = Number(viewer.age) || 24;
  const tAge = Number(target.age) || 24;
  const prefs = viewer.preferences || {};
  const minAge = Number(prefs.minAge) || 18;
  const maxAge = Number(prefs.maxAge) || 99;

  if (tAge >= minAge && tAge <= maxAge) {
    const ageDiff = Math.abs(vAge - tAge);
    if (ageDiff <= 2) ageScore = 18;
    else if (ageDiff <= 5) ageScore = 16;
    else if (ageDiff <= 8) ageScore = 14;
    else ageScore = 12;
  } else {
    const diff = tAge < minAge ? (minAge - tAge) : (tAge - maxAge);
    ageScore = Math.max(3, 12 - diff * 3);
  }

  // 4. Location Proximity (Weight: 12 points)
  let locationScore = 0;
  const vLoc = String(viewer.location || "").toLowerCase().trim();
  const tLoc = String(target.location || "").toLowerCase().trim();

  if (vLoc && tLoc) {
    if (vLoc === tLoc || vLoc.includes(tLoc) || tLoc.includes(vLoc)) {
      locationScore = 12; // Same city or region
    } else {
      locationScore = 4; // Different locations
    }
  } else {
    locationScore = 7; // Undisclosed
  }

  // 5. Verification & Authenticity Bonus (Weight: 5 points)
  let authScore = 0;
  if (target.isVerified) authScore += 3;
  if (target.bio && target.bio.trim().length >= 20) authScore += 2;

  // 6. Deterministic Chemistry Variance (+/- 3%) based on user IDs
  // Ensures scores don't all look uniform or identical, but remains 100% consistent for any pair
  const idA = String(viewer._id || viewer.userId || viewer.id || "");
  const idB = String(target._id || target.userId || target.id || "");
  let hash = 0;
  for (let i = 0; i < idA.length; i++) hash = ((hash << 5) - hash + idA.charCodeAt(i)) | 0;
  for (let i = 0; i < idB.length; i++) hash = ((hash << 5) - hash + idB.charCodeAt(i)) | 0;
  const variance = (Math.abs(hash) % 7) - 3; // -3, -2, -1, 0, 1, 2, 3

  const total = interestScore + intentScore + ageScore + locationScore + authScore + variance;

  // Realistic bounds: 40% (minimal alignment) up to 98% (near-perfect match)
  return Math.min(98, Math.max(40, total));
}

module.exports = {
  calculateCompatibility
};
