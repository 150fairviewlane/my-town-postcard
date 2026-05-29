// Standalone script: populate zone_note (key cities) for all 96 GA territories.
// Usage: pnpm --filter @workspace/scripts run update:ga-zone-notes
//
// Idempotency: safe to re-run — uses ON CONFLICT DO UPDATE so existing values
// are overwritten with the canonical list below.
// Last-occurrence rule applied for IDs that appeared multiple times in the
// source data: GA-042, GA-045, GA-046, GA-047, GA-049.

import pg from "pg";

const { Pool } = pg;

const ZONE_NOTES: Record<string, string> = {
  // METRO ATLANTA
  "GA-001": "Alpharetta, Milton, Roswell, Johns Creek, Mountain Park",
  "GA-002": "Sandy Springs, Buckhead, Dunwoody, Brookhaven, Chamblee, Doraville",
  "GA-003": "Atlanta, Midtown, Inman Park, Grant Park, East Atlanta, Kirkwood",
  "GA-004": "Duluth, Peachtree Corners, Norcross, Berkeley Lake, Doraville",
  "GA-005": "Lawrenceville, Snellville, Lilburn, Stone Mountain, Tucker, Grayson",
  "GA-006": "Buford, Sugar Hill, Dacula, Braselton, Hoschton, Grayson, Loganville",
  "GA-007": "Marietta, Kennesaw, Acworth, Powder Springs, Woodstock",
  "GA-008": "Smyrna, Mableton, Powder Springs, Austell, Vinings, Clarkdale",
  "GA-009": "Decatur, Tucker, Clarkston, Avondale Estates, Scottdale, Panthersville",
  "GA-010": "Stonecrest, Lithonia, Redan, Ellenwood, Conyers area",
  // ATLANTA SUBURBS
  "GA-011": "Canton, Ball Ground, Holly Springs, Waleska, Nelson",
  "GA-012": "Cumming, Suwanee, South Forsyth, Gainesville area",
  "GA-013": "McDonough, Stockbridge, Hampton, Locust Grove, Lovejoy",
  "GA-014": "Jonesboro, Riverdale, Forest Park, College Park, Morrow, Lake City",
  "GA-015": "Dallas, Hiram, Douglasville area, Acworth area, Villa Rica area",
  "GA-016": "Douglasville, Lithia Springs, Villa Rica, Austell area",
  "GA-017": "Newnan, Senoia, Sharpsburg, Moreland, Turin",
  "GA-018": "Fayetteville, Peachtree City, Tyrone, Brooks, Woolsey",
  "GA-019": "Carrollton, Villa Rica, Whitesburg, Temple, Bowdon, Bremen",
  "GA-020": "Winder, Auburn, Bethlehem, Carl, Statham",
  "GA-021": "Conyers, Milstead, Olde Town Conyers",
  "GA-022": "Covington, Oxford, Mansfield, Porterdale, Social Circle",
  "GA-023": "Monroe, Social Circle, Loganville, Good Hope, Between",
  "GA-024": "Griffin, Orchard Hill, Sunny Side, Experiment, Williamson",
  "GA-025": "Jefferson, Commerce, Braselton, Hoschton, Pendergrass, Nicholson",
  "GA-096": "South Fulton, Union City, Fairburn, Palmetto, Chattahoochee Hills",
  // NORTH GEORGIA
  "GA-026": "Gainesville, Flowery Branch, Oakwood, Buford, Clermont, Gillsville",
  "GA-027": "Dalton, Tunnel Hill, Cohutta, Varnell, Rocky Face",
  "GA-028": "Cartersville, Adairsville, Emerson, Euharlee, Kingston, White",
  "GA-029": "Rome, Cave Spring, Armuchee, Shannon, Lindale, Coosa",
  "GA-030": "Ringgold, Fort Oglethorpe, Tunnel Hill, Graysville, Chickamauga",
  "GA-031": "LaFayette, Rock Spring, Chickamauga, Rossville, Trenton, Wildwood",
  "GA-032": "Calhoun, Resaca, Fairmount, Plainville, Ranger, Pine Log",
  "GA-033": "Athens, Winterville, Bogart, Watkinsville, Bishop",
  // MAJOR CITIES
  "GA-034": "Savannah, Pooler, Garden City, Port Wentworth, Bloomingdale, Thunderbolt",
  "GA-035": "Augusta, Hephzibah, Blythe, Gracewood",
  "GA-036": "Columbus, Midland, Upatoi, Fortson, Cataula",
  "GA-037": "Macon, Lizella, Payne City, Vineville, Bowman",
  "GA-038": "Warner Robins, Perry, Centerville, Byron, Kathleen, Bonaire",
  "GA-039": "Evans, Grovetown, Harlem, Martinez, Appling, Dearing",
  "GA-040": "Valdosta, Hahira, Lake Park, Remerton, Dasher, Clyattville",
  "GA-041": "Statesboro, Brooklet, Portal, Register, Metter area",
  // last-occurrence: Richmond Hill coastal zone (not Guyton/Rincon mix)
  "GA-042": "Richmond Hill, Pooler, Bloomingdale, Guyton, Rincon, Springfield",
  "GA-043": "Brunswick, St. Simons Island, Jekyll Island, Sea Island, Dock Junction",
  "GA-044": "Tifton, Omega, Ty Ty, Chula, Enigma, Brookfield",
  // last-occurrence: Coffee/Bacon county zone
  "GA-045": "Douglas, Nicholls, Broxton, Ambrose, Pearson area",
  // last-occurrence: Morgan/Putnam county zone
  "GA-046": "Madison, Eatonton, Buckhead, Rutledge, Newborn",
  // last-occurrence: Jasper/Jones county zone
  "GA-047": "Monticello, Gray, Juliette, Shady Dale, Round Oak",
  "GA-048": "Carnesville, Hartwell, Canon, Royston, Bowersville, Lavonia",
  // last-occurrence: Wilkes/Lincoln county zone
  "GA-049": "Washington, Lincolnton, Crawfordville, Gibson, Sparta area",
  "GA-050": "Blue Ridge, Ellijay, McCaysville, Morganton, Cherry Log",
  "GA-051": "Jasper, Dawsonville, Marble Hill, Nelson, Cherry Log",
  // NORTHEAST GA MOUNTAINS
  "GA-052": "Dahlonega, Cleveland, Helen, Suches, Turnersville, Auraria",
  "GA-053": "Chatsworth, Eton, Crandall, Cisco, Spring Place",
  "GA-054": "Buchanan, Bremen, Cedartown, Rockmart, Tallapoosa",
  "GA-055": "Lexington, Elberton, Crawford, Bowman, Maxeys",
  "GA-056": "Homer, Danielsville, Maysville, Commerce area, Harmony Grove",
  // COASTAL
  "GA-057": "Richmond Hill, Pemberton, Hinesville, Midway, Flemington, Walthourville",
  "GA-058": "Kingsland, St. Marys, Woodbine, White Oak",
  "GA-059": "Ludowici, Darien, Folkston, Nahunta, Jesup area",
  // MID-STATE / EAST CENTRAL
  "GA-060": "Evans, Grovetown, Harlem, Martinez, Thomson, Warrenton",
  "GA-061": "Thomson, Warrenton, Louisville, Wrens, Stapleton",
  "GA-062": "Zebulon, Barnesville, Thomaston, Milner, Concord",
  "GA-063": "Griffin, Jackson, Locust Grove area, Barnesville area",
  "GA-064": "Hamilton, Pine Mountain, Waverly Hall, Cataula, Ellerslie",
  "GA-065": "Franklin, Greenville, Warm Springs, Manchester, Talbotton, Geneva",
  "GA-066": "Milledgeville, Wrightsville, Sandersville, Sparta, Davidsboro",
  "GA-067": "Jeffersonville, Cochran, Dublin, Montrose, Dexter",
  "GA-068": "Vienna, Cordele, Arabi, Ashburn area",
  "GA-069": "Fort Valley, Roberta, Byron area, Marshallville, Ideal",
  "GA-070": "Milledgeville, Sandersville, Sparta, Wrightsville, Davidsboro",
  "GA-071": "Jeffersonville, Cochran, Dublin, Dexter, Montrose",
  "GA-072": "Vienna, Cordele, Unadilla, Byromville, Pinehurst",
  // SOUTH CENTRAL
  "GA-073": "Eastman, Mount Vernon, McRae-Helena, Chauncey, Lumber City",
  "GA-074": "Alamo, Soperton, Lyons, Vidalia, Ailey, Uvalda",
  "GA-075": "Rochelle, Hawkinsville, Irwinton, Abbeville, McRae area",
  "GA-076": "Oglethorpe, Butler, Buena Vista, Preston, Ideal",
  // SOUTHWEST GEORGIA
  "GA-077": "Albany, Leesburg, Radium Springs, Newton",
  "GA-078": "Americus, Ellaville, Plains, Leslie, Smithville",
  "GA-079": "Dawson, Leesburg, Smithville, Parrott, Sasser",
  "GA-080": "Cuthbert, Morgan, Fort Gaines, Georgetown, Shellman",
  "GA-081": "Lumpkin, Preston, Cusseta, Webster",
  "GA-082": "Blakely, Donalsonville, Colquitt, Newton, Jakin",
  "GA-083": "Bainbridge, Attapulgus, Climax, Brinson, Iron City",
  "GA-084": "Camilla, Moultrie, Norman Park, Berlin, Funston",
  "GA-085": "Sylvester, Ashburn, Isabella, Poulan, Warwick",
  "GA-086": "Thomasville, Quitman, Cairo, Coolidge, Meigs, Pavo",
  // SOUTH GEORGIA
  "GA-087": "Fitzgerald, Ocilla, Nashville, Alapaha, Enigma, Willacoochee",
  "GA-088": "Adel, Pearson, Lakeland, Homerville area, Hahira area",
  "GA-089": "Statenville, Homerville, Fargo, Argyle",
  "GA-090": "Swainsboro, Metter, Twin City, Adrian, Oak Park",
  "GA-091": "Sylvania, Millen, Newington, Oliver, Rocky Ford",
  "GA-092": "Claxton, Reidsville, Collins, Mount Vernon area, Glennville area",
  "GA-093": "Baxley, Hazlehurst, Alma area, Broxton area",
  "GA-094": "Jesup, Nahunta, Odum, Screven, Hickox",
  "GA-095": "Waycross, Blackshear, Alma, Manor, Hoboken, Offerman",
};

async function main() {
  const ids = Object.keys(ZONE_NOTES);
  if (ids.length !== 96) {
    throw new Error(`Expected 96 GA territory entries in ZONE_NOTES, found ${ids.length}. Check for missing or duplicate IDs.`);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const caseExpr = ids
    .map((id) => `WHEN $${ids.indexOf(id) * 2 + 1} THEN $${ids.indexOf(id) * 2 + 2}`)
    .join("\n      ");
  const idList = ids.map((_, i) => `$${i * 2 + 1}`).join(", ");
  const params: string[] = [];
  ids.forEach((id) => { params.push(id, ZONE_NOTES[id]); });

  const sql = `
    UPDATE territories
    SET zone_note = CASE id
      ${caseExpr}
    END
    WHERE id IN (${idList})
      AND state = 'GA'
  `;

  const client = await pool.connect();
  try {
    const result = await client.query(sql, params);
    console.log(`Updated ${result.rowCount} GA territories with zone_note data.`);

    const nullCheck = await client.query(
      `SELECT id FROM territories WHERE state = 'GA' AND (zone_note IS NULL OR zone_note = '') ORDER BY id`
    );
    if (nullCheck.rows.length === 0) {
      console.log("Verification passed: all GA territories have zone_note populated.");
    } else {
      console.warn("WARNING: these GA territories still have no zone_note:");
      nullCheck.rows.forEach((r) => console.warn(" ", r.id));
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
